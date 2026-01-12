<?php
// src/models/FolderCrypto.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

/**
 * Folder encryption metadata (no DB).
 *
 * v1 stores only which folder roots are marked "encrypted".
 * Descendants are treated as encrypted by inheritance.
 */
class FolderCrypto
{
    private const SCHEMA_VERSION = 1;
    private const FILE_NAME = 'folder_crypto.json';

    private static ?array $cache = null;
    private static int $cacheMtime = 0;
    private static ?string $cachePath = null;

    private static function filePath(): string
    {
        $dir = class_exists('SourceContext')
            ? rtrim(SourceContext::metaRoot(), "/\\")
            : rtrim((string)META_DIR, "/\\");
        return $dir . DIRECTORY_SEPARATOR . self::FILE_NAME;
    }

    public static function normalizeKey(string $folder): string
    {
        $f = ACL::normalizeFolder($folder);
        $f = trim((string)$f, "/\\ \t\r\n");
        return ($f === '' ? 'root' : $f);
    }

    private static function loadFresh(): array
    {
        $path = self::filePath();
        if (!is_file($path)) {
            return ['v' => self::SCHEMA_VERSION, 'folders' => []];
        }

        $raw = @file_get_contents($path);
        $json = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($json)) {
            return ['v' => self::SCHEMA_VERSION, 'folders' => []];
        }

        $v = (int)($json['v'] ?? 0);
        $folders = $json['folders'] ?? [];
        if ($v !== self::SCHEMA_VERSION || !is_array($folders)) {
            return ['v' => self::SCHEMA_VERSION, 'folders' => []];
        }

