<?php

declare(strict_types=1);

namespace FileRise\Support;

use RuntimeException;

/** Shared password-login counters, retaining the existing failed_logins.json format. */
final class LoginAttemptLimiter
{
    public const WINDOW_SECONDS = 1800;
    public const USER_LIMIT = 5;
    public const IP_LIMIT = 50;

    public static function verify(string $userKey, string $ipKey, callable $verify): array
    {
        $limits = [$userKey => self::USER_LIMIT, $ipKey => self::IP_LIMIT];
        $locked = static function (array &$state) use ($limits): bool {
            $now = time();
            foreach ($limits as $key => $limit) {
                $entry = $state[$key] ?? [];
                $last = (int)($entry['last_attempt'] ?? 0);
                if ($last <= 0 || $now - $last >= self::WINDOW_SECONDS) {
                    unset($state[$key]);
                } elseif ((int)($entry['count'] ?? 0) >= $limit) {
                    return true;
                }
            }
            return false;
        };

        if (self::update($locked)) {
            return ['status' => 'locked'];
        }

        // Password hashing must not serialize every user's WebDAV requests behind one file lock.
        $result = $verify();
        return self::update(static function (array &$state) use ($locked, $limits, $result): array {
            // A concurrent failure may have locked the account/IP while verification ran.
            if ($locked($state)) {
                return ['status' => 'locked'];
            }
            foreach ($limits as $key => $limit) {
                if (($result['status'] ?? '') === 'ok') {
                    unset($state[$key]);
                } else {
                    $state[$key] = [
                        'count' => (int)($state[$key]['count'] ?? 0) + 1,
                        'last_attempt' => time(),
                    ];
                }
            }
            return $result;
        });
    }

    private static function update(callable $operation): mixed
    {
        $path = rtrim((string)USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . 'failed_logins.json';
        $handle = @fopen($path, 'c+b');
        if ($handle === false) {
            throw new RuntimeException('Unable to open login attempt state.');
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException('Unable to lock login attempt state.');
            }
            $raw = stream_get_contents($handle);
            if ($raw === false) {
                throw new RuntimeException('Unable to read login attempt state.');
            }
            $state = $raw === '' ? [] : json_decode($raw, true);
            if (!is_array($state)) {
                throw new RuntimeException('Invalid login attempt state.');
            }
            $before = $state;
            $result = $operation($state);
            if ($before !== $state) {
                $encoded = json_encode($state, JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
                if ($encoded === false || !self::replace($handle, $encoded)) {
                    if (!self::replace($handle, $raw)) {
                        error_log('FileRise: unable to restore login attempt state after a write failure.');
                    }
                    throw new RuntimeException('Unable to save login attempt state.');
                }
            }
            return $result;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    /** @param resource $handle */
    private static function replace($handle, string $contents): bool
    {
        if (!@rewind($handle)) {
            return false;
        }
        $offset = 0;
        $length = strlen($contents);
        while ($offset < $length) {
            $written = @fwrite($handle, substr($contents, $offset));
            if ($written === false || $written === 0) {
                return false;
            }
            $offset += $written;
        }
        return @ftruncate($handle, $length) && @fflush($handle);
    }
}
