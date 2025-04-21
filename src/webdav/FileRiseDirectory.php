<?php
namespace FileRise\WebDAV;

// Bootstrap constants and models
require_once __DIR__ . '/../../config/config.php';      // UPLOAD_DIR, META_DIR, DATE_TIME_FORMAT
require_once __DIR__ . '/../../vendor/autoload.php';    // SabreDAV
require_once __DIR__ . '/../../src/models/FolderModel.php';
require_once __DIR__ . '/../../src/models/FileModel.php';
require_once __DIR__ . '/FileRiseFile.php';

use Sabre\DAV\ICollection;
use Sabre\DAV\INode;
use Sabre\DAV\Exception\NotFound;
use Sabre\DAV\Exception\Forbidden;
use FileRise\WebDAV\FileRiseFile;
use FolderModel;
use FileModel;

class FileRiseDirectory implements ICollection, INode {
    private string $path;
    private string $user;
    private bool   $folderOnly;

    /**
     * @param string $path       Absolute filesystem path (no trailing slash)
     * @param string $user       Authenticated username
     * @param bool   $folderOnly If true, non‑admins only see $path/{user}
     */
    public function __construct(string $path, string $user, bool $folderOnly) {
        $this->path       = rtrim($path, '/\\');
        $this->user       = $user;
        $this->folderOnly = $folderOnly;
    }

    // ── INode ───────────────────────────────────────────

    public function getName(): string {
        return basename($this->path);
    }

    public function getLastModified(): int {
        return filemtime($this->path);
    }

    public function delete(): void {
        throw new Forbidden('Cannot delete this node');
    }

    public function setName($name): void {
        throw new Forbidden('Renaming not supported');
    }

    // ── ICollection ────────────────────────────────────

    public function getChildren(): array {
        $nodes = [];
        foreach (new \DirectoryIterator($this->path) as $item) {
            if ($item->isDot()) continue;
            $full = $item->getPathname();
            if ($item->isDir()) {
                $nodes[] = new self($full, $this->user, $this->folderOnly);
            } else {
                $nodes[] = new FileRiseFile($full, $this->user);
            }
        }
        // Apply folder‑only at the top level
        if (
            $this->folderOnly
         && realpath($this->path) === realpath(rtrim(UPLOAD_DIR,'/\\'))
        ) {
            $nodes = array_filter($nodes, fn(INode $n)=> $n->getName() === $this->user);
        }
        return array_values($nodes);
    }

    public function childExists($name): bool {
        return file_exists($this->path . DIRECTORY_SEPARATOR . $name);
    }

    public function getChild($name): INode {
        $full = $this->path . DIRECTORY_SEPARATOR . $name;
        if (!file_exists($full)) throw new NotFound("Not found: $name");
        return is_dir($full)
            ? new self($full, $this->user, $this->folderOnly)
            : new FileRiseFile($full, $this->user);
    }

    public function createFile($name, $data = null): INode {
        $full    = $this->path . DIRECTORY_SEPARATOR . $name;
        $content = is_resource($data) ? stream_get_contents($data) : (string)$data;

        // Compute folder‑key relative to UPLOAD_DIR
        $rel      = substr($full, strlen(rtrim(UPLOAD_DIR,'/\\'))+1);
        $parts    = explode('/', str_replace('\\','/',$rel));
        $filename = array_pop($parts);
        $folder   = empty($parts) ? 'root' : implode('/', $parts);

        FileModel::saveFile($folder, $filename, $content, $this->user);
        return new FileRiseFile($full, $this->user);
    }

    public function createDirectory($name): INode {
        $full   = $this->path . DIRECTORY_SEPARATOR . $name;
        $rel    = substr($full, strlen(rtrim(UPLOAD_DIR,'/\\'))+1);
        $parent = dirname(str_replace('\\','/',$rel));
        if ($parent === '.' || $parent === '/') $parent = '';
        FolderModel::createFolder($name, $parent, $this->user);
        return new self($full, $this->user, $this->folderOnly);
    }
}