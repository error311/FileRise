<?php
namespace FileRise\WebDAV;

//src/webdav/FileRiseDirectory.php

require_once __DIR__ . '/../../config/config.php';      // constants + loadUserPermissions()
require_once __DIR__ . '/../../vendor/autoload.php';    // SabreDAV
require_once __DIR__ . '/../../src/lib/ACL.php';
require_once __DIR__ . '/../../src/models/FolderModel.php';
require_once __DIR__ . '/../../src/models/FileModel.php';
require_once __DIR__ . '/../../src/models/FolderCrypto.php';
require_once __DIR__ . '/FileRiseFile.php';

use Sabre\DAV\ICollection;
use Sabre\DAV\INode;
use Sabre\DAV\Exception\NotFound;
use Sabre\DAV\Exception\Forbidden;

class FileRiseDirectory implements ICollection, INode {
    private string $path;
    private string $user;
    private bool   $isAdmin;
    private array  $perms;

    /** cache of folder => metadata array */
    private array $metaCache = [];

    /**
     * @param string $path   Absolute filesystem path (no trailing slash)
     * @param string $user   Authenticated username
     * @param bool   $isAdmin
     * @param array  $perms  user-permissions map (readOnly, disableUpload, bypassOwnership, etc.)
     */
    public function __construct(string $path, string $user, bool $isAdmin, array $perms) {
        $this->path    = rtrim($path, '/\\');
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
        throw new Forbidden('Cannot delete directories via WebDAV');
    }

    public function setName($name): void {
        throw new Forbidden('Renaming directories is not supported');
    }

    // ── ICollection ────────────────────────────────────

    public function getChildren(): array {
        // Determine “folder key” relative to UPLOAD_DIR for ACL checks
        $folderKey = $this->folderKeyForPath($this->path);

        // Hard-block WebDAV access inside encrypted folders (and descendants)
        if (\FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }

        // Check view permission on *this* directory
        $canFull  = \ACL::canRead($this->user, $this->perms, $folderKey);
        $canOwn   = \ACL::hasGrant($this->user, $folderKey, 'read_own');
        if (!$this->isAdmin && !$canFull && !$canOwn) {
            throw new Forbidden('No view access to this folder');
        }

        $nodes = [];
        $hide = ['trash','profile_pics']; // internal dirs to hide
        foreach (new \DirectoryIterator($this->path) as $item) {
            if ($item->isDot()) continue;
            $name = $item->getFilename();
            if (in_array(strtolower($name), $hide, true)) continue;

            $full = $item->getPathname();

            if ($item->isDir()) {
                // Decide if the *child folder* should be visible
                $childKey  = $this->folderKeyForPath($full);
                $canChild  = $this->isAdmin
                          || \ACL::canRead($this->user, $this->perms, $childKey)
                          || \ACL::hasGrant($this->user, $childKey, 'read_own');

                if ($canChild) {
                    $nodes[] = new self($full, $this->user, $this->isAdmin, $this->perms);
                }
                continue;
            }

            // File in this directory: only list if full-view OR (own-only AND owner)
            if ($canFull || $this->fileIsOwnedByUser($folderKey, $name)) {
                $nodes[] = new FileRiseFile($full, $this->user, $this->isAdmin, $this->perms);
            }
        }

        return array_values($nodes);
    }

    public function childExists($name): bool {
        $full = $this->path . DIRECTORY_SEPARATOR . $name;
        if (!file_exists($full)) return false;

        $folderKey = $this->folderKeyForPath($this->path);
        $isDir     = is_dir($full);

        if (\FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            return false;
        }

        if ($isDir) {
            $childKey = $this->folderKeyForPath($full);
            if (\FolderCrypto::isEncryptedOrAncestor($childKey)) {
                return false;
            }
            return $this->isAdmin
                || \ACL::canRead($this->user, $this->perms, $childKey)
                || \ACL::hasGrant($this->user, $childKey, 'read_own');
        }

        // file
        $canFull = $this->isAdmin || \ACL::canRead($this->user, $this->perms, $folderKey);
        if ($canFull) return true;

        return \ACL::hasGrant($this->user, $folderKey, 'read_own')
            && $this->fileIsOwnedByUser($folderKey, $name);
    }