        return ['v' => self::SCHEMA_VERSION, 'folders' => $folders];
    }

    public static function load(): array
    {
        $path = self::filePath();
        if (self::$cachePath !== $path) {
            self::$cache = null;
            self::$cacheMtime = 0;
            self::$cachePath = $path;
        }
        $mt = is_file($path) ? (int)@filemtime($path) : 0;
        if (self::$cache !== null && self::$cacheMtime === $mt) {
            return self::$cache;
        }

        self::$cache = self::loadFresh();
        self::$cacheMtime = $mt;
        return self::$cache;
    }

    private static function write(array $doc): bool
    {
        $path = self::filePath();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $json = json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            return false;
        }

        $ok = @file_put_contents($path, $json, LOCK_EX) !== false;
        if ($ok) {
            @chmod($path, 0664);
            self::$cache = $doc;
            self::$cacheMtime = is_file($path) ? (int)@filemtime($path) : 0;
            self::$cachePath = $path;
        }
        return $ok;
    }

    public static function isEncrypted(string $folder): bool
    {
        $key = self::normalizeKey($folder);
        $doc = self::load();
        $folders = $doc['folders'] ?? [];
        $row = $folders[$key] ?? null;
        if (is_array($row)) {
            return !empty($row['encrypted']);
        }
        return false;
    }

    /**
     * Returns true if this folder OR any ancestor folder is encrypted.
     */
    public static function isEncryptedOrAncestor(string $folder): bool
    {
        $f = self::normalizeKey($folder);
        while (true) {
            if (self::isEncrypted($f)) return true;
            if ($f === 'root' || $f === '') return false;
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? 'root' : substr($f, 0, $pos);
            if ($f === '') $f = 'root';
        }
    }

    /**
     * Returns status details used by UI.
     * - encrypted: true if folder is encrypted by self or ancestor
     * - root: encrypted root folder key if inherited
     * - inherited: true if ancestor-encrypted (folder itself not marked encrypted)
     * - rootEncrypted: true if the folder itself is marked encrypted
     */
    public static function getStatus(string $folder): array
    {
        $key = self::normalizeKey($folder);
        if (self::isEncrypted($key)) {
            return [
                'encrypted' => true,
                'rootEncrypted' => true,
                'inherited' => false,
                'root' => $key,
            ];
        }

        $f = $key;
        while ($f !== '' && $f !== 'root') {
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? 'root' : substr($f, 0, $pos);
            if ($f === '') $f = 'root';
            if (self::isEncrypted($f)) {
                return [
                    'encrypted' => true,
                    'rootEncrypted' => false,
                    'inherited' => true,
                    'root' => $f,
                ];
            }
        }

        return [
            'encrypted' => false,
            'rootEncrypted' => false,
            'inherited' => false,
            'root' => null,
        ];
    }

    /**
     * Returns crypto job status used by UI/capabilities.
     *
     * If a job is recorded on this folder or an ancestor, descendants should treat it as active.
     *
     * @return array{active:bool,root:?string,job:?array}
     */
    public static function getJobStatus(string $folder): array
    {
        $key = self::normalizeKey($folder);
        $doc = self::load();
        $folders = $doc['folders'] ?? [];
        if (!is_array($folders) || !$folders) {
            return ['active' => false, 'root' => null, 'job' => null];
        }

        $f = $key;
        while (true) {
            $row = $folders[$f] ?? null;
            if (is_array($row) && isset($row['job']) && is_array($row['job'])) {
                $job = $row['job'];
                $state = strtolower((string)($job['state'] ?? ''));
                if ($state !== '' && $state !== 'done') {
                    return ['active' => true, 'root' => $f, 'job' => $job];
                }
            }
            if ($f === 'root' || $f === '') break;
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? 'root' : substr($f, 0, $pos);
            if ($f === '') $f = 'root';
        }

        return ['active' => false, 'root' => null, 'job' => null];
    }

    /**
     * Attach/clear a v2 crypto job marker on the folder root.
     *
     * This is metadata only (job execution is handled elsewhere).
     *
     * @param array|null $job Example: ['id'=>..., 'type'=>'encrypt'|'decrypt', 'state'=>'running'|'error'|'done', 'error'=>...]
     */
    public static function setJob(string $folder, ?array $job, string $username): array
    {
        $key = self::normalizeKey($folder);
        $doc = self::load();
        $folders = is_array($doc['folders'] ?? null) ? $doc['folders'] : [];

        $row = $folders[$key] ?? [];
        if (!is_array($row)) $row = [];

        $now = time();

        if ($job === null) {
            if (isset($row['job'])) unset($row['job']);
            // If this folder is not encrypted and has no other fields we care about, remove the row.
            if (empty($row['encrypted'])) {
                unset($folders[$key]);
            } else {
                $folders[$key] = $row;
            }
        } else {
            $jid = isset($job['id']) ? trim((string)$job['id']) : '';
            $type = isset($job['type']) ? strtolower(trim((string)$job['type'])) : '';
            $state = isset($job['state']) ? strtolower(trim((string)$job['state'])) : 'running';
            $err = isset($job['error']) ? (string)$job['error'] : null;

            $row['job'] = [
                'id' => $jid,
                'type' => ($type === 'decrypt' ? 'decrypt' : 'encrypt'),
                'state' => $state ?: 'running',
                'error' => $err,
                'startedAt' => (int)($job['startedAt'] ?? $now),
                'startedBy' => $username ?: 'Unknown',
                'updatedAt' => $now,
            ];
            $folders[$key] = $row;
        }

        $doc2 = ['v' => self::SCHEMA_VERSION, 'folders' => $folders];
        if (!self::write($doc2)) {
            return ['ok' => false, 'error' => 'Failed to write folder crypto metadata.'];
        }

        return ['ok' => true, 'folder' => $key];
    }

    /**
     * Set/clear encryption root marker for a folder.
     *
     * Note: this does NOT perform any file encryption work; it only changes metadata.
     */
    public static function setEncrypted(string $folder, bool $encrypted, string $username): array
    {
        $key = self::normalizeKey($folder);
        $doc = self::load();
        $folders = is_array($doc['folders'] ?? null) ? $doc['folders'] : [];

        $before = self::isEncrypted($key);
        $now = time();
        $changed = false;

        if ($encrypted) {
            $folders[$key] = [
                'encrypted' => true,
                'encryptedAt' => $now,
                'encryptedBy' => $username ?: 'Unknown',
            ];
            $changed = (!$before);
        } else {
            if (isset($folders[$key])) {
                unset($folders[$key]);
                $changed = true;
            }
        }

        $doc2 = ['v' => self::SCHEMA_VERSION, 'folders' => $folders];
        if (!self::write($doc2)) {
            return ['ok' => false, 'error' => 'Failed to write folder crypto metadata.'];
        }

        return [
            'ok' => true,
            'folder' => $key,
            'encrypted' => $encrypted,
            'changed' => $changed,
        ];
    }

    /**
     * Move encryption markers for an entire subtree: old/... => new/...
     * Used on folder rename/move.
     */
    public static function migrateSubtree(string $source, string $target): array
    {
        $src = self::normalizeKey($source);
        $dst = self::normalizeKey($target);

        if ($src === $dst) {
            return ['changed' => false, 'moved' => 0];
        }

        $doc = self::load();
        $folders = is_array($doc['folders'] ?? null) ? $doc['folders'] : [];
        if (!$folders) {
            return ['changed' => false, 'moved' => 0];
        }

        $changed = false;
        $moved = 0;
        $next = $folders;

        foreach ($folders as $k => $row) {
            if ($k === $src || strpos($k, $src . '/') === 0) {
                unset($next[$k]);
                $suffix = substr($k, strlen($src)); // '' or '/sub/...'
                $newKey = $dst . $suffix;
                $next[$newKey] = $row;
                $changed = true;
                $moved++;
            }
        }

        if (!$changed) {
            return ['changed' => false, 'moved' => 0];
        }

        $doc2 = ['v' => self::SCHEMA_VERSION, 'folders' => $next];
        $ok = self::write($doc2);

        return ['changed' => $ok, 'moved' => $moved];
    }

    public static function removeSubtree(string $folder): array
    {
        $src = self::normalizeKey($folder);
        $doc = self::load();
        $folders = is_array($doc['folders'] ?? null) ? $doc['folders'] : [];
        if (!$folders) {
            return ['changed' => false, 'removed' => 0];
        }

        $changed = false;
        $removed = 0;
        $next = $folders;

        foreach ($folders as $k => $_row) {
            if ($k === $src || strpos($k, $src . '/') === 0) {
                unset($next[$k]);
                $changed = true;
                $removed++;
            }
        }

        if (!$changed) return ['changed' => false, 'removed' => 0];

        $doc2 = ['v' => self::SCHEMA_VERSION, 'folders' => $next];
        $ok = self::write($doc2);

        return ['changed' => $ok, 'removed' => $removed];
    }
}
