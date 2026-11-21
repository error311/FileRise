<?php

declare(strict_types=1);

namespace FileRise\Support;

use RuntimeException;

/** Coordinates readers and complete updates of the existing folder-share JSON file. */
final class FolderShareStore
{
    public static function read(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        $handle = @fopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Unable to read folder shares.');
        }
        try {
            if (!flock($handle, LOCK_SH)) {
                throw new RuntimeException('Unable to lock folder shares.');
            }
            return self::decode(self::contents($handle));
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    /** The operation receives the latest map by reference, while holding its exclusive lock. */
    public static function update(string $path, callable $operation): mixed
    {
        $handle = @fopen($path, 'c+b');
        if ($handle === false) {
            throw new RuntimeException('Unable to open folder shares.');
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException('Unable to lock folder shares.');
            }
            $original = self::contents($handle);
            $links = self::decode($original);
            $before = $links;
            $result = $operation($links);
            if ($links !== $before) {
                $json = json_encode($links, JSON_PRETTY_PRINT);
                if ($json === false) {
                    throw new RuntimeException('Unable to encode folder shares.');
                }
                if (!self::write($handle, $json)) {
                    if (!self::write($handle, $original)) {
                        error_log('FileRise: failed to restore folder shares after a write failure.');
                    }
                    throw new RuntimeException('Unable to save folder shares.');
                }
            }
            return $result;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public static function prune(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        return self::update($path, static function (array &$links): array {
            $now = time();
            foreach ($links as $token => $record) {
                if (!empty($record['expires']) && $record['expires'] < $now) {
                    unset($links[$token]);
                }
            }
            return $links;
        });
    }

    private static function decode(string $json): array
    {
        if ($json === '') {
            return [];
        }
        $links = json_decode($json, true);
        if (!is_array($links) || json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Invalid folder-share JSON.');
        }
        return $links;
    }

    /** @param resource $handle */
    private static function contents($handle): string
    {
        if (!rewind($handle) || ($contents = stream_get_contents($handle)) === false) {
            throw new RuntimeException('Unable to read folder shares.');
        }
        return $contents;
    }

    /** @param resource $handle */
    private static function write($handle, string $contents): bool
    {
        if (!rewind($handle)) {
            return false;
        }
        $length = strlen($contents);
        $offset = 0;
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