    public function getChild($name): INode {
        $full = $this->path . DIRECTORY_SEPARATOR . $name;
        if (!file_exists($full)) throw new NotFound("Not found: $name");

        $folderKey = $this->folderKeyForPath($this->path);
        if (\FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }
        if (is_dir($full)) {
            $childKey = $this->folderKeyForPath($full);
            if (\FolderCrypto::isEncryptedOrAncestor($childKey)) {
                throw new Forbidden('WebDAV is disabled inside encrypted folders');
            }
            $canDir = $this->isAdmin
                   || \ACL::canRead($this->user, $this->perms, $childKey)
                   || \ACL::hasGrant($this->user, $childKey, 'read_own');
            if (!$canDir) throw new Forbidden('No view access to requested folder');
            return new self($full, $this->user, $this->isAdmin, $this->perms);
        }

        // file
        $canFull = $this->isAdmin || \ACL::canRead($this->user, $this->perms, $folderKey);
        if (!$canFull) {
            if (!\ACL::hasGrant($this->user, $folderKey, 'read_own') || !$this->fileIsOwnedByUser($folderKey, $name)) {
                throw new Forbidden('No view access to requested file');
            }
        }
        return new FileRiseFile($full, $this->user, $this->isAdmin, $this->perms);
    }

    public function createFile($name, $data = null): INode {
        $folderKey = $this->folderKeyForPath($this->path);

        if (\FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }

        if (!$this->isAdmin && !\ACL::canWrite($this->user, $this->perms, $folderKey)) {
            throw new Forbidden('No write access to this folder');
        }
        if (!empty($this->perms['disableUpload']) && !$this->isAdmin) {
            throw new Forbidden('Uploads are disabled for your account');
        }

        // Write directly to FS, then ensure metadata via FileRiseFile::put()
        $full    = $this->path . DIRECTORY_SEPARATOR . $name;
        $content = is_resource($data) ? stream_get_contents($data) : (string)$data;

        // Let FileRiseFile handle metadata & overwrite semantics
        $fileNode = new FileRiseFile($full, $this->user, $this->isAdmin, $this->perms);
        $fileNode->put($content);

        return $fileNode;
    }

    public function createDirectory($name): INode {
        $parentKey = $this->folderKeyForPath($this->path);
        if (\FolderCrypto::isEncryptedOrAncestor($parentKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }
        if (!$this->isAdmin && !\ACL::canManage($this->user, $this->perms, $parentKey)) {
                        throw new Forbidden('No permission to create subfolders here');
            }

        $full = $this->path . DIRECTORY_SEPARATOR . $name;
        if (!is_dir($full)) {
            @mkdir($full, 0755, true);
        }

        // FileRise folder bookkeeping (owner = creator)
        $rel    = $this->relFromUploads($full);
        $parent = dirname(str_replace('\\','/',$rel));
        if ($parent === '.' || $parent === '/') $parent = '';
        \FolderModel::createFolder($name, $parent, $this->user);

        return new self($full, $this->user, $this->isAdmin, $this->perms);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function folderKeyForPath(string $absPath): string {
        $base = rtrim(UPLOAD_DIR, '/\\');
        $realBase = realpath($base) ?: $base;
        $real     = realpath($absPath) ?: $absPath;

        if (stripos($real, $realBase) !== 0) return 'root';
        $rel = ltrim(str_replace('\\','/', substr($real, strlen($realBase))), '/');
        return ($rel === '' ? 'root' : $rel);
    }

    private function relFromUploads(string $absPath): string {
        $base = rtrim(UPLOAD_DIR, '/\\');
        return ltrim(str_replace('\\','/', substr($absPath, strlen($base))), '/');
    }

    private function loadMeta(string $folderKey): array {
        if (isset($this->metaCache[$folderKey])) return $this->metaCache[$folderKey];

        $metaFile = META_DIR . (
            $folderKey === 'root'
                ? 'root_metadata.json'
                : str_replace(['/', '\\', ' '], '-', $folderKey) . '_metadata.json'
        );

        $data = [];
        if (is_file($metaFile)) {
            $decoded = json_decode(@file_get_contents($metaFile), true);
            if (is_array($decoded)) $data = $decoded;
        }
        return $this->metaCache[$folderKey] = $data;
    }

    private function fileIsOwnedByUser(string $folderKey, string $fileName): bool {
        $meta = $this->loadMeta($folderKey);
        return isset($meta[$fileName]['uploader'])
            && strcasecmp((string)$meta[$fileName]['uploader'], $this->user) === 0;
    }
}
