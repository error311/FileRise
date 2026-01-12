<?php
// src/lib/ReadOnlyAdapter.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/src/lib/StorageAdapterInterface.php';

final class ReadOnlyAdapter implements StorageAdapterInterface
{
    private StorageAdapterInterface $inner;

    public function __construct(StorageAdapterInterface $inner)
    {
        $this->inner = $inner;
    }

    public function isLocal(): bool
    {
        return $this->inner->isLocal();
    }

    public function list(string $path): array
    {
        return $this->inner->list($path);
    }

    public function stat(string $path): ?array
    {
        return $this->inner->stat($path);
    }

    public function read(string $path, ?int $length = null, int $offset = 0): string|false
    {
        return $this->inner->read($path, $length, $offset);
    }

    public function openReadStream(string $path, ?int $length = null, int $offset = 0)
    {
        return $this->inner->openReadStream($path, $length, $offset);
    }

    public function write(string $path, string $data, int $flags = 0): bool
    {
        return false;
    }

    public function writeStream(string $path, $stream, ?int $length = null, ?string $mimeType = null): bool
    {
        return false;
    }

    public function move(string $from, string $to): bool
    {
        return false;
    }

    public function copy(string $from, string $to): bool
    {
        return false;
    }

    public function delete(string $path): bool
    {
        return false;
    }

    public function mkdir(string $path, int $mode = 0775, bool $recursive = true): bool
    {
        return false;
    }
}
