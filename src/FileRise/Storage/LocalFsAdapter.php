<?php

declare(strict_types=1);

namespace FileRise\Storage;

use FileRise\Storage\StorageAdapterInterface;

// src/lib/LocalFsAdapter.php

require_once PROJECT_ROOT . '/src/lib/StorageAdapterInterface.php';

final class LocalFsAdapter implements StorageAdapterInterface
{
    public function isLocal(): bool
    {
        return true;
    }

    public function getLastError(): string
    {
        return '';
    }

    public function list(string $path): array
    {
        $items = @scandir($path);
        return ($items === false) ? [] : $items;
    }

    public function stat(string $path): ?array
    {
        $st = @stat($path);
        if ($st === false) {
            return null;
        }

        $type = 'other';
        if (@is_dir($path)) {
            $type = 'dir';
        } elseif (@is_file($path)) {
            $type = 'file';
        } elseif (@is_link($path)) {
            $type = 'link';
        }

        return [
            'type'  => $type,
            'size'  => isset($st['size']) ? (int)$st['size'] : 0,
            'mtime' => isset($st['mtime']) ? (int)$st['mtime'] : 0,
            'mode'  => isset($st['mode']) ? (int)$st['mode'] : 0,
        ];
    }

    public function read(string $path, ?int $length = null, int $offset = 0): string|false
    {
        if ($length === null) {
            return @file_get_contents($path);
        }

        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            return false;
        }
        if ($offset > 0) {
            @fseek($fh, $offset);
        }
        $data = ($length > 0) ? @fread($fh, $length) : '';
        @fclose($fh);

        return ($data === false) ? false : $data;
    }

    public function openReadStream(string $path, ?int $length = null, int $offset = 0)
    {
        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            return false;
        }
        if ($offset > 0) {
            @fseek($fh, $offset);
        }
        return $fh;
    }

    public function write(string $path, string $data, int $flags = 0): bool
    {
        return @file_put_contents($path, $data, $flags) !== false;
    }

    public function writeStream(string $path, $stream, ?int $length = null, ?string $mimeType = null): bool
    {
        if (!is_resource($stream)) {
            return false;
        }

        $out = @fopen($path, 'wb');
        if ($out === false) {
            return false;
        }

        $bytes = ($length === null)
            ? @stream_copy_to_stream($stream, $out)
            : @stream_copy_to_stream($stream, $out, $length);
        @fclose($out);

        return $bytes !== false;
    }

    public function move(string $from, string $to): bool
    {
        return @rename($from, $to);
    }

    public function copy(string $from, string $to): bool
    {
        return @copy($from, $to);
    }

    public function delete(string $path): bool
    {
        if (@is_dir($path)) {
            return @rmdir($path);
        }
        return @unlink($path);
    }

    public function mkdir(string $path, int $mode = 0775, bool $recursive = true): bool
    {
        if (@mkdir($path, $mode, $recursive)) {
            return true;
        }
        return @is_dir($path);
    }
}
