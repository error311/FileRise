<?php
// src/webdav/FileRiseFile.php

namespace FileRise\WebDAV;

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../src/models/FileModel.php';

use Sabre\DAV\IFile;
use Sabre\DAV\INode;
use Sabre\DAV\Exception\Forbidden;
use FileModel;

class FileRiseFile implements IFile, INode {
    private string $path;

    public function __construct(string $path) {
        $this->path = $path;
    }

    // ── INode ───────────────────────────────────────────

    public function getName(): string {
        return basename($this->path);
    }

    public function getLastModified(): int {
        return filemtime($this->path);
    }

    public function delete(): void {
        $base   = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $rel    = substr($this->path, strlen($base));
        $parts  = explode(DIRECTORY_SEPARATOR, $rel);
        $file   = array_pop($parts);
        $folder = empty($parts) ? 'root' : $parts[0];
        FileModel::deleteFiles($folder, [$file]);
    }

    public function setName($newName): void {
        throw new Forbidden('Renaming files not supported');
    }

    // ── IFile ───────────────────────────────────────────

    public function get() {
        return fopen($this->path, 'rb');
    }

    public function put($data): ?string {
        // 1) Save incoming data
        file_put_contents(
            $this->path,
            is_resource($data) ? stream_get_contents($data) : (string)$data
        );

        // 2) Update metadata with CurrentUser
        $this->updateMetadata();

        // 3) Flush to client fast
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }

        return null; // no ETag
    }

    public function getSize(): int {
        return filesize($this->path);
    }

    public function getETag(): string {
        return '"' . md5($this->getLastModified() . $this->getSize()) . '"';
    }

    public function getContentType(): ?string {
        return mime_content_type($this->path) ?: null;
    }

    // ── Metadata helper ───────────────────────────────────

    private function updateMetadata(): void {
        $base     = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $rel      = substr($this->path, strlen($base));
        $parts    = explode(DIRECTORY_SEPARATOR, $rel);
        $fileName = array_pop($parts);
        $folder   = empty($parts) ? 'root' : $parts[0];

        $metaFile = META_DIR
            . ($folder === 'root'
               ? 'root_metadata.json'
               : str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json');

        $metadata = [];
        if (file_exists($metaFile)) {
            $decoded = json_decode(file_get_contents($metaFile), true);
            if (is_array($decoded)) {
                $metadata = $decoded;
            }
        }

        $now      = date(DATE_TIME_FORMAT);
        $uploaded = $metadata[$fileName]['uploaded'] ?? $now;
        $uploader = CurrentUser::get();

        $metadata[$fileName] = [
            'uploaded'  => $uploaded,
            'modified'  => $now,
            'uploader'  => $uploader,
        ];

        file_put_contents($metaFile, json_encode($metadata, JSON_PRETTY_PRINT));
    }
}