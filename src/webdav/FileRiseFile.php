<?php
// src/webdav/FileRiseFile.php

namespace FileRise\WebDAV;

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../src/lib/ACL.php';
require_once __DIR__ . '/../../src/models/FileModel.php';
require_once __DIR__ . '/CurrentUser.php';

use Sabre\DAV\IFile;
use Sabre\DAV\INode;
use Sabre\DAV\Exception\Forbidden;

class FileRiseFile implements IFile, INode {
    private string $path;
    private string $user;
    private bool   $isAdmin;
    private array  $perms;

    public function __construct(string $path, string $user, bool $isAdmin, array $perms) {
        $this->path    = $path;
        $this->user    = $user;
        $this->isAdmin = $isAdmin;
        $this->perms   = $perms;
    }

    // ── INode ───────────────────────────────────────────

    public function getName(): string {
        return basename($this->path);
    }

    public function getLastModified(): int {
        return @filemtime($this->path) ?: time();
    }

    public function delete(): void {
        [$folderKey, $fileName] = $this->split();
    
        if (!$this->isAdmin && !\ACL::canDelete($this->user, $this->perms, $folderKey)) {
            throw new Forbidden('No delete permission in this folder');
        }
        if (!$this->canTouchOwnership($folderKey, $fileName)) {
            throw new Forbidden('You do not own this file');
        }
        \FileModel::deleteFiles($folderKey, [$fileName]);
    }

    public function setName($newName): void {
        throw new Forbidden('Renaming files via WebDAV is not supported');
    }

    // ── IFile ───────────────────────────────────────────

    public function get() {
        [$folderKey, $fileName] = $this->split();
        $canFull = $this->isAdmin || \ACL::canRead($this->user, $this->perms, $folderKey);
        if (!$canFull) {
            // own-only?
            if (!\ACL::hasGrant($this->user, $folderKey, 'read_own') || !$this->isOwner($folderKey, $fileName)) {
                throw new Forbidden('No view access to this file');
            }
        }
        return fopen($this->path, 'rb');
    }

    public function put($data): ?string {
        [$folderKey, $fileName] = $this->split();
    
        $exists = is_file($this->path);
    
        if (!$this->isAdmin) {
            // uploads disabled blocks both create & overwrite
            if (!empty($this->perms['disableUpload'])) {
                throw new Forbidden('Uploads are disabled for your account');
            }
            // granular gates
            if ($exists) {
                if (!\ACL::canEdit($this->user, $this->perms, $folderKey)) {
                    throw new Forbidden('No edit permission in this folder');
                }
            } else {
                if (!\ACL::canUpload($this->user, $this->perms, $folderKey)) {
                    throw new Forbidden('No upload permission in this folder');
                }
            }
        }
    
        // Ownership on overwrite (unless admin/bypass)
        $bypass = !empty($this->perms['bypassOwnership']) || $this->isAdmin;
        if ($exists && !$bypass && !$this->isOwner($folderKey, $fileName)) {
            throw new Forbidden('You do not own the target file');
        }
    
        // write + metadata (unchanged)
        file_put_contents(
            $this->path,
            is_resource($data) ? stream_get_contents($data) : (string)$data
        );
        $this->updateMetadata($folderKey, $fileName);
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        return null;
    }

    public function getSize(): int {
        return @filesize($this->path) ?: 0;
    }

    public function getETag(): string {
        return '"' . md5(($this->getLastModified() ?: 0) . ':' . ($this->getSize() ?: 0)) . '"';
    }

    public function getContentType(): ?string {
        return @mime_content_type($this->path) ?: null;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function split(): array {
        $base   = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $rel    = ltrim(str_replace('\\','/', substr($this->path, strlen($base))), '/');
        $parts  = explode('/', $rel);
        $file   = array_pop($parts);
        $folder = empty($parts) ? 'root' : implode('/', $parts);
        return [$folder, $file];
    }

    private function metaFile(string $folderKey): string {
        return META_DIR . (
            $folderKey === 'root'
                ? 'root_metadata.json'
                : str_replace(['/', '\\', ' '], '-', $folderKey) . '_metadata.json'
        );
    }

    private function loadMeta(string $folderKey): array {
        $mf = $this->metaFile($folderKey);
        if (!is_file($mf)) return [];
        $d = json_decode(@file_get_contents($mf), true);
        return is_array($d) ? $d : [];
    }

    private function saveMeta(string $folderKey, array $meta): void {
        @file_put_contents($this->metaFile($folderKey), json_encode($meta, JSON_PRETTY_PRINT));
    }

    private function isOwner(string $folderKey, string $fileName): bool {
        $meta = $this->loadMeta($folderKey);
        return isset($meta[$fileName]['uploader']) &&
               strcasecmp((string)$meta[$fileName]['uploader'], $this->user) === 0;
    }

    private function canTouchOwnership(string $folderKey, string $fileName): bool {
        if ($this->isAdmin || !empty($this->perms['bypassOwnership'])) return true;
        return $this->isOwner($folderKey, $fileName);
    }

    private function updateMetadata(string $folderKey, string $fileName): void {
        $meta     = $this->loadMeta($folderKey);
        $now      = date(DATE_TIME_FORMAT);
        $uploaded = $meta[$fileName]['uploaded'] ?? $now;
        $uploader = CurrentUser::get() ?: $this->user;

        $meta[$fileName] = [
            'uploaded' => $uploaded,
            'modified' => $now,
            'uploader' => $uploader,
        ];
        $this->saveMeta($folderKey, $meta);
    }
}