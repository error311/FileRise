<?php

declare(strict_types=1);

namespace FileRise\Support;

use RuntimeException;

/** Coordinates access to the existing users.txt file without changing its format or inode. */
final class UserFileStore
{
    /** @var resource|null */
    private static $writer = null;

    public static function path(): string
    {
        return rtrim((string)USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . USERS_FILE;
    }

    public static function withExclusiveLock(callable $operation, bool $create = false): mixed
    {
        if (is_resource(self::$writer)) {
            return $operation();
        }

        $handle = @fopen(self::path(), $create ? 'c+b' : 'r+b');
        if ($handle === false) {
            throw new RuntimeException('Unable to open users file.');
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException('Unable to lock users file.');
            }
            self::$writer = $handle;
            return $operation();
        } finally {
            self::$writer = null;
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public static function read(): string
    {
        if (is_resource(self::$writer)) {
            return self::readHandle(self::$writer);
        }

        $handle = @fopen(self::path(), 'rb');
        if ($handle === false) {
            throw new RuntimeException('Unable to open users file.');
        }
        try {
            if (!flock($handle, LOCK_SH)) {
                throw new RuntimeException('Unable to lock users file.');
            }
            return self::readHandle($handle);
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public static function readLines(int $flags = FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES): array
    {
        $lines = preg_split('/(?<=\n)/', self::read(), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $result = [];
        foreach ($lines as $line) {
            if (($flags & FILE_IGNORE_NEW_LINES) !== 0) {
                $line = rtrim($line, "\r\n");
            }
            if (($flags & FILE_SKIP_EMPTY_LINES) !== 0 && rtrim($line, "\r\n") === '') {
                continue;
            }
            $result[] = $line;
        }
        return $result;
    }

    /** Call only inside withExclusiveLock; readers share the same file lock. */
    public static function write(string $contents): bool
    {
        if (!is_resource(self::$writer)) {
            throw new RuntimeException('Users file update requires an exclusive lock.');
        }
        $original = self::readHandle(self::$writer);
        if (self::replaceContents(self::$writer, $contents)) {
            return true;
        }
        if (!self::replaceContents(self::$writer, $original)) {
            error_log('FileRise: failed to restore users file after a write failure.');
        }
        return false;
    }

    /** @param resource $handle */
    private static function readHandle($handle): string
    {
        if (!rewind($handle)) {
            throw new RuntimeException('Unable to read users file.');
        }
        $contents = stream_get_contents($handle);
        if ($contents === false) {
            throw new RuntimeException('Unable to read users file.');
        }
        return $contents;
    }

    /** @param resource $handle */
    private static function replaceContents($handle, string $contents): bool
    {
        if (!rewind($handle)) {
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
