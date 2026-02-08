<?php

declare(strict_types=1);

namespace FileRise\Storage;

// src/lib/StorageAdapterInterface.php

interface StorageAdapterInterface
{
    /**
     * True when the adapter uses the local filesystem.
     */
    public function isLocal(): bool;

    /**
     * Optional error detail from the last adapter operation.
     */
    public function getLastError(): string;

    /**
     * List directory entries (raw names; includes dot entries if returned by backend).
     *
     * @return array<int, string>
     */
    public function list(string $path): array;

    /**
     * Return basic stats for a path or null if not found.
     *
     * @return array{type:string,size:int,mtime:int,mode:int}|null
     */
    public function stat(string $path): ?array;

    /**
     * Read file contents. If length is provided, read a bounded slice.
     */
    public function read(string $path, ?int $length = null, int $offset = 0): string|false;

    /**
     * Open a readable stream for a file (optionally bounded by offset/length).
     *
     * @return mixed Resource or stream-like object; false on failure.
     */
    public function openReadStream(string $path, ?int $length = null, int $offset = 0);

    /**
     * Write file contents.
     */
    public function write(string $path, string $data, int $flags = 0): bool;

    /**
     * Write file contents from a stream.
     *
     * @param mixed       $stream  Readable stream resource
     * @param int|null    $length  Optional byte length (helps multipart uploads)
     * @param string|null $mimeType Optional content type
     */
    public function writeStream(string $path, $stream, ?int $length = null, ?string $mimeType = null): bool;

    /**
     * Move/rename a path.
     */
    public function move(string $from, string $to): bool;

    /**
     * Copy a path.
     */
    public function copy(string $from, string $to): bool;

    /**
     * Delete a file or (empty) directory.
     */
    public function delete(string $path): bool;

    /**
     * Create a directory path.
     */
    public function mkdir(string $path, int $mode = 0775, bool $recursive = true): bool;
}
