<?php

declare(strict_types=1);

namespace FileRise\Support;

use RuntimeException;
use Throwable;

final class TotpAttemptLimiter
{
    public const WINDOW_SECONDS = 900;
    public const ACCOUNT_LIMIT = 5;
    public const SOURCE_LIMIT = 50;

    private const STORE_FILE = 'totp_attempts.json';
    private const LOCK_FILE = '.totp_attempts.lock';

    /**
     * Reserve one verification attempt before checking a syntactically valid TOTP code.
     *
     * @return array{allowed:bool,retryAfter:int}
     */
    public static function beginAttempt(string $username, string $clientIp): array
    {
        $accountKey = self::accountKey($username);
        $sourceKey = self::sourceKey($clientIp);
        $now = time();

        return self::withLockedStore(
            static function (array &$attempts) use ($accountKey, $sourceKey, $now): array {
                self::pruneExpired($attempts, $now);

                $accountRetry = self::retryAfter($attempts, $accountKey, self::ACCOUNT_LIMIT, $now);
                $sourceRetry = self::retryAfter($attempts, $sourceKey, self::SOURCE_LIMIT, $now);
                $retryAfter = max($accountRetry, $sourceRetry);
                if ($retryAfter > 0) {
                    return ['allowed' => false, 'retryAfter' => $retryAfter];
                }

                self::increment($attempts, $accountKey, $now);
                self::increment($attempts, $sourceKey, $now);
                return ['allowed' => true, 'retryAfter' => 0];
            }
        );
    }

    public static function recordSuccess(
        string $username,
        string $clientIp,
        string $secret,
        int $timeSlice
    ): bool {
        if ($timeSlice <= 0 || $secret === '') {
            throw new RuntimeException('TOTP verification result is invalid.');
        }

        $accountKey = self::accountKey($username);
        $sourceKey = self::sourceKey($clientIp);
        $replayKey = self::replayKey($username);
        $secretHash = hash('sha256', $secret);

        return self::withLockedStore(
            static function (array &$attempts) use (
                $accountKey,
                $sourceKey,
                $replayKey,
                $secretHash,
                $timeSlice
            ): bool {
                $replay = $attempts[$replayKey] ?? null;
                if (
                    is_array($replay)
                    && hash_equals((string)($replay['secretHash'] ?? ''), $secretHash)
                    && $timeSlice <= (int)($replay['lastTimeSlice'] ?? 0)
                ) {
                    return false;
                }

                $attempts[$replayKey] = [
                    'secretHash' => $secretHash,
                    'lastTimeSlice' => $timeSlice,
                ];
                unset($attempts[$accountKey]);
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

    public static function clearAccount(string $username): void
    {
        $accountKey = self::accountKey($username);
        self::withLockedStore(
            static function (array &$attempts) use ($accountKey): bool {
                unset($attempts[$accountKey]);
                self::pruneExpired($attempts, time());
                return true;
            }
        );
    }

    private static function accountKey(string $username): string
    {
        return 'account:' . hash('sha256', strtolower(trim($username)));
    }

    private static function sourceKey(string $clientIp): string
    {
        $clientIp = trim($clientIp);
        return 'source:' . hash('sha256', $clientIp !== '' ? $clientIp : 'unknown');
    }

    private static function replayKey(string $username): string
    {
        return 'replay:' . hash('sha256', strtolower(trim($username)));
    }

    private static function increment(array &$attempts, string $key, int $now): void
    {
        $attempts[$key] = [
            'count' => (int)($attempts[$key]['count'] ?? 0) + 1,
            'lastAttempt' => $now,
        ];
    }

    private static function retryAfter(array $attempts, string $key, int $limit, int $now): int
    {
        $entry = $attempts[$key] ?? null;
        if (!is_array($entry) || (int)($entry['count'] ?? 0) < $limit) {
            return 0;
        }

        $lastAttempt = (int)($entry['lastAttempt'] ?? 0);
        return max(0, self::WINDOW_SECONDS - ($now - $lastAttempt));
    }

    private static function pruneExpired(array &$attempts, int $now): void
    {
        foreach ($attempts as $key => $entry) {
            if (str_starts_with((string)$key, 'replay:')) {
                continue;
            }
            $lastAttempt = is_array($entry) ? (int)($entry['lastAttempt'] ?? 0) : 0;
            if ($lastAttempt <= 0 || ($now - $lastAttempt) >= self::WINDOW_SECONDS) {
                unset($attempts[$key]);
            }
        }
    }

    /**
     * @template T
     * @param callable(array<string,array<string,int|string>> &):T $callback
     * @return T
     */
    private static function withLockedStore(callable $callback)
    {
        $usersDir = rtrim((string)USERS_DIR, "/\\");
        $storePath = $usersDir . DIRECTORY_SEPARATOR . self::STORE_FILE;
        $lockPath = $usersDir . DIRECTORY_SEPARATOR . self::LOCK_FILE;
        $lock = @fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('TOTP attempt limiter storage is unavailable.');
        }

        $tmpPath = '';
        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('TOTP attempt limiter lock is unavailable.');
            }

            $attempts = self::readStore($storePath);
            $result = $callback($attempts);
            $payload = json_encode($attempts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if ($payload === false) {
                throw new RuntimeException('TOTP attempt limiter state could not be encoded.');
            }

            $tmpPath = tempnam($usersDir, '.totp_attempts_');
            if ($tmpPath === false) {
                throw new RuntimeException('TOTP attempt limiter temporary file could not be created.');
            }
            self::writeFile($tmpPath, $payload);
            @chmod($tmpPath, 0600);
            if (!@rename($tmpPath, $storePath)) {
                throw new RuntimeException('TOTP attempt limiter state could not be committed.');
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

    /** @return array<string,array<string,int|string>> */
    private static function readStore(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        $raw = @file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            throw new RuntimeException('TOTP attempt limiter state could not be read.');
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('TOTP attempt limiter state is invalid.');
        }
        return $decoded;
    }

    private static function writeFile(string $path, string $payload): void
    {
        $handle = @fopen($path, 'wb');
        if ($handle === false) {
            throw new RuntimeException('TOTP attempt limiter state could not be written.');
        }
        try {
            $offset = 0;
            $length = strlen($payload);
            while ($offset < $length) {
                $written = fwrite($handle, substr($payload, $offset));
                if ($written === false || $written === 0) {
                    throw new RuntimeException('TOTP attempt limiter state could not be written.');
                }
                $offset += $written;
            }
            if (!fflush($handle)) {
                throw new RuntimeException('TOTP attempt limiter state could not be flushed.');
            }
            if (function_exists('fsync')) {
                @fsync($handle);
            }
        } finally {
            fclose($handle);
        }
    }
}
