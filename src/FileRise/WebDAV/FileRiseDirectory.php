<?php

namespace FileRise\WebDAV;

use FileRise\Support\ACL;
use FileRise\Support\AuditHook;
use FileRise\Support\FS;
use FileRise\Support\LogicalPathPolicy;
use FileRise\Support\MetadataPath;
use FileRise\Domain\FileModel;
use FileRise\Domain\FolderCrypto;
use FileRise\Domain\FolderModel;
use FileRise\WebDAV\FileRiseFile;
use Sabre\DAV\ICollection;
use Sabre\DAV\INode;
use Sabre\DAV\Exception\NotFound;
use Sabre\DAV\Exception\Forbidden;

//src/webdav/FileRiseDirectory.php

require_once dirname(__DIR__, 3) . '/config/config.php';      // constants + loadUserPermissions()
require_once dirname(__DIR__, 3) . '/vendor/autoload.php';    // SabreDAV
require_once dirname(__DIR__, 3) . '/src/lib/ACL.php';
require_once dirname(__DIR__, 3) . '/src/lib/AuditHook.php';
require_once __DIR__ . '/FileRiseFile.php';


class FileRiseDirectory implements ICollection, INode
{
    private string $path;
    private string $user;
    private bool $isAdmin;
    private array $perms;

    /** cache of folder => metadata array */
    private array $metaCache = [];

    /**
     * @param string $path   Absolute filesystem path (no trailing slash)
     * @param string $user   Authenticated username
     * @param bool   $isAdmin
     * @param array  $perms  user-permissions map (readOnly, disableUpload, bypassOwnership, etc.)
     */
    public function __construct(string $path, string $user, bool $isAdmin, array $perms)
    {
        $this->path    = rtrim($path, '/\\');
        $this->user    = $user;
        $this->isAdmin = $isAdmin;
        $this->perms   = $perms;
    }

    // ── INode ───────────────────────────────────────────

    public function getName(): string
    {
        return basename($this->path);
    }

    public function getLastModified(): int
    {
        return @filemtime($this->path) ?: time();
    }

    public function delete(): void
    {
        throw new Forbidden('Cannot delete directories via WebDAV');
    }

    public function setName($name): void
    {
        throw new Forbidden('Renaming directories is not supported');
    }

    // ── ICollection ────────────────────────────────────

    public function getChildren(): array
    {
        // Determine “folder key” relative to UPLOAD_DIR for ACL checks
        $folderKey = $this->folderKeyForPath($this->path);

        // Hard-block WebDAV access inside encrypted folders (and descendants)
        if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }

        // Check view permission on *this* directory
        $canFull  = ACL::canRead($this->user, $this->perms, $folderKey);
        $canOwn   = ACL::hasGrant($this->user, $folderKey, 'read_own');
        if (!$this->isAdmin && !$canFull && !$canOwn) {
            throw new Forbidden('No view access to this folder');
        }

        $nodes = [];
        $hide = ['trash','profile_pics']; // internal dirs to hide
        foreach (new \DirectoryIterator($this->path) as $item) {
            if ($item->isDot()) {
                continue;
            }
            $name = $item->getFilename();
            if (in_array(strtolower($name), $hide, true)) {
                continue;
            }

            $full = $item->getPathname();


            if ($item->isDir()) {
                // Decide if the *child folder* should be visible
                $childKey  = $this->folderKeyForPath($full);
                $canChild  = $this->isAdmin
                          || ACL::canRead($this->user, $this->perms, $childKey)
                          || ACL::hasGrant($this->user, $childKey, 'read_own');

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

    public function childExists($name): bool
    {
        $full = $this->childPath((string)$name);
        if (!file_exists($full)) {
            return false;
        }

        $folderKey = $this->folderKeyForPath($this->path);
        $isDir     = is_dir($full);

        if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            return false;
        }

        if ($isDir) {
            $childKey = $this->folderKeyForPath($full);
            if (FolderCrypto::isEncryptedOrAncestor($childKey)) {
                return false;
            }
            return $this->isAdmin
                || ACL::canRead($this->user, $this->perms, $childKey)
                || ACL::hasGrant($this->user, $childKey, 'read_own');
        }

        // file
        $canFull = $this->isAdmin || ACL::canRead($this->user, $this->perms, $folderKey);
        if ($canFull) {
            return true;
        }

        return ACL::hasGrant($this->user, $folderKey, 'read_own')
            && $this->fileIsOwnedByUser($folderKey, $name);
    }

    public function getChild($name): INode
    {
        $full = $this->childPath((string)$name);
        if (!file_exists($full)) {
            throw new NotFound("Not found: $name");
        }

        $folderKey = $this->folderKeyForPath($this->path);
        if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }
        if (is_dir($full)) {
            $childKey = $this->folderKeyForPath($full);
            if (FolderCrypto::isEncryptedOrAncestor($childKey)) {
                throw new Forbidden('WebDAV is disabled inside encrypted folders');
            }
            $canDir = $this->isAdmin
                   || ACL::canRead($this->user, $this->perms, $childKey)
                   || ACL::hasGrant($this->user, $childKey, 'read_own');
            if (!$canDir) {
                throw new Forbidden('No view access to requested folder');
            }
            return new self($full, $this->user, $this->isAdmin, $this->perms);
        }

        // file
        $canFull = $this->isAdmin || ACL::canRead($this->user, $this->perms, $folderKey);
        if (!$canFull) {
            if (!ACL::hasGrant($this->user, $folderKey, 'read_own') || !$this->fileIsOwnedByUser($folderKey, $name)) {
                throw new Forbidden('No view access to requested file');
            }
        }
        return new FileRiseFile($full, $this->user, $this->isAdmin, $this->perms);
    }

