<?php
// src/models/DiskUsageModel.php

declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/FS.php';

/**
 * DiskUsageModel
 *
 * Builds and reads a cached snapshot of disk usage under UPLOAD_DIR.
 * Snapshot is stored as JSON under META_DIR . '/disk_usage.json'.
 *
 * Folder keys mirror the rest of FileRise:
 *   - "root" is the upload root
 *   - "foo/bar" are subfolders under UPLOAD_DIR
 *
 * We intentionally skip:
 *   - trash subtree
 *   - profile_pics subtree
 *   - dot-prefixed names
 *   - FS::IGNORE() entries like @eaDir, .DS_Store, etc.
 */
class DiskUsageModel
{
    /** Where we persist the snapshot JSON. */
    public const SNAPSHOT_BASENAME = 'disk_usage.json';

    /** Maximum number of per-file records to keep (for Top N view). */
    private const TOP_FILE_LIMIT = 1000;

    /**
     * Location of the background scan log file.
     */
    public static function scanLogPath(): string
    {
        $meta   = rtrim((string)META_DIR, '/\\');
        $logDir = $meta . DIRECTORY_SEPARATOR . 'logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }
        return $logDir . DIRECTORY_SEPARATOR . 'disk_usage_scan.log';
    }

    /**
     * Read the tail of the scan log to surface recent failures in the UI.
     *
     * @return array|null
     */
    public static function readScanLogTail(int $maxBytes = 4000): ?array
    {
        $path = self::scanLogPath();
        if (!is_file($path) || !is_readable($path)) {
            return null;
        }

        $size = @filesize($path);
        $fp   = @fopen($path, 'rb');
        if (!$fp) {
            return null;
        }

        if ($size !== false && $size > $maxBytes) {
            fseek($fp, -$maxBytes, SEEK_END);
        }
        $buf = @stream_get_contents($fp);
        @fclose($fp);
        if ($buf === false) {
            return null;
        }

        $buf   = str_replace(["\r\n", "\r"], "\n", (string)$buf);
        $lines = array_filter(array_map('trim', explode("\n", $buf)), 'strlen');
        $tail  = implode("\n", array_slice($lines, -30));

        return [
            'path'       => $path,
            'modifiedAt' => (int)@filemtime($path),
            'tail'       => $tail,
            'hasError'   => stripos($tail, 'error') !== false,
        ];
    }

    /**
     * Delete the on-disk snapshot JSON, if present.
     */
    public static function deleteSnapshot(): bool
    {
        $path = self::snapshotPath();
        if (!is_file($path)) {
            return false;
        }
        return @unlink($path);
    }

    /**
     * Absolute path to the snapshot JSON file.
     */
    public static function snapshotPath(): string
    {
        $meta = rtrim((string)META_DIR, '/\\');
        return $meta . DIRECTORY_SEPARATOR . self::SNAPSHOT_BASENAME;
    }

