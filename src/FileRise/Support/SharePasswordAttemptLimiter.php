<?php

declare(strict_types=1);

namespace FileRise\Support;

use RuntimeException;
use Throwable;

final class SharePasswordAttemptLimiter
{
    public const WINDOW_SECONDS = 900;
    public const SHARE_SOURCE_LIMIT = 5;
    public const SOURCE_LIMIT = 50;

    private const STORE_FILE = 'share_password_attempts.json';
    private const LOCK_FILE = '.share_password_attempts.lock';

    /**
     * Reserve one password-verification attempt before checking the password.
     *
     * @return array{allowed:bool,retryAfter:int}
     */
    public static function beginAttempt(string $shareToken, string $clientIp): array
    {
        $shareToken = trim($shareToken);
        if ($shareToken === '') {
            throw new RuntimeException('Share password limiter token is invalid.');
        }

        $shareSourceKey = self::shareSourceKey($shareToken, $clientIp);
        $sourceKey = self::sourceKey($clientIp);
        $now = time();

        return self::withLockedStore(
            static function (array &$attempts) use ($shareSourceKey, $sourceKey, $now): array {
                self::pruneExpired($attempts, $now);

                $shareRetry = self::retryAfter(
                    $attempts,
                    $shareSourceKey,
                    self::SHARE_SOURCE_LIMIT,
                    $now
                );
                $sourceRetry = self::retryAfter($attempts, $sourceKey, self::SOURCE_LIMIT, $now);
                $retryAfter = max($shareRetry, $sourceRetry);
                if ($retryAfter > 0) {
                    return ['allowed' => false, 'retryAfter' => $retryAfter];
                }

                self::increment($attempts, $shareSourceKey, $now);
                self::increment($attempts, $sourceKey, $now);
                return ['allowed' => true, 'retryAfter' => 0];
            }
        );
    }

    public static function recordSuccess(string $shareToken, string $clientIp): void
    {
        $shareToken = trim($shareToken);
        if ($shareToken === '') {
            throw new RuntimeException('Share password limiter token is invalid.');
        }

        $shareSourceKey = self::shareSourceKey($shareToken, $clientIp);
        $sourceKey = self::sourceKey($clientIp);
        self::withLockedStore(
            static function (array &$attempts) use ($shareSourceKey, $sourceKey): bool {
                unset($attempts[$shareSourceKey]);

                $sourceCount = (int)($attempts[$sourceKey]['count'] ?? 0);
                if ($sourceCount <= 1) {
                    unset($attempts[$sourceKey]);
                } else {
                    $attempts[$sourceKey]['count'] = $sourceCount - 1;
                }
                self::pruneExpired($attempts, time());
                return true;
            }
        );
    }

    private static function shareSourceKey(string $shareToken, string $clientIp): string
    {
        return 'share_source:' . hash('sha256', $shareToken . "\0" . self::normalizeClientIp($clientIp));
    }

    private static function sourceKey(string $clientIp): string
    {
        return 'source:' . hash('sha256', self::normalizeClientIp($clientIp));
    }

    private static function normalizeClientIp(string $clientIp): string
    {
        $clientIp = trim($clientIp);
        return $clientIp !== '' ? $clientIp : 'unknown';
    }

    /** @param array<string,array<string,int>> $attempts */
    private static function increment(array &$attempts, string $key, int $now): void
    {
        $attempts[$key] = [
            'count' => (int)($attempts[$key]['count'] ?? 0) + 1,
            'lastAttempt' => $now,
        ];
    }

    /** @param array<string,array<string,int>> $attempts */
    private static function retryAfter(array $attempts, string $key, int $limit, int $now): int
    {
        $entry = $attempts[$key] ?? null;
        if (!is_array($entry) || (int)($entry['count'] ?? 0) < $limit) {
            return 0;
        }

        $lastAttempt = (int)($entry['lastAttempt'] ?? 0);
        return max(0, self::WINDOW_SECONDS - ($now - $lastAttempt));
    }

    /** @param array<string,array<string,int>> $attempts */
    private static function pruneExpired(array &$attempts, int $now): void
    {
        foreach ($attempts as $key => $entry) {
            $lastAttempt = is_array($entry) ? (int)($entry['lastAttempt'] ?? 0) : 0;
            if ($lastAttempt <= 0 || ($now - $lastAttempt) >= self::WINDOW_SECONDS) {
                unset($attempts[$key]);
            }
        }
    }

    /**
     * @template T
     * @param callable(array<string,array<string,int>> &):T $callback
     * @return T
     */
    private static function withLockedStore(callable $callback)
    {
        $usersDir = rtrim((string)USERS_DIR, "/\\");
        $storePath = $usersDir . DIRECTORY_SEPARATOR . self::STORE_FILE;
        $lockPath = $usersDir . DIRECTORY_SEPARATOR . self::LOCK_FILE;
        $lock = @fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('Share password limiter storage is unavailable.');
        }

        $tmpPath = '';
        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Share password limiter lock is unavailable.');
            }

            $attempts = self::readStore($storePath);
            $result = $callback($attempts);
            $payload = json_encode($attempts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if ($payload === false) {
                throw new RuntimeException('Share password limiter state could not be encoded.');
            }

            $tmpPath = tempnam($usersDir, '.share_password_attempts_');
            if ($tmpPath === false) {
                throw new RuntimeException('Share password limiter temporary file could not be created.');
            }
            self::writeFile($tmpPath, $payload);
            @chmod($tmpPath, 0600);
            if (!@rename($tmpPath, $storePath)) {
                throw new RuntimeException('Share password limiter state could not be committed.');
            }
            $tmpPath = '';

            return $result;
        } catch (Throwable $e) {
            if ($tmpPath !== '') {
                @unlink($tmpPath);
            }
            throw $e;
        } finally {
            @flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** @return array<string,array<string,int>> */
    private static function readStore(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        $raw = @file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            throw new RuntimeException('Share password limiter state could not be read.');
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Share password limiter state is invalid.');
        }
        return $decoded;
    }

    private static function writeFile(string $path, string $payload): void
    {
        $handle = @fopen($path, 'wb');
        if ($handle === false) {
            throw new RuntimeException('Share password limiter state could not be written.');
        }
        try {
            $offset = 0;
            $length = strlen($payload);
            while ($offset < $length) {
                $written = fwrite($handle, substr($payload, $offset));
                if ($written === false || $written === 0) {
                    throw new RuntimeException('Share password limiter state could not be written.');
                }
                $offset += $written;
            }
            if (!fflush($handle)) {
                throw new RuntimeException('Share password limiter state could not be flushed.');
            }
            if (function_exists('fsync')) {
                @fsync($handle);
            }
        } finally {
            fclose($handle);
        }
    }
}