    public function createFile($name, $data = null): INode
    {
        $folderKey = $this->folderKeyForPath($this->path);
        $name = trim((string)$name);
        $full = $this->childPath($name);
        $name = basename($name);

        if (!ACL::canMutate($this->perms)) {
            throw new Forbidden('Account is read-only');
        }
        if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }

        if (!$this->isAdmin && !ACL::canWrite($this->user, $this->perms, $folderKey)) {
            throw new Forbidden('No write access to this folder');
        }
        if (!empty($this->perms['disableUpload']) && !$this->isAdmin) {
            throw new Forbidden('Uploads are disabled for your account');
        }
        if (!FileRiseFile::isAllowedWebDavFileName($name)) {
            throw new Forbidden('Invalid file name.');
        }

        // Write directly to FS, then ensure metadata via FileRiseFile::put()
        // Let FileRiseFile handle metadata & overwrite semantics
        $fileNode = new FileRiseFile($full, $this->user, $this->isAdmin, $this->perms);
        $fileNode->put($data);

        return $fileNode;
    }

    public function createDirectory($name): INode
    {
        $parentKey = $this->folderKeyForPath($this->path);
        $name = trim((string)$name);
        $full = $this->childPath($name);
        if (!ACL::canMutate($this->perms)) {
            throw new Forbidden('Account is read-only');
        }
        if (FolderCrypto::isEncryptedOrAncestor($parentKey)) {
            throw new Forbidden('WebDAV is disabled inside encrypted folders');
        }
        if (!$this->isAdmin && !ACL::canManage($this->user, $this->perms, $parentKey)) {
                        throw new Forbidden('No permission to create subfolders here');
        }
        if (
            $name === '' ||
            $name === '.' ||
            $name === '..' ||
            strpos($name, '/') !== false ||
            strpos($name, '\\') !== false ||
            !preg_match(REGEX_FOLDER_NAME, $name)
        ) {
            throw new Forbidden('Invalid folder name.');
        }

        if (!is_dir($full)) {
            @mkdir($full, 0755, true);
        }

        // FileRise folder bookkeeping (owner = creator)
        $rel    = $this->relFromUploads($full);
        $parent = dirname(str_replace('\\', '/', $rel));
        if ($parent === '.' || $parent === '/') {
            $parent = '';
        }
        FolderModel::createFolder($name, $parent, $this->user);

        $folderKey = $rel !== '' ? $rel : 'root';
        \AuditHook::log('folder.create', [
            'user'   => $this->user,
            'source' => 'webdav',
            'folder' => $folderKey,
            'path'   => $folderKey,
        ]);

        return new self($full, $this->user, $this->isAdmin, $this->perms);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function folderKeyForPath(string $absPath): string
    {
        $base = rtrim(UPLOAD_DIR, '/\\');
        $realBase = realpath($base);
        $real = realpath($absPath);

        if ($realBase === false || $real === false || !$this->pathIsWithin($real, $realBase)) {
            throw new Forbidden('Path is outside the WebDAV storage root');
        }
        $rel = ltrim(str_replace('\\', '/', substr($real, strlen($realBase))), '/');
        return ($rel === '' ? 'root' : $rel);
    }

    private function relFromUploads(string $absPath): string
    {
        $folderKey = $this->folderKeyForPath($absPath);
        return $folderKey === 'root' ? '' : $folderKey;
    }

    private function childPath(string $name): string
    {
        if (
            $name === '' ||
            strpos($name, '/') !== false ||
            strpos($name, '\\') !== false ||
            LogicalPathPolicy::hasUnsafeDotSegments($name)
        ) {
            throw new Forbidden('Invalid path segment');
        }

        $full = $this->path . DIRECTORY_SEPARATOR . $name;
        $base = realpath(rtrim(UPLOAD_DIR, '/\\'));
        $resolved = realpath($full);
        $boundaryPath = $resolved !== false ? $resolved : realpath(dirname($full));
        if ($base === false || $boundaryPath === false || !$this->pathIsWithin($boundaryPath, $base)) {
            throw new Forbidden('Path is outside the WebDAV storage root');
        }

        return $full;
    }

    private function pathIsWithin(string $path, string $base): bool
    {
        $path = str_replace('\\', '/', rtrim($path, '/\\'));
        $base = str_replace('\\', '/', rtrim($base, '/\\'));
        if (DIRECTORY_SEPARATOR === '\\') {
            $path = strtolower($path);
            $base = strtolower($base);
        }

        return $path === $base || str_starts_with($path, $base . '/');
    }

    private function loadMeta(string $folderKey): array
    {
        if (isset($this->metaCache[$folderKey])) {
            return $this->metaCache[$folderKey];
        }

        $metaFile = MetadataPath::path((string)META_DIR, $folderKey);

        $data = [];
        if (is_file($metaFile)) {
            $decoded = json_decode(@file_get_contents($metaFile), true);
            if (is_array($decoded)) {
                $data = $decoded;
            }
        }
        return $this->metaCache[$folderKey] = $data;
    }

    private function fileIsOwnedByUser(string $folderKey, string $fileName): bool
    {
        $meta = $this->loadMeta($folderKey);
        return isset($meta[$fileName]['uploader'])
            && strcasecmp((string)$meta[$fileName]['uploader'], $this->user) === 0;
    }
}