    /**
     * Build a fresh snapshot of disk usage under UPLOAD_DIR and write it to disk.
     *
     * Returns the structured snapshot array (same shape as stored JSON).
     *
     * @throws RuntimeException on configuration or IO errors.
     */
    public static function buildSnapshot(): array
    {
        $start = microtime(true);

        $root = realpath(UPLOAD_DIR);
        if ($root === false || !is_dir($root)) {
            throw new RuntimeException('Uploads directory is not configured correctly.');
        }
        $root = rtrim($root, DIRECTORY_SEPARATOR);

        $IGNORE = FS::IGNORE();
        $SKIP   = FS::SKIP();

        // Folder map: key => [
        //   'key'    => string,
        //   'parent' => string|null,
        //   'name'   => string,
        //   'bytes'  => int,
        //   'files'  => int,
        //   'dirs'   => int,
        //   'latest_mtime' => int
        // ]
        $folders = [];

        // Root entry
        $folders['root'] = [
            'key'          => 'root',
            'parent'       => null,
            'name'         => 'root',
            'bytes'        => 0,
            'files'        => 0,
            'dirs'         => 0,
            'latest_mtime' => 0,
        ];

        // File records (we may trim to TOP_FILE_LIMIT later)
        // Each item: [
        //   'folder' => folderKey,
        //   'name'   => file name,
        //   'path'   => "folder/name" or just name if root,
        //   'bytes'  => int,
        //   'mtime'  => int
        // ]
        $files = [];

        $rootLen = strlen($root);

        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(
                $root,
                FilesystemIterator::SKIP_DOTS
                | FilesystemIterator::FOLLOW_SYMLINKS
            ),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($it as $path => $info) {
            /** @var SplFileInfo $info */
            $name = $info->getFilename();

            // Skip dotfiles / dotdirs
            if ($name === '.' || $name === '..') {
                continue;
            }
            if ($name[0] === '.') {
                continue;
            }

            // Skip system/ignored entries
            if (in_array($name, $IGNORE, true)) {
                continue;
            }

            // Relative path under UPLOAD_DIR, normalized with '/'
            $rel = substr($path, $rootLen);
            $rel = str_replace('\\', '/', $rel);
            $rel = ltrim($rel, '/');

            // Should only happen for the root itself, which we seeded
            if ($rel === '') {
                continue;
            }

            $isDir = $info->isDir();

            if ($isDir) {
                $folderKey = $rel;
                $lowerRel  = strtolower($folderKey);

                // Skip trash/profile_pics subtrees entirely
                if ($lowerRel === 'trash' || strpos($lowerRel, 'trash/') === 0) {
                    $it->next();
                    continue;
                }
                if ($lowerRel === 'profile_pics' || strpos($lowerRel, 'profile_pics/') === 0) {
                    $it->next();
                    continue;
                }

                // Skip SKIP entries at any level
                $baseLower = strtolower(basename($folderKey));
                if (in_array($baseLower, $SKIP, true)) {
                    $it->next();
                    continue;
                }

                // Register folder
                if (!isset($folders[$folderKey])) {
                    $parent = self::parentKeyOf($folderKey);
                    if (!isset($folders[$parent])) {
                        // Ensure parent exists (important for aggregation step later)
                        $folders[$parent] = [
                            'key'          => $parent,
                            'parent'       => self::parentKeyOf($parent),
                            'name'         => self::basenameKey($parent),
                            'bytes'        => 0,
                            'files'        => 0,
                            'dirs'         => 0,
                            'latest_mtime' => 0,
                        ];
                    }

                    $folders[$folderKey] = [
                        'key'          => $folderKey,
                        'parent'       => $parent,
                        'name'         => self::basenameKey($folderKey),
                        'bytes'        => 0,
                        'files'        => 0,
                        'dirs'         => 0,
                        'latest_mtime' => 0,
                    ];
                    // Increment dir count on parent
                    if ($parent !== null && isset($folders[$parent])) {
                        $folders[$parent]['dirs']++;
                    }
                }
                continue;
            }

            // File entry
            // Determine folder key where this file resides
            $relDir = str_replace('\\', '/', dirname($rel));
            if ($relDir === '.' || $relDir === '') {
                $folderKey = 'root';
            } else {
                $folderKey = $relDir;
            }

            $lowerFolder = strtolower($folderKey);
            if ($lowerFolder === 'trash' || strpos($lowerFolder, 'trash/') === 0) {
                continue;
            }
            if ($lowerFolder === 'profile_pics' || strpos($lowerFolder, 'profile_pics/') === 0) {
                continue;
            }

            // Skip SKIP entries for files inside unwanted app-specific dirs
            $baseLower = strtolower(basename($folderKey));
            if (in_array($baseLower, $SKIP, true)) {
                continue;
            }

            // Ensure folder exists in map
            if (!isset($folders[$folderKey])) {
                $parent = self::parentKeyOf($folderKey);
                if (!isset($folders[$parent])) {
                    $folders[$parent] = [
                        'key'          => $parent,
                        'parent'       => self::parentKeyOf($parent),
                        'name'         => self::basenameKey($parent),
                        'bytes'        => 0,
                        'files'        => 0,
                        'dirs'         => 0,
                        'latest_mtime' => 0,
                    ];
                }

                $folders[$folderKey] = [
                    'key'          => $folderKey,
                    'parent'       => $parent,
                    'name'         => self::basenameKey($folderKey),
                    'bytes'        => 0,
                    'files'        => 0,
                    'dirs'         => 0,
                    'latest_mtime' => 0,
                ];
                if ($parent !== null && isset($folders[$parent])) {
                    $folders[$parent]['dirs']++;
                }
            }

            $bytes = (int)$info->getSize();
            $mtime = (int)$info->getMTime();

            // Update folder leaf stats
            $folders[$folderKey]['bytes'] += $bytes;
            $folders[$folderKey]['files']++;
            if ($mtime > $folders[$folderKey]['latest_mtime']) {
                $folders[$folderKey]['latest_mtime'] = $mtime;
            }

            // Remember file record (we may trim later)
            $filePath = ($folderKey === 'root')
                ? $name
                : ($folderKey . '/' . $name);

            $files[] = [
                'folder' => $folderKey,
                'name'   => $name,
                'path'   => $filePath,
                'bytes'  => $bytes,
                'mtime'  => $mtime,
            ];
        }

        // Aggregate folder bytes up the tree so each folder includes its descendants.
        // Process folders from deepest to shallowest.
        $keys = array_keys($folders);
        usort($keys, function (string $a, string $b): int {
            return self::depthOf($b) <=> self::depthOf($a);
        });

        foreach ($keys as $key) {
            $parent = $folders[$key]['parent'];
            if ($parent !== null && isset($folders[$parent])) {
                $folders[$parent]['bytes']        += $folders[$key]['bytes'];
                $folders[$parent]['files']        += $folders[$key]['files'];
                $folders[$parent]['dirs']         += $folders[$key]['dirs'];
                $parentLatest = $folders[$parent]['latest_mtime'];
                if ($folders[$key]['latest_mtime'] > $parentLatest) {
                    $folders[$parent]['latest_mtime'] = $folders[$key]['latest_mtime'];
                }
            }
        }

        // Root aggregate
        $rootBytes = isset($folders['root']) ? (int)$folders['root']['bytes'] : 0;
        $rootFiles = isset($folders['root']) ? (int)$folders['root']['files'] : 0;

        // Count of folders under the upload root (excluding "root" itself)
        $rootFolders = 0;
        if (!empty($folders)) {
            $rootFolders = max(0, count($folders) - 1);
        }

        // Trim top files list
        usort($files, function (array $a, array $b): int {
            // descending by bytes, then by path
            if ($a['bytes'] === $b['bytes']) {
                return strcmp($a['path'], $b['path']);
            }
            return ($a['bytes'] < $b['bytes']) ? 1 : -1;
        });
        if (count($files) > self::TOP_FILE_LIMIT) {
            $files = array_slice($files, 0, self::TOP_FILE_LIMIT);
        }

        $snapshot = [
            'version'      => 1,
            'generated_at' => time(),
            'scan_seconds' => microtime(true) - $start,
            'root_bytes'   => $rootBytes,
            'root_files'   => $rootFiles,
            'root_folders' => $rootFolders,
            // Store folders as numerically-indexed array
            'folders'      => array_values($folders),
            'files'        => $files,
        ];

        $path = self::snapshotPath();
        $dir  = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $json = json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Failed to encode disk usage snapshot.');
        }

        if (@file_put_contents($path, $json) === false) {
            throw new RuntimeException('Failed to write disk usage snapshot to ' . $path);
        }

        return $snapshot;
    }

    /**
     * Load the snapshot from disk, or return null if missing or invalid.
     */
    public static function loadSnapshot(): ?array
    {
        $path = self::snapshotPath();
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return null;
        }
        if (!isset($data['version']) || (int)$data['version'] !== 1) {
            return null;
        }
        return $data;
    }

    /**
     * Compute a lightweight summary for the Admin panel.
     *
     * @param int $maxTopFolders       How many top folders to include.
     * @param int $maxTopFilesPreview  Optional number of top files to include as preview.
     * @return array
     */
    public static function getSummary(int $maxTopFolders = 5, int $maxTopFilesPreview = 0): array
    {
        $snapshot = self::loadSnapshot();
        if ($snapshot === null) {
            return [
                'ok'          => false,
                'error'       => 'no_snapshot',
                'message'     => 'No disk usage snapshot found. Run the disk usage scan to generate one.',
                'generatedAt' => null,
            ];
        }

        $rootBytes = (int)($snapshot['root_bytes'] ?? 0);
        $folders   = is_array($snapshot['folders'] ?? null) ? $snapshot['folders'] : [];

        // --- Build "volumes" across core FileRise dirs (UPLOAD/USERS/META) ---
        $volumeRoots = [
            'uploads' => defined('UPLOAD_DIR') ? (string)UPLOAD_DIR : null,
            'users'   => defined('USERS_DIR')  ? (string)USERS_DIR  : null,
            'meta'    => defined('META_DIR')   ? (string)META_DIR   : null,
        ];

        $volumesMap = [];
        $uploadReal = null;

        if (defined('UPLOAD_DIR')) {
            $tmp = realpath(UPLOAD_DIR);
            if ($tmp !== false && is_dir($tmp)) {
                $uploadReal = $tmp;
            }
        }

        foreach ($volumeRoots as $kind => $dir) {
            if ($dir === null || $dir === '') {
                continue;
            }
            $real = realpath($dir);
            if ($real === false || !is_dir($real)) {
                continue;
            }

            $total = @disk_total_space($real);
            $free  = @disk_free_space($real);
            if ($total === false || $free === false || $total <= 0) {
                continue;
            }

            $total = (int)$total;
            $free  = (int)$free;
            $used  = $total - $free;
            if ($used < 0) {
                $used = 0;
            }
            $usedPct = ($used * 100.0) / $total;

            // Group by same total+free => assume same underlying volume
            $bucketKey = $total . ':' . $free;
            if (!isset($volumesMap[$bucketKey])) {
                $volumesMap[$bucketKey] = [
                    'totalBytes'  => $total,
                    'freeBytes'   => $free,
                    'usedBytes'   => $used,
                    'usedPercent' => $usedPct,
                    'roots'       => [],
                ];
            }

            $volumesMap[$bucketKey]['roots'][] = [
                'kind' => $kind,   // "uploads" | "users" | "meta"
                'path' => $real,
            ];
        }

        $volumes = array_values($volumesMap);
        // Sort by usedPercent desc (heaviest first)
        usort($volumes, function (array $a, array $b): int {
            $pa = (float)($a['usedPercent'] ?? 0.0);
            $pb = (float)($b['usedPercent'] ?? 0.0);
            if ($pa === $pb) {
                return 0;
            }
            return ($pa < $pb) ? 1 : -1;
        });

        // Backwards-compat: root filesystem metrics based on the volume
        // that contains UPLOAD_DIR (if we can detect it).
        $fsTotalBytes = null;
        $fsFreeBytes  = null;
        $fsUsedBytes  = null;
        $fsUsedPct    = null;

        if ($uploadReal && !empty($volumes)) {
            foreach ($volumes as $vol) {
                foreach ($vol['roots'] as $root) {
                    if (!isset($root['path'])) continue;
                    if ((string)$root['path'] === (string)$uploadReal) {
                        $fsTotalBytes = (int)$vol['totalBytes'];
                        $fsFreeBytes  = (int)$vol['freeBytes'];
                        $fsUsedBytes  = (int)$vol['usedBytes'];
                        $fsUsedPct    = (float)$vol['usedPercent'];
                        break 2;
                    }
                }
            }
        }

        // Top N non-root folders by bytes (from snapshot)
        $candidates = array_filter($folders, function (array $f): bool {
            return isset($f['key']) && $f['key'] !== 'root';
        });

        usort($candidates, function (array $a, array $b): int {
            $ba = (int)($a['bytes'] ?? 0);
            $bb = (int)($b['bytes'] ?? 0);
            if ($ba === $bb) {
                return strcmp((string)$a['key'], (string)$b['key']);
            }
            return ($ba < $bb) ? 1 : -1;
        });

        if ($maxTopFolders > 0 && count($candidates) > $maxTopFolders) {
            $candidates = array_slice($candidates, 0, $maxTopFolders);
        }

        $topFolders = [];
        foreach ($candidates as $f) {
            $bytes = (int)($f['bytes'] ?? 0);
            $pct   = ($rootBytes > 0) ? ($bytes * 100.0 / $rootBytes) : 0.0;
            $topFolders[] = [
                'folder'         => (string)$f['key'],
                'name'           => (string)$f['name'],
                'bytes'          => $bytes,
                'files'          => (int)($f['files'] ?? 0),
                'dirs'           => (int)($f['dirs'] ?? 0),
                'latest_mtime'   => (int)($f['latest_mtime'] ?? 0),
                'percentOfTotal' => $pct,
            ];
        }

                // totalFolders: prefer snapshot["root_folders"], but fall back to counting
                $totalFolders = isset($snapshot['root_folders'])
                ? (int)$snapshot['root_folders']
                : max(0, count($folders) - 1);
    
            $out = [
                'ok'            => true,
                'generatedAt'   => (int)($snapshot['generated_at'] ?? 0),
                'scanSeconds'   => (float)($snapshot['scan_seconds'] ?? 0.0),
                'totalBytes'    => $rootBytes,
                'totalFiles'    => (int)($snapshot['root_files'] ?? 0),
                'totalFolders'  => $totalFolders,
                'topFolders'    => $topFolders,
                // original fields (for single-root view)
                'uploadRoot'    => $uploadReal,
                'fsTotalBytes'  => $fsTotalBytes,
                'fsFreeBytes'   => $fsFreeBytes,
                'fsUsedBytes'   => $fsUsedBytes,
                'fsUsedPercent' => $fsUsedPct,
                // new grouped volumes: each with total/free/used and roots[]
                'volumes'       => $volumes,
            ];

        if ($maxTopFilesPreview > 0) {
            $files = is_array($snapshot['files'] ?? null) ? $snapshot['files'] : [];
            if (count($files) > $maxTopFilesPreview) {
                $files = array_slice($files, 0, $maxTopFilesPreview);
            }
            $out['topFiles'] = $files;
        }

        return $out;
    }

    /**
     * Return direct children (folders + files) of a given folder key.
     *
     * @param string $folderKey
     * @return array
     */
    public static function getChildren(string $folderKey): array
    {
        $folderKey = ($folderKey === '' || $folderKey === '/') ? 'root' : $folderKey;

        $snapshot = self::loadSnapshot();
        if ($snapshot === null) {
            return [
                'ok'    => false,
                'error' => 'no_snapshot',
            ];
        }

        $rootBytes = (int)($snapshot['root_bytes'] ?? 0);
        $folders   = is_array($snapshot['folders'] ?? null) ? $snapshot['folders'] : [];
        $files     = is_array($snapshot['files'] ?? null) ? $snapshot['files'] : [];

        // Index folders by key
        $folderByKey = [];
        foreach ($folders as $f) {
            if (!isset($f['key'])) continue;
            $folderByKey[(string)$f['key']] = $f;
        }
        if (!isset($folderByKey[$folderKey])) {
            return [
                'ok'    => false,
                'error' => 'folder_not_found',
            ];
        }

        $childrenFolders = [];
        foreach ($folders as $f) {
            if (!isset($f['parent']) || !isset($f['key'])) continue;
            if ((string)$f['parent'] === $folderKey) {
                $bytes = (int)($f['bytes'] ?? 0);
                $pct   = ($rootBytes > 0) ? ($bytes * 100.0 / $rootBytes) : 0.0;
                $childrenFolders[] = [
                    'type'           => 'folder',
                    'folder'         => (string)$f['key'],
                    'name'           => (string)$f['name'],
                    'bytes'          => $bytes,
                    'files'          => (int)($f['files'] ?? 0),
                    'dirs'           => (int)($f['dirs'] ?? 0),
                    'latest_mtime'   => (int)($f['latest_mtime'] ?? 0),
                    'percentOfTotal' => $pct,
                ];
            }
        }

        $childrenFiles = [];
        foreach ($files as $file) {
            if (!isset($file['folder']) || !isset($file['name'])) continue;
            if ((string)$file['folder'] !== $folderKey) continue;

            $bytes = (int)($file['bytes'] ?? 0);
            $pct   = ($rootBytes > 0) ? ($bytes * 100.0 / $rootBytes) : 0.0;
            $childrenFiles[] = [
                'type'           => 'file',
                'folder'         => (string)$file['folder'],
                'name'           => (string)$file['name'],
                'path'           => (string)($file['path'] ?? $file['name']),
                'bytes'          => $bytes,
                'mtime'          => (int)($file['mtime'] ?? 0),
                'percentOfTotal' => $pct,
            ];
        }

        // Sort children: folders first (by bytes desc), then files (by bytes desc)
        usort($childrenFolders, function (array $a, array $b): int {
            $ba = (int)($a['bytes'] ?? 0);
            $bb = (int)($b['bytes'] ?? 0);
            if ($ba === $bb) {
                return strcmp((string)$a['name'], (string)$b['name']);
            }
            return ($ba < $bb) ? 1 : -1;
        });

        usort($childrenFiles, function (array $a, array $b): int {
            $ba = (int)($a['bytes'] ?? 0);
            $bb = (int)($b['bytes'] ?? 0);
            if ($ba === $bb) {
                return strcmp((string)$a['name'], (string)$b['name']);
            }
            return ($ba < $bb) ? 1 : -1;
        });

        return [
            'ok'      => true,
            'folder'  => $folderKey,
            'folders' => $childrenFolders,
            'files'   => $childrenFiles,
        ];
    }

    /**
     * Return the global Top N files by size from the snapshot.
     *
     * @param int $limit
     * @return array
     */
    public static function getTopFiles(int $limit = 100): array
    {
        $snapshot = self::loadSnapshot();
        if ($snapshot === null) {
            return [
                'ok'    => false,
                'error' => 'no_snapshot',
            ];
        }

        $rootBytes = (int)($snapshot['root_bytes'] ?? 0);
        $files     = is_array($snapshot['files'] ?? null) ? $snapshot['files'] : [];

        if ($limit > 0 && count($files) > $limit) {
            $files = array_slice($files, 0, $limit);
        }

        $out = [];
        foreach ($files as $file) {
            $bytes = (int)($file['bytes'] ?? 0);
            $pct   = ($rootBytes > 0) ? ($bytes * 100.0 / $rootBytes) : 0.0;
            $out[] = [
                'folder'         => (string)($file['folder'] ?? 'root'),
                'name'           => (string)($file['name'] ?? ''),
                'path'           => (string)($file['path'] ?? ($file['name'] ?? '')),
                'bytes'          => $bytes,
                'mtime'          => (int)($file['mtime'] ?? 0),
                'percentOfTotal' => $pct,
            ];
        }

        return [
            'ok'    => true,
            'files' => $out,
        ];
    }

    /**
     * Helper: derive the parent folder key ("root" -> null, "foo/bar" -> "foo").
     */
    private static function parentKeyOf(string $key): ?string
    {
        if ($key === 'root' || $key === '') {
            return null;
        }
        $key = trim($key, '/');
        if ($key === '') return null;
        $pos = strrpos($key, '/');
        if ($pos === false) {
            return 'root';
        }
        $parent = substr($key, 0, $pos);
        return ($parent === '' ? 'root' : $parent);
    }

    /**
     * Helper: basename of a folder key. "root" -> "root", "foo/bar" -> "bar".
     */
    private static function basenameKey(?string $key): string
    {
        if ($key === null || $key === '' || $key === 'root') {
            return 'root';
        }
        $key = trim($key, '/');
        $pos = strrpos($key, '/');
        if ($pos === false) {
            return $key;
        }
        return substr($key, $pos + 1);
    }

    /**
     * Helper: approximate depth of a folder key (root->0, "foo"->1, "foo/bar"->2, etc.)
     */
    private static function depthOf(string $key): int
    {
        if ($key === '' || $key === 'root') return 0;
        return substr_count(trim($key, '/'), '/') + 1;
    }
}
