<?php

namespace FileRise\Domain;

use FileRise\Support\ACL;
use FileRise\Support\CryptoAtRest;
use FileRise\Support\FS;
use FileRise\Storage\StorageAdapterInterface;
use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageRegistry;
use FileRise\Domain\FileModel;
use FileRise\Domain\FolderCrypto;
use FileRise\Domain\UploadModel;
use Throwable;

// src/models/FolderModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/FS.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class FolderModel
{
    private static function storage(): StorageAdapterInterface
    {
        return StorageRegistry::getAdapter();
    }

    private static function uploadRoot(): string
    {
        if (class_exists('SourceContext')) {
            return SourceContext::uploadRoot();
        }
        return rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

    private static function metaRoot(): string
    {
        if (class_exists('SourceContext')) {
            SourceContext::ensureMetaDir();
            return SourceContext::metaRoot();
        }
        return rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

    private static function folderOwnersPath(): string
    {
        return self::metaRoot() . 'folder_owners.json';
    }
    /* ============================================================
     * Ownership mapping helpers (stored in META_DIR/folder_owners.json)
     * ============================================================ */

    public static function countVisible(string $folder, string $user, array $perms): array
    {
        $storage = self::storage();
        $folder = ACL::normalizeFolder($folder);
        if (!$storage->isLocal()) {
            return self::countVisibleRemote($folder, $user, $perms);
        }

    // If the user can't view this folder at all, short-circuit (admin/read/read_own)
        $canViewFolder = ACL::isAdmin($perms)
        || ACL::canRead($user, $perms, $folder)
        || ACL::canReadOwn($user, $perms, $folder);
        if (!$canViewFolder) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0];
        }

    // NEW: distinguish full read vs own-only for this folder
        $hasFullRead = ACL::isAdmin($perms) || ACL::canRead($user, $perms, $folder);
    // if !$hasFullRead but $canViewFolder is true, they’re effectively "view own" only

        $base = realpath(self::uploadRoot());
        if ($base === false) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0];
        }

    // Resolve target dir + ACL-relative prefix
        if ($folder === 'root') {
            $dir       = $base;
            $relPrefix = '';
        } else {
            $parts = array_filter(explode('/', $folder), fn($p) => $p !== '');
            foreach ($parts as $seg) {
                if (!self::isSafeSegment($seg)) {
                    return ['folders' => 0, 'files' => 0, 'bytes' => 0];
                }
            }
            $guess = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
            $dir   = self::safeReal($base, $guess);
            if ($dir === null || !is_dir($dir)) {
                return ['folders' => 0, 'files' => 0, 'bytes' => 0];
            }
            $relPrefix = implode('/', $parts);
        }

        $SKIP   = FS::SKIP();

        $entries = @scandir($dir);
        if ($entries === false) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0];
        }

        $folderCount      = 0;
        $fileCount        = 0;
        $totalBytes       = 0;

    // NEW: stats for created / modified
        $earliestUploaded = null; // min mtime
        $latestMtime      = null; // max mtime

        $MAX_SCAN = 4000;
        $scanned  = 0;

        foreach ($entries as $name) {
            if (++$scanned > $MAX_SCAN) {
                break;
            }

            if ($name === '.' || $name === '..') {
                continue;
            }
            if ($name[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($name, $relPrefix)) {
                continue;
            }
            if (in_array(strtolower($name), $SKIP, true)) {
                continue;
            }
            if (!self::isSafeSegment($name)) {
                continue;
            }

            $abs = $dir . DIRECTORY_SEPARATOR . $name;

            if (@is_dir($abs)) {
                if (@is_link($abs)) {
                    $safe = self::safeReal($base, $abs);
                    if ($safe === null || !is_dir($safe)) {
                        continue;
                    }
                }

                $childRel = ($relPrefix === '' ? $name : $relPrefix . '/' . $name);
                if (
                    ACL::isAdmin($perms)
                    || ACL::canRead($user, $perms, $childRel)
                    || ACL::canReadOwn($user, $perms, $childRel)
                ) {
                    $folderCount++;
                }
            } elseif (@is_file($abs)) {
                // Only count files if the user has full read on *this* folder.
                // If they’re view_own-only here, don’t leak or mis-report counts.
                if (!$hasFullRead) {
                    continue;
                }

                $fileCount++;
                $sz = @filesize($abs);
                if (is_int($sz) && $sz > 0) {
                    $totalBytes += $sz;
                }

                // NEW: track earliest / latest mtime from visible files
                $mt = @filemtime($abs);
                if (is_int($mt) && $mt > 0) {
                    if ($earliestUploaded === null || $mt < $earliestUploaded) {
                        $earliestUploaded = $mt;
                    }
                    if ($latestMtime === null || $mt > $latestMtime) {
                        $latestMtime = $mt;
                    }
                }
            }
        }

        $result = [
        'folders' => $folderCount,
        'files'   => $fileCount,
        'bytes'   => $totalBytes,
        ];

    // Only include when we actually saw at least one readable file
        if ($earliestUploaded !== null) {
            $result['earliest_uploaded'] = date(DATE_TIME_FORMAT, $earliestUploaded);
        }
        if ($latestMtime !== null) {
            $result['latest_mtime'] = date(DATE_TIME_FORMAT, $latestMtime);
        }

        return $result;
    }

    public static function countVisibleDeep(string $folder, string $user, array $perms, int $maxScan = 20000, ?int $maxDepth = null): array
    {
        $storage = self::storage();
        $folder = ACL::normalizeFolder($folder);
        if (!$storage->isLocal()) {
            return self::countVisibleDeepRemote($folder, $user, $perms, $maxScan, $maxDepth);
        }

        $canViewFolder = ACL::isAdmin($perms)
            || ACL::canRead($user, $perms, $folder)
            || ACL::canReadOwn($user, $perms, $folder);
        if (!$canViewFolder) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0, 'truncated' => false];
        }

        if ($maxDepth !== null) {
            $maxDepth = (int)$maxDepth;
            if ($maxDepth <= 0) {
                $maxDepth = null;
            }
        }

        $base = realpath(self::uploadRoot());
        if ($base === false) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0, 'truncated' => false];
        }

        if ($folder === 'root') {
            $dir = $base;
            $relPrefix = '';
        } else {
            $parts = array_filter(explode('/', $folder), fn($p) => $p !== '');
            foreach ($parts as $seg) {
                if (!self::isSafeSegment($seg)) {
                    return ['folders' => 0, 'files' => 0, 'bytes' => 0, 'truncated' => false];
                }
            }
            $guess = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
            $dir = self::safeReal($base, $guess);
            if ($dir === null || !is_dir($dir)) {
                return ['folders' => 0, 'files' => 0, 'bytes' => 0, 'truncated' => false];
            }
            $relPrefix = implode('/', $parts);
        }

        $SKIP   = FS::SKIP();

        $folderCount = 0;
        $fileCount = 0;
        $totalBytes = 0;
        $scanned = 0;
        $truncated = false;

        $stack = [[$dir, $relPrefix, 0]];
        while ($stack) {
            [$curAbs, $curRel, $depth] = array_pop($stack);

            $relForAcl = ($curRel === '' ? 'root' : $curRel);
            $hasFullRead = ACL::isAdmin($perms) || ACL::canRead($user, $perms, $relForAcl);

            $entries = @scandir($curAbs);
            if ($entries === false) {
                continue;
            }

            foreach ($entries as $name) {
                if (++$scanned > $maxScan) {
                    $truncated = true;
                    break 2;
                }

                if ($name === '.' || $name === '..') {
                    continue;
                }
                if ($name[0] === '.') {
                    continue;
                }
                if (FS::shouldIgnoreEntry($name, $curRel)) {
                    continue;
                }
                if (in_array(strtolower($name), $SKIP, true)) {
                    continue;
                }
                if (!self::isSafeSegment($name)) {
                    continue;
                }

                $abs = $curAbs . DIRECTORY_SEPARATOR . $name;

                if (@is_dir($abs)) {
                    if (@is_link($abs)) {
                        $safe = self::safeReal($base, $abs);
                        if ($safe === null || !is_dir($safe)) {
                            continue;
                        }
                        $abs = $safe;
                    }

                    $childRel = ($curRel === '' ? $name : $curRel . '/' . $name);
                    $childDepth = $depth + 1;
                    if ($maxDepth !== null && $childDepth > $maxDepth) {
                        continue;
                    }
                    $canViewChild = ACL::isAdmin($perms)
                        || ACL::canRead($user, $perms, $childRel)
                        || ACL::canReadOwn($user, $perms, $childRel);
                    if ($canViewChild) {
                        $folderCount++;
                        $stack[] = [$abs, $childRel, $childDepth];
                    } else {
                        $probeDepth = 2;
                        if ($maxDepth !== null) {
                            $remaining = $maxDepth - $childDepth;
                            if ($remaining <= 0) {
                                continue;
                            }
                            $probeDepth = min($probeDepth, $remaining);
                        }
                        if (FS::hasReadableDescendant($base, $abs, $childRel, $user, $perms, $probeDepth)) {
                            $stack[] = [$abs, $childRel, $childDepth];
                        }
                    }
                } elseif (@is_file($abs)) {
                    if (@is_link($abs)) {
                        $safe = self::safeReal($base, $abs);
                        if ($safe === null || !is_file($safe)) {
                            continue;
                        }
                        $abs = $safe;
                    }

                    if (!$hasFullRead) {
                        continue;
                    }

                    $fileCount++;
                    $sz = @filesize($abs);
                    if (is_int($sz) && $sz > 0) {
                        $totalBytes += $sz;
                    }
                }
            }
        }

        return [
            'folders' => $folderCount,
            'files' => $fileCount,
            'bytes' => $totalBytes,
            'truncated' => $truncated,
        ];
    }

    private static function countVisibleRemote(string $folder, string $user, array $perms): array
    {
        $storage = self::storage();

        $canViewFolder = ACL::isAdmin($perms)
            || ACL::canRead($user, $perms, $folder)
            || ACL::canReadOwn($user, $perms, $folder);
        if (!$canViewFolder) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0];
        }

        $hasFullRead = ACL::isAdmin($perms) || ACL::canRead($user, $perms, $folder);

        $base = rtrim(self::uploadRoot(), "/\\");
        if ($base === '') {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0];
        }

        $dirPath = ($folder === 'root')
            ? $base
            : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);

        $entries = $storage->list($dirPath);
        if (!$entries) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0];
        }

        $SKIP   = FS::SKIP();

        $folderCount = 0;
        $fileCount = 0;
        $totalBytes = 0;
        $earliestUploaded = null;
        $latestMtime = null;

        foreach ($entries as $name) {
            if ($name === '.' || $name === '..' || $name === '') {
                continue;
            }
            if ($name[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($name, $folder)) {
                continue;
            }
            if (!FS::isSafeSegment($name)) {
                continue;
            }
            if (in_array(strtolower($name), $SKIP, true)) {
                continue;
            }

            $full = $dirPath . DIRECTORY_SEPARATOR . $name;
            $stat = $storage->stat($full);
            if (!$stat) {
                continue;
            }

            $type = $stat['type'] ?? '';
            if ($type === 'dir') {
                $childRel = ($folder === 'root') ? $name : $folder . '/' . $name;
                if (
                    ACL::isAdmin($perms)
                    || ACL::canRead($user, $perms, $childRel)
                    || ACL::canReadOwn($user, $perms, $childRel)
                ) {
                    $folderCount++;
                }
                continue;
            }

            if ($type !== 'file') {
                continue;
            }
            if (!$hasFullRead) {
                continue;
            }

            $fileCount++;
            $sz = $stat['size'] ?? 0;
            if (is_int($sz) && $sz > 0) {
                $totalBytes += $sz;
            }
            $mt = $stat['mtime'] ?? 0;
            if (is_int($mt) && $mt > 0) {
                if ($earliestUploaded === null || $mt < $earliestUploaded) {
                    $earliestUploaded = $mt;
                }
                if ($latestMtime === null || $mt > $latestMtime) {
                    $latestMtime = $mt;
                }
            }
        }

        $result = [
            'folders' => $folderCount,
            'files'   => $fileCount,
            'bytes'   => $totalBytes,
        ];

        if ($earliestUploaded !== null) {
            $result['earliest_uploaded'] = date(DATE_TIME_FORMAT, $earliestUploaded);
        }
        if ($latestMtime !== null) {
            $result['latest_mtime'] = date(DATE_TIME_FORMAT, $latestMtime);
        }

        return $result;
    }

    private static function countVisibleDeepRemote(string $folder, string $user, array $perms, int $maxScan = 20000, ?int $maxDepth = null): array
    {
        $storage = self::storage();

        $canViewFolder = ACL::isAdmin($perms)
            || ACL::canRead($user, $perms, $folder)
            || ACL::canReadOwn($user, $perms, $folder);
        if (!$canViewFolder) {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0, 'truncated' => false];
        }

        if ($maxDepth !== null) {
            $maxDepth = (int)$maxDepth;
            if ($maxDepth <= 0) {
                $maxDepth = null;
            }
        }

        $base = rtrim(self::uploadRoot(), "/\\");
        if ($base === '') {
            return ['folders' => 0, 'files' => 0, 'bytes' => 0, 'truncated' => false];
        }

        $dirPath = ($folder === 'root')
            ? $base
            : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
        $startRel = ($folder === 'root') ? '' : $folder;

        $SKIP   = FS::SKIP();

        $folderCount = 0;
        $fileCount = 0;
        $totalBytes = 0;
        $scanned = 0;
        $truncated = false;

        $stack = [[$dirPath, $startRel, 0]];
        while ($stack) {
            [$curAbs, $curRel, $depth] = array_pop($stack);
            $relForAcl = ($curRel === '' ? 'root' : $curRel);
            $hasFullRead = ACL::isAdmin($perms) || ACL::canRead($user, $perms, $relForAcl);

            $entries = $storage->list($curAbs);
            if (!$entries) {
                continue;
            }

            foreach ($entries as $name) {
                if (++$scanned > $maxScan) {
                    $truncated = true;
                    break 2;
                }

                if ($name === '.' || $name === '..' || $name === '') {
                    continue;
                }
                if ($name[0] === '.') {
                    continue;
                }
                if (FS::shouldIgnoreEntry($name, $curRel)) {
                    continue;
                }
                if (!FS::isSafeSegment($name)) {
                    continue;
                }
                if (in_array(strtolower($name), $SKIP, true)) {
                    continue;
                }

                $full = $curAbs . DIRECTORY_SEPARATOR . $name;
                $stat = $storage->stat($full);
                if (!$stat) {
                    continue;
                }

                $type = $stat['type'] ?? '';
                if ($type === 'dir') {
                    $childRel = ($curRel === '') ? $name : $curRel . '/' . $name;
                    $childDepth = $depth + 1;
                    if ($maxDepth !== null && $childDepth > $maxDepth) {
                        continue;
                    }
                    $canViewChild = ACL::isAdmin($perms)
                        || ACL::canRead($user, $perms, $childRel)
                        || ACL::canReadOwn($user, $perms, $childRel);
                    if ($canViewChild) {
                        $folderCount++;
                        $stack[] = [$full, $childRel, $childDepth];
                    } else {
                        $probeDepth = 2;
                        if ($maxDepth !== null) {
                            $remaining = $maxDepth - $childDepth;
                            if ($remaining <= 0) {
                                continue;
                            }
                            $probeDepth = min($probeDepth, $remaining);
                        }
                        if (self::hasReadableDescendantRemote($storage, $childRel, $user, $perms, $probeDepth)) {
                            $stack[] = [$full, $childRel, $childDepth];
                        }
                    }
                    continue;
                }

                if ($type !== 'file') {
                    continue;
                }
                if (!$hasFullRead) {
                    continue;
                }

                $fileCount++;
                $sz = $stat['size'] ?? 0;
                if (is_int($sz) && $sz > 0) {
                    $totalBytes += $sz;
                }
            }
        }

        return [
            'folders' => $folderCount,
            'files' => $fileCount,
            'bytes' => $totalBytes,
            'truncated' => $truncated,
        ];
    }

    /* Helpers (private) */
    private static function isSafeSegment(string $name): bool
    {
        if ($name === '.' || $name === '..') {
            return false;
        }
        if (strpos($name, '/') !== false || strpos($name, '\\') !== false) {
            return false;
        }
        if (strpos($name, "\0") !== false) {
            return false;
        }
        if (preg_match('/[\x00-\x1F]/u', $name)) {
            return false;
        }
        $len = mb_strlen($name);
        return $len > 0 && $len <= 255;
    }
    private static function safeReal(string $baseReal, string $p): ?string
    {
        $rp = realpath($p);
        if ($rp === false) {
            return null;
        }
        $base = rtrim($baseReal, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        $rp2  = rtrim($rp, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        if (strpos($rp2, $base) !== 0) {
            return null;
        }
        return rtrim($rp, DIRECTORY_SEPARATOR);
    }

    public static function listChildren(string $folder, string $user, array $perms, ?string $cursor = null, int $limit = 500, bool $probe = true): array
    {
        $storage = self::storage();
        if (!$storage->isLocal()) {
            return self::listChildrenRemote($folder, $user, $perms, $cursor, $limit, $probe);
        }

        $folder  = ACL::normalizeFolder($folder);
        $limit   = max(1, min(2000, $limit));
        $cursor  = ($cursor !== null && $cursor !== '') ? $cursor : null;

        $parentEncrypted = false;
        try {
            $parentEncrypted = FolderCrypto::isEncryptedOrAncestor($folder);
        } catch (\Throwable $e) {
            $parentEncrypted = false;
        }

        $baseReal = realpath(self::uploadRoot());
        if ($baseReal === false) {
            return ['items' => [], 'nextCursor' => null];
        }

        // Resolve target directory
        if ($folder === 'root') {
            $dirReal   = $baseReal;
            $relPrefix = 'root';
        } else {
            $parts = array_filter(explode('/', $folder), fn($p) => $p !== '');
            foreach ($parts as $seg) {
                if (!FS::isSafeSegment($seg)) {
                    return ['items' => [], 'nextCursor' => null];
                }
            }
            $relPrefix = implode('/', $parts);
            $dirGuess  = $baseReal . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
            $dirReal   = FS::safeReal($baseReal, $dirGuess);
            if ($dirReal === null || !is_dir($dirReal)) {
                return ['items' => [], 'nextCursor' => null];
            }
        }

        $SKIP   = FS::SKIP(); // lowercased names to skip (e.g. 'trash', 'profile_pics')

        $entries = @scandir($dirReal);
        if ($entries === false) {
            return ['items' => [], 'nextCursor' => null];
        }

        $rows = []; // each: ['name'=>..., 'locked'=>bool, 'hasSubfolders'=>bool?, 'nonEmpty'=>bool?]
        foreach ($entries as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            if ($item[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($item, $relPrefix)) {
                continue;
            }
            if (!FS::isSafeSegment($item)) {
                continue;
            }

            $lower = strtolower($item);
            if (in_array($lower, $SKIP, true)) {
                continue;
            }

            $full = $dirReal . DIRECTORY_SEPARATOR . $item;
            if (!@is_dir($full)) {
                continue;
            }

            // Symlink defense
            if (@is_link($full)) {
                $safe = FS::safeReal($baseReal, $full);
                if ($safe === null || !is_dir($safe)) {
                    continue;
                }
                $full = $safe;
            }

            // ACL-relative path (for checks)
            $rel = ($relPrefix === 'root') ? $item : $relPrefix . '/' . $item;
            $canView = ACL::canRead($user, $perms, $rel) || ACL::canReadOwn($user, $perms, $rel);
            $locked  = !$canView;

            // ---- quick per-child stats (single-level scan, early exit) ----
            $hasSubs  = null; // at least one subdirectory
            $nonEmpty = null; // any direct entry (file or folder)
            if ($probe) {
                $hasSubs = false;
                $nonEmpty = false;
                try {
                    $it = new \FilesystemIterator($full, \FilesystemIterator::SKIP_DOTS);
                    foreach ($it as $child) {
                        $name = $child->getFilename();
                        if (!$name) {
                            continue;
                        }
                        if ($name[0] === '.') {
                            continue;
                        }
                        if (FS::shouldIgnoreEntry($name, $rel)) {
                            continue;
                        }
                        if (!FS::isSafeSegment($name)) {
                            continue;
                        }
                        if (in_array(strtolower($name), $SKIP, true)) {
                            continue;
                        }

                        $nonEmpty = true;

                        $isDir = $child->isDir();
                        if (!$isDir && $child->isLink()) {
                            $linkReal = FS::safeReal($baseReal, $child->getPathname());
                            $isDir = ($linkReal !== null && is_dir($linkReal));
                        }
                        if ($isDir) {
                            $hasSubs = true;
                            break;
                        } // early exit once we know there's a subfolder
                    }
                } catch (\Throwable $e) {
                    // keep defaults
                }
            }
            // ---------------------------------------------------------------

            if ($locked) {
                // Show a locked row ONLY when this folder has a readable descendant
                if (FS::hasReadableDescendant($baseReal, $full, $rel, $user, $perms, 2)) {
                    $rows[] = [
                        'name'          => $item,
                        'locked'        => true,
                        'hasSubfolders' => $hasSubs,   // fine to keep structural chevrons
                        // nonEmpty intentionally omitted for locked nodes
                    ];
                }
            } else {
                $encrypted = $parentEncrypted;
                if (!$encrypted) {
                    try {
                        $encrypted = FolderCrypto::isEncryptedOrAncestor($rel);
                    } catch (\Throwable $e) {
                        $encrypted = false;
                    }
                }
                $rows[] = [
                    'name'          => $item,
                    'locked'        => false,
                    'hasSubfolders' => $hasSubs,
                    'nonEmpty'      => $nonEmpty,
                    'encrypted'     => $encrypted,
                ];
            }
        }

        // natural order + cursor pagination
        usort($rows, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
        $start = 0;
        if ($cursor !== null) {
            $n = count($rows);
            for ($i = 0; $i < $n; $i++) {
                if (strnatcasecmp($rows[$i]['name'], $cursor) > 0) {
                    $start = $i;
                    break;
                }
                $start = $i + 1;
            }
        }
        $page = array_slice($rows, $start, $limit);
        $nextCursor = null;
        if ($start + count($page) < count($rows)) {
            $last = $page[count($page) - 1];
            $nextCursor = $last['name'];
        }

        return ['items' => $page, 'nextCursor' => $nextCursor];
    }

    private static function listChildrenRemote(string $folder, string $user, array $perms, ?string $cursor, int $limit, bool $probe): array
    {
        $storage = self::storage();
        $folder  = ACL::normalizeFolder($folder);
        $limit   = max(1, min(2000, $limit));
        $cursor  = ($cursor !== null && $cursor !== '') ? $cursor : null;

        $parentEncrypted = false;
        try {
            $parentEncrypted = FolderCrypto::isEncryptedOrAncestor($folder);
        } catch (\Throwable $e) {
            $parentEncrypted = false;
        }

        $base = rtrim(self::uploadRoot(), "/\\");
        $dirPath = ($folder === 'root')
            ? $base
            : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);

        $SKIP   = FS::SKIP();

        $entries = $storage->list($dirPath);
        if (!$entries) {
            return ['items' => [], 'nextCursor' => null];
        }

        $rows = [];
        foreach ($entries as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            if ($item === '' || $item[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($item, $folder)) {
                continue;
            }
            if (!FS::isSafeSegment($item)) {
                continue;
            }

            $lower = strtolower($item);
            if (in_array($lower, $SKIP, true)) {
                continue;
            }

            $full = $dirPath . DIRECTORY_SEPARATOR . $item;
            $stat = $storage->stat($full);
            if (!$stat || ($stat['type'] ?? '') !== 'dir') {
                continue;
            }

            $rel = ($folder === 'root') ? $item : $folder . '/' . $item;
            $canView = ACL::canRead($user, $perms, $rel) || ACL::canReadOwn($user, $perms, $rel);
            $locked  = !$canView;

            if ($locked) {
                if (self::hasReadableDescendantRemote($storage, $rel, $user, $perms, 2)) {
                    $rows[] = [
                        'name'   => $item,
                        'locked' => true,
                    ];
                }
            } else {
                $encrypted = $parentEncrypted;
                if (!$encrypted) {
                    try {
                        $encrypted = FolderCrypto::isEncryptedOrAncestor($rel);
                    } catch (\Throwable $e) {
                        $encrypted = false;
                    }
                }
                $rows[] = [
                    'name'      => $item,
                    'locked'    => false,
                    'encrypted' => $encrypted,
                ];
            }
        }

        usort($rows, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
        $start = 0;
        if ($cursor !== null) {
            $n = count($rows);
            for ($i = 0; $i < $n; $i++) {
                if (strnatcasecmp($rows[$i]['name'], $cursor) > 0) {
                    $start = $i;
                    break;
                }
                $start = $i + 1;
            }
        }
        $page = array_slice($rows, $start, $limit);
        $nextCursor = null;
        if ($start + count($page) < count($rows)) {
            $last = $page[count($page) - 1];
            $nextCursor = $last['name'];
        }

        return ['items' => $page, 'nextCursor' => $nextCursor];
    }

    private static function hasReadableDescendantRemote(
        StorageAdapterInterface $storage,
        string $folder,
        string $user,
        array $perms,
        int $maxDepth
    ): bool {
        if ($maxDepth <= 0) {
            return false;
        }

        $base = rtrim(self::uploadRoot(), "/\\");
        $dirPath = ($folder === 'root')
            ? $base
            : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);

        $entries = $storage->list($dirPath);
        if (!$entries) {
            return false;
        }

        $SKIP   = FS::SKIP();

        foreach ($entries as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            if ($item === '' || $item[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($item, $folder)) {
                continue;
            }
            if (!FS::isSafeSegment($item)) {
                continue;
            }
            if (in_array(strtolower($item), $SKIP, true)) {
                continue;
            }

            $full = $dirPath . DIRECTORY_SEPARATOR . $item;
            $stat = $storage->stat($full);
            if (!$stat || ($stat['type'] ?? '') !== 'dir') {
                continue;
            }

            $childRel = ($folder === 'root') ? $item : $folder . '/' . $item;
            if (ACL::canRead($user, $perms, $childRel) || ACL::canReadOwn($user, $perms, $childRel)) {
                return true;
            }
            if ($maxDepth > 1 && self::hasReadableDescendantRemote($storage, $childRel, $user, $perms, $maxDepth - 1)) {
                return true;
            }
        }

        return false;
    }

    /** Load the folder → owner map. */
    public static function getFolderOwners(): array
    {
        $f = self::folderOwnersPath();
        if (!file_exists($f)) {
            return [];
        }
        $json = json_decode(@file_get_contents($f), true);
        return is_array($json) ? $json : [];
    }

    /** Persist the folder → owner map. */
    public static function saveFolderOwners(array $map): bool
    {
        $path = self::folderOwnersPath();
        return (bool) @file_put_contents($path, json_encode($map, JSON_PRETTY_PRINT), LOCK_EX);
    }

    /** Set (or replace) the owner for a specific folder (relative path or 'root'). */
    public static function setOwnerFor(string $folder, string $owner): void
    {
        $key    = trim($folder, "/\\ ");
        $key    = ($key === '' ? 'root' : $key);
        $owners = self::getFolderOwners();
        $owners[$key] = $owner;
        self::saveFolderOwners($owners);
    }

    /** Get the owner for a folder (relative path or 'root'); returns null if unmapped. */
    public static function getOwnerFor(string $folder): ?string
    {
        $key    = trim($folder, "/\\ ");
        $key    = ($key === '' ? 'root' : $key);
        $owners = self::getFolderOwners();
        return $owners[$key] ?? null;
    }

    /** Rename a single ownership key (old → new). */
    public static function renameOwnerKey(string $old, string $new): void
    {
        $old    = trim($old, "/\\ ");
        $new    = trim($new, "/\\ ");
        $owners = self::getFolderOwners();
        if (isset($owners[$old])) {
            $owners[$new] = $owners[$old];
            unset($owners[$old]);
            self::saveFolderOwners($owners);
        }
    }

    /** Remove ownership for a folder and all its descendants. */
    public static function removeOwnerForTree(string $folder): void
    {
        $folder = trim($folder, "/\\ ");
        $owners = self::getFolderOwners();
        foreach (array_keys($owners) as $k) {
            if ($k === $folder || strpos($k, $folder . '/') === 0) {
                unset($owners[$k]);
            }
        }
        self::saveFolderOwners($owners);
    }

    /** Rename ownership keys for an entire subtree: old/... → new/... */
    public static function renameOwnersForTree(string $oldFolder, string $newFolder): void
    {
        $old = trim($oldFolder, "/\\ ");
        $new = trim($newFolder, "/\\ ");
        $owners = self::getFolderOwners();

        $rebased = [];
        foreach ($owners as $k => $v) {
            if ($k === $old || strpos($k, $old . '/') === 0) {
                $suffix = substr($k, strlen($old));
                // ensure no leading slash duplication
                $suffix = ltrim($suffix, '/');
                $rebased[$new . ($suffix !== '' ? '/' . $suffix : '')] = $v;
            } else {
                $rebased[$k] = $v;
            }
        }
        self::saveFolderOwners($rebased);
    }

    /* ============================================================
     * Existing helpers
     * ============================================================ */

    /**
     * Resolve a (possibly nested) relative folder like "invoices/2025" to a real path
     * under UPLOAD_DIR. Validates each path segment against REGEX_FOLDER_NAME, enforces
     * containment, and (optionally) creates the folder.
     *
     * @param string $folder  Relative folder or "root"
     * @param bool   $create  Create the folder if missing
     * @return array [string|null $realPath, string   $relative, string|null $error]
     */
    private static function resolveFolderPath(string $folder, bool $create = false): array
    {
        $folder   = trim($folder) ?: 'root';
        $relative = 'root';

        $storage = self::storage();
        $isLocal = $storage->isLocal();
        $base = $isLocal ? realpath(self::uploadRoot()) : rtrim(self::uploadRoot(), '/\\');
        if ($base === false || $base === '') {
            return [null, 'root', "Uploads directory not configured correctly."];
        }

        if (strtolower($folder) === 'root') {
            $dir = $base;
        } else {
            // validate each segment against REGEX_FOLDER_NAME
            $parts = array_filter(explode('/', trim($folder, "/\\ ")), fn($p) => $p !== '');
            if (empty($parts)) {
                return [null, 'root', "Invalid folder name."];
            }
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    return [null, 'root', "Invalid folder name."];
                }
            }
            $relative = implode('/', $parts);
            $dir      = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
        }

        $dirStat = $isLocal ? null : $storage->stat($dir);
        $dirExists = $isLocal ? is_dir($dir) : ($dirStat !== null && ($dirStat['type'] ?? '') === 'dir');
        if (!$dirExists) {
            if ($create) {
                if (!$storage->mkdir($dir, 0775, true)) {
                    return [null, $relative, "Failed to create folder."];
                }
            } else {
                return [null, $relative, "Folder does not exist."];
            }
        }

        if ($isLocal) {
            $real = realpath($dir);
            if ($real === false || strpos($real, $base) !== 0) {
                return [null, $relative, "Invalid folder path."];
            }
            return [$real, $relative, null];
        }

        return [$dir, $relative, null];
    }

    private static function resolveFolderPathForAdapter(StorageAdapterInterface $storage, string $root, string $folder, bool $create = false): array
    {
        $folder   = trim($folder) ?: 'root';
        $relative = 'root';

        $isLocal = $storage->isLocal();
        $base = $isLocal ? realpath($root) : rtrim($root, '/\\');
        if ($base === false || $base === '') {
            return [null, 'root', "Uploads directory not configured correctly."];
        }

        if (strtolower($folder) === 'root') {
            $dir = $base;
        } else {
            $parts = array_filter(explode('/', trim($folder, "/\\ ")), fn($p) => $p !== '');
            if (empty($parts)) {
                return [null, 'root', "Invalid folder name."];
            }
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    return [null, 'root', "Invalid folder name."];
                }
            }
            $relative = implode('/', $parts);
            $dir      = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
        }

        $dirStat = $isLocal ? null : $storage->stat($dir);
        $dirExists = $isLocal ? is_dir($dir) : ($dirStat !== null && ($dirStat['type'] ?? '') === 'dir');
        if (!$dirExists) {
            if ($create) {
                if (!$storage->mkdir($dir, 0775, true)) {
                    return [null, $relative, "Failed to create folder."];
                }
            } else {
                return [null, $relative, "Folder does not exist."];
            }
        }

        if ($isLocal) {
            $real = realpath($dir);
            if ($real === false || strpos($real, $base) !== 0) {
                return [null, $relative, "Invalid folder path."];
            }
            return [$real, $relative, null];
        }

        return [$dir, $relative, null];
    }

    private static function crossSourceLimit(string $envKey, int $default): int
    {
        $val = getenv($envKey);
        if ($val === false || trim((string)$val) === '') {
            return $default;
        }
        if (!is_numeric($val)) {
            return $default;
        }
        $int = (int)$val;
        return $int > 0 ? $int : $default;
    }

    private static function getCopyTreeLimits(): array
    {
        $maxFiles = self::crossSourceLimit('FR_XCOPY_MAX_FILES', 5000);
        $maxBytes = self::crossSourceLimit('FR_XCOPY_MAX_BYTES', 5 * 1024 * 1024 * 1024);
        $maxDepth = self::crossSourceLimit('FR_XCOPY_MAX_DEPTH', 15);
        return [$maxFiles, $maxBytes, $maxDepth];
    }

    private static function scanFolderTreeForCopy(
        StorageAdapterInterface $storage,
        string $baseAbs,
        int $maxFiles,
        int $maxBytes,
        int $maxDepth
    ): array {
        $queue = [
            ['abs' => $baseAbs, 'rel' => '', 'depth' => 0],
        ];
        $folders = [''];
        $filesByFolder = [];
        $errors = [];
        $fileCount = 0;
        $totalBytes = 0;

        $SKIP   = FS::SKIP();

        while ($queue) {
            $node = array_shift($queue);
            if (!is_array($node)) {
                continue;
            }
            $depth = (int)($node['depth'] ?? 0);
            if ($depth > $maxDepth) {
                return ['error' => 'Folder copy exceeds depth limit.'];
            }
            $abs = (string)($node['abs'] ?? '');
            if ($abs === '') {
                continue;
            }
            $rel = (string)($node['rel'] ?? '');

            $entries = $storage->list($abs);
            if (!$entries) {
                continue;
            }

            foreach ($entries as $name) {
                if ($name === '.' || $name === '..') {
                    continue;
                }
                if ($name === '' || $name[0] === '.') {
                    continue;
                }
                if (FS::shouldIgnoreEntry($name, $rel)) {
                    continue;
                }
                if (!FS::isSafeSegment($name)) {
                    continue;
                }

                $lower = strtolower($name);
                if (in_array($lower, $SKIP, true)) {
                    continue;
                }

                $childAbs = $abs . DIRECTORY_SEPARATOR . $name;
                $stat = $storage->stat($childAbs);
                if (!$stat) {
                    continue;
                }
                $type = (string)($stat['type'] ?? '');
                if ($type === 'dir') {
                    $childRel = ($rel === '') ? $name : ($rel . '/' . $name);
                    $folders[] = $childRel;
                    $queue[] = [
                        'abs' => $childAbs,
                        'rel' => $childRel,
                        'depth' => $depth + 1,
                    ];
                    continue;
                }
                if ($type !== 'file') {
                    continue;
                }

                if (!preg_match(REGEX_FILE_NAME, $name)) {
                    $errors[] = "{$name} has an invalid name.";
                    continue;
                }

                if (!isset($filesByFolder[$rel])) {
                    $filesByFolder[$rel] = [];
                }
                $filesByFolder[$rel][] = $name;
                $fileCount++;

                $size = isset($stat['size']) ? (int)$stat['size'] : 0;
                if ($size > 0) {
                    $totalBytes += $size;
                }
                if ($fileCount > $maxFiles) {
                    return ['error' => 'Folder copy exceeds file limit.', 'errors' => $errors];
                }
                if ($totalBytes > $maxBytes) {
                    return ['error' => 'Folder copy exceeds size limit.', 'errors' => $errors];
                }
            }
        }

        return [
            'folders' => $folders,
            'files' => $filesByFolder,
            'errors' => $errors,
            'fileCount' => $fileCount,
            'totalBytes' => $totalBytes,
        ];
    }

    private static function ensureDestinationFolders(
        StorageAdapterInterface $storage,
        string $baseAbs,
        array $folders
    ): ?string {
        foreach ($folders as $rel) {
            if (!is_string($rel) || $rel === '') {
                continue;
            }
            $destAbs = $baseAbs . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
            if (!$storage->mkdir($destAbs, 0775, true)) {
                return "Failed to create destination folder: {$rel}.";
            }
        }
        return null;
    }

    private static function copyFolderTreeInternal(
        StorageAdapterInterface $srcStorage,
        StorageAdapterInterface $dstStorage,
        string $srcRoot,
        string $dstRoot,
        string $sourceFolder,
        string $targetFolder,
        callable $copyFilesFn
    ): array {
        $sourceFolder = trim((string)$sourceFolder, "/\\ ");
        $targetFolder = trim((string)$targetFolder, "/\\ ");
        if ($sourceFolder === '' || strtolower($sourceFolder) === 'root') {
            return ['error' => 'Invalid source folder.'];
        }
        if ($targetFolder === '' || strtolower($targetFolder) === 'root') {
            return ['error' => 'Invalid destination folder.'];
        }

        [$srcAbs, , $err] = self::resolveFolderPathForAdapter($srcStorage, $srcRoot, $sourceFolder, false);
        if ($err) {
            return ['error' => $err];
        }

        $normalizedTarget = str_replace('\\', '/', $targetFolder);
        $targetName = basename($normalizedTarget);
        if ($targetName === '' || !preg_match(REGEX_FOLDER_NAME, $targetName)) {
            return ['error' => 'Invalid destination folder name.'];
        }
        $parentKey = dirname($normalizedTarget);
        if ($parentKey === '.' || $parentKey === '') {
            $parentKey = 'root';
        } else {
            $parentKey = trim($parentKey, '/');
            if ($parentKey === '') {
                $parentKey = 'root';
            }
        }

        [$dstParentAbs, , $err] = self::resolveFolderPathForAdapter($dstStorage, $dstRoot, $parentKey, false);
        if ($err) {
            return ['error' => $err];
        }

        $targetAbs = rtrim($dstParentAbs, "/\\") . DIRECTORY_SEPARATOR . $targetName;
        if ($dstStorage->stat($targetAbs) !== null) {
            return ['error' => 'Destination folder already exists.'];
        }
        if (!$dstStorage->mkdir($targetAbs, 0775, true)) {
            return ['error' => 'Failed to create destination folder.'];
        }

        [$maxFiles, $maxBytes, $maxDepth] = self::getCopyTreeLimits();
        $scan = self::scanFolderTreeForCopy($srcStorage, $srcAbs, $maxFiles, $maxBytes, $maxDepth);
        if (isset($scan['error'])) {
            return ['error' => $scan['error']];
        }

        $folders = $scan['folders'] ?? [''];
        $fileMap = $scan['files'] ?? [];
        $errors  = $scan['errors'] ?? [];

        $mkdirErr = self::ensureDestinationFolders($dstStorage, $targetAbs, $folders);
        if ($mkdirErr !== null) {
            $errors[] = $mkdirErr;
        }

        foreach ($fileMap as $rel => $names) {
            if (!is_array($names) || empty($names)) {
                continue;
            }
            $srcKey = ($rel === '') ? $sourceFolder : ($sourceFolder . '/' . $rel);
            $dstKey = ($rel === '') ? $targetFolder : ($targetFolder . '/' . $rel);
            $result = $copyFilesFn($srcKey, $dstKey, $names);
            if (is_array($result) && isset($result['error'])) {
                $errors[] = $result['error'];
            }
        }

        if (!empty($errors)) {
            return ['error' => implode('; ', $errors), 'target' => $targetFolder];
        }

        return ['success' => true, 'target' => $targetFolder];
    }

    public static function copyFolderSameSource(string $sourceFolder, string $targetFolder): array
    {
        $storage = self::storage();
        $root = self::uploadRoot();
        return self::copyFolderTreeInternal(
            $storage,
            $storage,
            $root,
            $root,
            $sourceFolder,
            $targetFolder,
            static function (string $srcKey, string $dstKey, array $files): array {
                return FileModel::copyFiles($srcKey, $dstKey, $files);
            }
        );
    }

    public static function copyFolderAcrossSources(
        string $sourceId,
        string $destinationId,
        string $sourceFolder,
        string $targetFolder
    ): array {
        $srcStorage = StorageRegistry::getAdapter($sourceId);
        $dstStorage = StorageRegistry::getAdapter($destinationId);

        $srcRoot = class_exists('SourceContext')
            ? SourceContext::uploadRootForId($sourceId)
            : rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
        $dstRoot = class_exists('SourceContext')
            ? SourceContext::uploadRootForId($destinationId)
            : rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;

        return self::copyFolderTreeInternal(
            $srcStorage,
            $dstStorage,
            $srcRoot,
            $dstRoot,
            $sourceFolder,
            $targetFolder,
            static function (string $srcKey, string $dstKey, array $files) use ($sourceId, $destinationId): array {
                return FileModel::copyFilesAcrossSources($sourceId, $destinationId, $srcKey, $dstKey, $files);
            }
        );
    }

    public static function moveFolderAcrossSources(
        string $sourceId,
        string $destinationId,
        string $sourceFolder,
        string $targetFolder
    ): array {
        $result = self::copyFolderAcrossSources($sourceId, $destinationId, $sourceFolder, $targetFolder);
        if (!empty($result['error'])) {
            return $result;
        }

        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $prev = SourceContext::getActiveId();
            SourceContext::setActiveId($sourceId, false, true);
            try {
                $del = self::deleteFolderRecursiveAdmin($sourceFolder);
            } finally {
                SourceContext::setActiveId($prev, false);
            }
        } else {
            $del = self::deleteFolderRecursiveAdmin($sourceFolder);
        }

        if (!empty($del['error'])) {
            return ['error' => 'Failed to remove source folder after copy: ' . $del['error'], 'target' => $targetFolder];
        }

        return $result;
    }

    /** Build metadata file path for a given (relative) folder. */
    private static function getMetadataFilePath(string $folder): string
    {
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            return self::metaRoot() . "root_metadata.json";
        }
        return self::metaRoot() . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
    }

    /**
     * Creates a folder under the specified parent (or in root) and creates an empty metadata file.
     * Also records the creator as the owner (if a session user is available).
     */

    /**
     * Create a folder on disk and register it in ACL with the creator as owner.
     * @param string $folderName leaf name
     * @param string $parent     'root' or nested key (e.g. 'team/reports')
     * @param string $creator    username to set as initial owner (falls back to 'admin')
     */
    public static function createFolder(string $folderName, string $parent, string $creator): array
    {
        // -------- Normalize incoming values (use ONLY the parameters) --------
        $folderName = trim((string)$folderName);
        $parentIn   = trim((string)$parent);

        // If the client sent a path in folderName (e.g., "bob/new-sub") and parent is root/empty,
        // derive parent = "bob" and folderName = "new-sub" so permission checks hit "bob".
        $normalized = ACL::normalizeFolder($folderName);
        if (
            $normalized !== 'root' && strpos($normalized, '/') !== false &&
            ($parentIn === '' || strcasecmp($parentIn, 'root') === 0)
        ) {
            $parentIn  = trim(str_replace('\\', '/', dirname($normalized)), '/');
            $folderName = basename($normalized);
            if ($parentIn === '' || strcasecmp($parentIn, 'root') === 0) {
                $parentIn = 'root';
            }
        }

        $parent = ($parentIn === '' || strcasecmp($parentIn, 'root') === 0) ? 'root' : $parentIn;
        $folderName = trim($folderName);
        if ($folderName === '') {
            return ['success' => false, 'error' => 'Folder name required'];
        }

        // ACL key for new folder
        $newKey = ($parent === 'root') ? $folderName : ($parent . '/' . $folderName);

        // -------- Compose filesystem paths --------
        $base = rtrim(self::uploadRoot(), "/\\");
        $parentRel = ($parent === 'root') ? '' : str_replace('/', DIRECTORY_SEPARATOR, $parent);
        $parentAbs = $parentRel ? ($base . DIRECTORY_SEPARATOR . $parentRel) : $base;
        $newAbs = $parentAbs . DIRECTORY_SEPARATOR . $folderName;
        $storage = self::storage();
        $isLocal = $storage->isLocal();

        // -------- Exists / sanity checks --------
        $parentStat = $isLocal ? null : $storage->stat($parentAbs);
        $parentExists = $isLocal
            ? is_dir($parentAbs)
            : ($parentStat !== null && ($parentStat['type'] ?? '') === 'dir');
        if (!$parentExists) {
            return ['success' => false, 'error' => 'Parent folder does not exist'];
        }
        if ($storage->stat($newAbs) !== null) {
            return ['success' => false, 'error' => 'Folder already exists'];
        }

        // -------- Create directory --------
        if (!$storage->mkdir($newAbs, 0775, true)) {
            $err = error_get_last();
            return ['success' => false, 'error' => 'Failed to create folder' . (!empty($err['message']) ? (': ' . $err['message']) : '')];
        }

        // -------- Seed ACL --------
        $inherit = defined('ACL_INHERIT_ON_CREATE') && ACL_INHERIT_ON_CREATE;
        try {
            if ($inherit) {
                // Copy parent’s explicit (legacy 5 buckets), add creator to owners
                $p = ACL::explicit($parent); // owners, read, write, share, read_own
                $owners = array_values(array_unique(array_map('strval', array_merge($p['owners'], [$creator]))));
                $read   = $p['read'];
                $write  = $p['write'];
                $share  = $p['share'];
                ACL::upsert($newKey, $owners, $read, $write, $share);
            } else {
                // Creator owns the new folder
                ACL::ensureFolderRecord($newKey, $creator);
            }
        } catch (Throwable $e) {
            // Roll back FS if ACL seeding fails
            $storage->delete($newAbs);
            return ['success' => false, 'error' => 'Failed to seed ACL: ' . $e->getMessage()];
        }

        return ['success' => true, 'folder' => $newKey];
    }


    public static function deleteFolderRecursiveAdmin(string $folder): array
    {
        if (strtolower($folder) === 'root') {
            return ['error' => 'Cannot delete root folder.'];
        }

        $storage = self::storage();
        if (!$storage->isLocal()) {
            return self::deleteFolderRecursiveAdminRemote($folder);
        }

        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) {
            return ['error' => $err];
        }

        if (!is_dir($real)) {
            return ['error' => 'Folder not found.'];
        }

        $errors = [];

        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($real, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($it as $path => $info) {
            if ($info->isDir()) {
                if (!@rmdir($path)) {
                    $errors[] = "Failed to delete directory: {$path}";
                }
            } else {
                if (!@unlink($path)) {
                    $errors[] = "Failed to delete file: {$path}";
                }
            }
        }

        if (!@rmdir($real)) {
            $errors[] = "Failed to delete directory: {$real}";
        }

    // Remove metadata JSONs for this subtree
        $relative = trim($relative, "/\\ ");
        if ($relative !== '' && $relative !== 'root') {
            $prefix = str_replace(['/', '\\', ' '], '-', $relative);
            $globPat = self::metaRoot() . $prefix . '*_metadata.json';
            $metaFiles = glob($globPat) ?: [];
            foreach ($metaFiles as $mf) {
                @unlink($mf);
            }
        }

    // Remove ownership mappings for the subtree.
        self::removeOwnerForTree($relative);
    // Remove ACL entries for the subtree (best-effort).
        try {
            ACL::deleteTree($relative);
        } catch (\Throwable $e) {
/* ignore */
        }
    // Remove folder encryption markers for the subtree (best-effort).
        try {
            FolderCrypto::removeSubtree($relative);
        } catch (\Throwable $e) {
/* ignore */
        }

        if ($errors) {
            return ['error' => implode('; ', $errors)];
        }

        return ['success' => 'Folder and all contents deleted.'];
    }

    private static function deleteFolderRecursiveAdminRemote(string $folder): array
    {
        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) {
            return ['error' => $err];
        }

        $storage = self::storage();
        $errors = [];
        $dirs = [];
        $stack = [$real];

        while ($stack) {
            $cur = array_pop($stack);
            $dirs[] = $cur;

            $entries = $storage->list($cur);
            if (!$entries) {
                continue;
            }

            foreach ($entries as $name) {
                if ($name === '.' || $name === '..' || $name === '') {
                    continue;
                }
                $child = $cur . DIRECTORY_SEPARATOR . $name;
                $stat = $storage->stat($child);
                $type = ($stat !== null && isset($stat['type'])) ? $stat['type'] : 'file';
                if ($type === 'dir') {
                    $stack[] = $child;
                } else {
                    if (!$storage->delete($child)) {
                        $errors[] = "Failed to delete file: {$child}";
                    }
                }
            }
        }

        foreach (array_reverse($dirs) as $dirPath) {
            if (!$storage->delete($dirPath)) {
                $errors[] = "Failed to delete directory: {$dirPath}";
            }
        }

        // Remove metadata JSONs for this subtree
        $relative = trim($relative, "/\\ ");
        if ($relative !== '' && $relative !== 'root') {
            $prefix = str_replace(['/', '\\', ' '], '-', $relative);
            $globPat = self::metaRoot() . $prefix . '*_metadata.json';
            $metaFiles = glob($globPat) ?: [];
            foreach ($metaFiles as $mf) {
                @unlink($mf);
            }
        }

        // Remove ownership mappings for the subtree.
        self::removeOwnerForTree($relative);
        // Remove ACL entries for the subtree (best-effort).
        try {
            ACL::deleteTree($relative);
        } catch (\Throwable $e) {
/* ignore */
        }
        // Remove folder encryption markers for the subtree (best-effort).
        try {
            FolderCrypto::removeSubtree($relative);
        } catch (\Throwable $e) {
/* ignore */
        }

        if ($errors) {
            return ['error' => implode('; ', $errors)];
        }

        return ['success' => 'Folder and all contents deleted.'];
    }


    /**
     * Deletes a folder if it is empty and removes its corresponding metadata.
     * Also removes ownership mappings for this folder and all its descendants.
     */
    public static function deleteFolder(string $folder): array
    {
        if (strtolower($folder) === 'root') {
            return ["error" => "Cannot delete root folder."];
        }

        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) {
            return ["error" => $err];
        }
        $storage = self::storage();

        try {
            UploadModel::cleanupResumableForFolder($relative);
        } catch (\Throwable $e) {
/* ignore */
        }

        // Prevent deletion if not empty.
        if ($storage->isLocal()) {
            $items = array_diff(@scandir($real) ?: [], array('.', '..'));
        } else {
            $markerName = defined('FR_REMOTE_DIR_MARKER') ? (string)FR_REMOTE_DIR_MARKER : '.filerise_keep';
            $items = array_values(array_filter(
                $storage->list($real),
                static function ($n) use ($markerName) {
                    if ($n === '.' || $n === '..' || $n === '') {
                        return false;
                    }
                    if ($markerName !== '' && $n === $markerName) {
                        return false;
                    }
                    return true;
                }
            ));
        }
        if (count($items) > 0) {
            return ["error" => "Folder is not empty."];
        }

        if (!$storage->isLocal()) {
            $markerName = defined('FR_REMOTE_DIR_MARKER') ? (string)FR_REMOTE_DIR_MARKER : '.filerise_keep';
            if ($markerName !== '') {
                $markerPath = rtrim($real, '/\\') . DIRECTORY_SEPARATOR . $markerName;
                $storage->delete($markerPath);
            }
        }

        if (!$storage->delete($real)) {
            return ["error" => "Failed to delete folder."];
        }

        // Remove metadata file (best-effort).
        $metadataFile = self::getMetadataFilePath($relative);
        if (file_exists($metadataFile)) {
            @unlink($metadataFile);
        }

        // Remove ownership mappings for the subtree.
        self::removeOwnerForTree($relative);
        // Remove ACL entries for the subtree (best-effort).
        try {
            ACL::deleteTree($relative);
        } catch (\Throwable $e) {
/* ignore */
        }
        // Remove folder encryption markers for the subtree (best-effort).
        try {
            FolderCrypto::removeSubtree($relative);
        } catch (\Throwable $e) {
/* ignore */
        }

        return ["success" => true];
    }

    /**
     * Renames a folder and updates related metadata files (by renaming their filenames).
     * Also rewrites ownership keys for the whole subtree from old → new.
     */
    public static function renameFolder(string $oldFolder, string $newFolder): array
    {
        $oldFolder = trim($oldFolder, "/\\ ");
        $newFolder = trim($newFolder, "/\\ ");

        // Validate names (per-segment)
        foreach ([$oldFolder, $newFolder] as $f) {
            $parts = array_filter(explode('/', $f), fn($p) => $p !== '');
            if (empty($parts)) {
                return ["error" => "Invalid folder name(s)."];
            }
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    return ["error" => "Invalid folder name(s)."];
                }
            }
        }

        [$oldReal, $oldRel, $err] = self::resolveFolderPath($oldFolder, false);
        if ($err) {
            return ["error" => $err];
        }

        $storage = self::storage();
        $isLocal = $storage->isLocal();
        $base = $isLocal ? realpath(self::uploadRoot()) : rtrim(self::uploadRoot(), '/\\');
        if ($base === false || $base === '') {
            return ["error" => "Uploads directory not configured correctly."];
        }

        $newParts = array_filter(explode('/', $newFolder), fn($p) => $p !== '');
        $newRel   = implode('/', $newParts);
        $newPath  = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $newParts);

        // Parent of new path must exist
        $newParent = dirname($newPath);
        if ($isLocal) {
            if (!is_dir($newParent) || strpos(realpath($newParent), $base) !== 0) {
                return ["error" => "Invalid folder path."];
            }
            if (file_exists($newPath)) {
                return ["error" => "New folder name already exists."];
            }
        } else {
            $parentStat = $storage->stat($newParent);
            if ($parentStat === null || ($parentStat['type'] ?? '') !== 'dir') {
                return ["error" => "Invalid folder path."];
            }
            if ($storage->stat($newPath) !== null) {
                return ["error" => "New folder name already exists."];
            }
        }
        if (!$storage->move($oldReal, $newPath)) {
            return ["error" => "Failed to rename folder."];
        }

        // Update metadata filenames (prefix-rename)
        $oldPrefix = str_replace(['/', '\\', ' '], '-', $oldRel);
        $newPrefix = str_replace(['/', '\\', ' '], '-', $newRel);
        $globPat   = self::metaRoot() . $oldPrefix . '*_metadata.json';
        $metadataFiles = glob($globPat) ?: [];

        foreach ($metadataFiles as $oldMetaFile) {
            $baseName   = basename($oldMetaFile);
            $newBase    = preg_replace('/^' . preg_quote($oldPrefix, '/') . '/', $newPrefix, $baseName);
            $newMeta    = self::metaRoot() . $newBase;
            @rename($oldMetaFile, $newMeta);
        }

        // Update ownership mapping for the entire subtree.
        self::renameOwnersForTree($oldRel, $newRel);
        // Re-key explicit ACLs for the moved subtree
        ACL::renameTree($oldRel, $newRel);
        // Migrate folder encryption markers for the moved subtree (best-effort).
        try {
            FolderCrypto::migrateSubtree($oldRel, $newRel);
        } catch (\Throwable $e) {
/* ignore */
        }

        return ["success" => true];
    }

    /**
     * Recursively scans a directory for subfolders (relative paths).
     */
    private static function getSubfolders(string $dir, string $relative = ''): array
    {
        $folders = [];
        $items   = @scandir($dir) ?: [];
        $SKIP    = FS::SKIP();
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            if ($item === '' || $item[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($item, $relative)) {
                continue;
            }
            if (!preg_match(REGEX_FOLDER_NAME, $item)) {
                continue;
            }
            if (in_array(strtolower($item), $SKIP, true)) {
                continue;
            }

            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path)) {
                $folderPath = ($relative ? $relative . '/' : '') . $item;
                $folders[]  = $folderPath;
                $folders    = array_merge($folders, self::getSubfolders($path, $folderPath));
            }
        }
        return $folders;
    }

    /**
     * Retrieves the list of folders (including "root") along with file count metadata.
     * (Ownership filtering is handled in the controller; this function remains unchanged.)
     */
    public static function getFolderList($parent = null, ?string $username = null, array $perms = [], bool $includeCounts = true): array
    {
        $storage = self::storage();
        if (!$storage->isLocal()) {
            return self::getFolderListRemote($parent, $username, $perms, $includeCounts);
        }

        $baseDir = realpath(self::uploadRoot());
        if ($baseDir === false) {
            return []; // or ["error" => "..."]
        }

        $folderInfoList = [];

        // root
        $rootMetaFile   = self::getMetadataFilePath('root');
        $rootFileCount  = null;
        if ($includeCounts && file_exists($rootMetaFile)) {
            $rootMetadata = json_decode(file_get_contents($rootMetaFile), true);
            $rootFileCount = is_array($rootMetadata) ? count($rootMetadata) : 0;
        }
        $folderInfoList[] = [
            "folder"       => "root",
            "fileCount"    => $rootFileCount,
            "metadataFile" => basename($rootMetaFile)
        ];

        // subfolders
        $subfolders = is_dir($baseDir) ? self::getSubfolders($baseDir) : [];
        foreach ($subfolders as $folder) {
            $metaFile = self::getMetadataFilePath($folder);
            $fileCount = null;
            if ($includeCounts && file_exists($metaFile)) {
                $metadata = json_decode(file_get_contents($metaFile), true);
                $fileCount = is_array($metadata) ? count($metadata) : 0;
            }
            $folderInfoList[] = [
                "folder"       => $folder,
                "fileCount"    => $fileCount,
                "metadataFile" => basename($metaFile)
            ];
        }

        if ($username !== null) {
            $folderInfoList = array_values(array_filter(
                $folderInfoList,
                fn($row) => ACL::canRead($username, $perms, $row['folder'])
            ));
        }
        return $folderInfoList;
    }

    private static function getFolderListRemote(?string $parent, ?string $username, array $perms, bool $includeCounts): array
    {
        $storage = self::storage();
        $base = rtrim(self::uploadRoot(), "/\\");

        $folderInfoList = [];
        $rootMetaFile   = self::getMetadataFilePath('root');
        $rootFileCount  = null;
        if ($includeCounts && file_exists($rootMetaFile)) {
            $rootMetadata = json_decode(file_get_contents($rootMetaFile), true);
            $rootFileCount = is_array($rootMetadata) ? count($rootMetadata) : 0;
        }
        $folderInfoList[] = [
            "folder"       => "root",
            "fileCount"    => $rootFileCount,
            "metadataFile" => basename($rootMetaFile)
        ];

        if ($parent !== null && !$includeCounts) {
            $folderInfoList = self::getFolderListRemoteShallow($parent, $includeCounts);
            if ($username !== null) {
                $folderInfoList = array_values(array_filter(
                    $folderInfoList,
                    fn($row) => ACL::canRead($username, $perms, $row['folder'])
                ));
            }
            return $folderInfoList;
        }

        $maxFolders = 20000;
        $scanned = 0;
        $queue = [['root', $base]];

        $SKIP   = FS::SKIP();

        while ($queue && $scanned < $maxFolders) {
            [$rel, $abs] = array_shift($queue);
            $entries = $storage->list($abs);
            if (!$entries) {
                continue;
            }

            foreach ($entries as $name) {
                if ($name === '.' || $name === '..') {
                    continue;
                }
                if ($name === '' || $name[0] === '.') {
                    continue;
                }
                if (FS::shouldIgnoreEntry($name, $rel)) {
                    continue;
                }
                if (!FS::isSafeSegment($name)) {
                    continue;
                }
                if (in_array(strtolower($name), $SKIP, true)) {
                    continue;
                }

                $childAbs = $abs . DIRECTORY_SEPARATOR . $name;
                $stat = $storage->stat($childAbs);
                if (!$stat || ($stat['type'] ?? '') !== 'dir') {
                    continue;
                }

                $childRel = ($rel === 'root') ? $name : ($rel . '/' . $name);

                $metaFile = self::getMetadataFilePath($childRel);
                $fileCount = null;
                if ($includeCounts && file_exists($metaFile)) {
                    $metadata = json_decode(file_get_contents($metaFile), true);
                    $fileCount = is_array($metadata) ? count($metadata) : 0;
                }

                $folderInfoList[] = [
                    "folder"       => $childRel,
                    "fileCount"    => $fileCount,
                    "metadataFile" => basename($metaFile)
                ];

                $queue[] = [$childRel, $childAbs];
                $scanned++;
                if ($scanned >= $maxFolders) {
                    break;
                }
            }
        }

        if ($username !== null) {
            $folderInfoList = array_values(array_filter(
                $folderInfoList,
                fn($row) => ACL::canRead($username, $perms, $row['folder'])
            ));
        }

        return $folderInfoList;
    }

    private static function getFolderListRemoteShallow(string $parent, bool $includeCounts): array
    {
        $storage = self::storage();
        $base = rtrim(self::uploadRoot(), "/\\");
        $parentRel = (strcasecmp($parent, 'root') === 0 || $parent === '')
            ? 'root'
            : trim($parent, "/\\");
        $parentAbs = ($parentRel === 'root') ? $base : ($base . DIRECTORY_SEPARATOR . $parentRel);

        $folderInfoList = [];
        $metaTarget = ($parentRel === 'root') ? 'root' : $parentRel;
        $rootMetaFile = self::getMetadataFilePath($metaTarget);
        $rootFileCount = null;
        if ($includeCounts && file_exists($rootMetaFile)) {
            $rootMetadata = json_decode(file_get_contents($rootMetaFile), true);
            $rootFileCount = is_array($rootMetadata) ? count($rootMetadata) : 0;
        }
        $folderInfoList[] = [
            "folder"       => $metaTarget,
            "fileCount"    => $rootFileCount,
            "metadataFile" => basename($rootMetaFile)
        ];

        $entries = $storage->list($parentAbs);
        if (!$entries) {
            return $folderInfoList;
        }

        $SKIP   = FS::SKIP();

        foreach ($entries as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            if ($name === '' || $name[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($name, $parentRel)) {
                continue;
            }
            if (!FS::isSafeSegment($name)) {
                continue;
            }
            if (in_array(strtolower($name), $SKIP, true)) {
                continue;
            }

            $childAbs = $parentAbs . DIRECTORY_SEPARATOR . $name;
            $stat = $storage->stat($childAbs);
            if (!$stat || ($stat['type'] ?? '') !== 'dir') {
                continue;
            }

            $childRel = ($parentRel === 'root') ? $name : ($parentRel . '/' . $name);
            $metaFile = self::getMetadataFilePath($childRel);
            $fileCount = null;
            if ($includeCounts && file_exists($metaFile)) {
                $metadata = json_decode(file_get_contents($metaFile), true);
                $fileCount = is_array($metadata) ? count($metadata) : 0;
            }

            $folderInfoList[] = [
                "folder"       => $childRel,
                "fileCount"    => $fileCount,
                "metadataFile" => basename($metaFile)
            ];
        }

        return $folderInfoList;
    }

    private static function findShareFolderRecord(string $token): ?array
    {
        $token = (string)$token;
        $readRecord = function (string $path, string $token): ?array {
            if (!is_file($path)) {
                return null;
            }
            $shareLinks = json_decode((string)@file_get_contents($path), true);
            if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
                return null;
            }
            return $shareLinks[$token];
        };

        $currentId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';
        $shareFile = self::metaRoot() . "share_folder_links.json";
        $record = $readRecord($shareFile, $token);
        if ($record) {
            return $record;
        }

        if (!class_exists('SourceContext') || !SourceContext::sourcesEnabled()) {
            return null;
        }

        $sources = SourceContext::listAllSources();
        foreach ($sources as $src) {
            if (isset($src['enabled']) && !$src['enabled']) {
                continue;
            }
            $id = (string)($src['id'] ?? '');
            if ($id === '' || $id === $currentId) {
                continue;
            }
            $path = SourceContext::metaRootForId($id) . "share_folder_links.json";
            $record = $readRecord($path, $token);
            if ($record) {
                SourceContext::setActiveId($id, false);
                return $record;
            }
        }

        return null;
    }

    /**
     * Retrieves the share folder record for a given token.
     */
    public static function getShareFolderRecord(string $token): ?array
    {
        return self::findShareFolderRecord($token);
    }

    private static function normalizeShareSubPath(string $raw): array
    {
        $path = str_replace('\\', '/', trim((string)$raw));
        $path = trim($path, "/ \t\n\r\0\x0B");
        if ($path === '') {
            return ['', null];
        }
        $parts = array_filter(explode('/', $path), fn($p) => $p !== '');
        if (empty($parts)) {
            return ['', null];
        }
        foreach ($parts as $seg) {
            if ($seg === '.' || $seg === '..') {
                return ['', "Invalid folder name."];
            }
            if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                return ['', "Invalid folder name."];
            }
        }
        return [implode('/', $parts), null];
    }

    private static function splitShareFilePath(string $raw): array
    {
        $path = str_replace('\\', '/', trim((string)$raw));
        $path = trim($path, "/ \t\n\r\0\x0B");
        if ($path === '') {
            return ['', '', "Missing file name."];
        }
        $parts = array_filter(explode('/', $path), fn($p) => $p !== '');
        if (empty($parts)) {
            return ['', '', "Missing file name."];
        }
        $file = array_pop($parts);
        if ($file === '' || !preg_match(REGEX_FILE_NAME, $file)) {
            return ['', '', "Invalid file name."];
        }
        $folder = '';
        if (!empty($parts)) {
            [$normalized, $err] = self::normalizeShareSubPath(implode('/', $parts));
            if ($err) {
                return ['', '', $err];
            }
            $folder = $normalized;
        }
        return [$folder, $file, null];
    }

    private static function buildSharedFolderKey(string $shareRootKey, string $subPath): string
    {
        if ($shareRootKey === '' || strtolower($shareRootKey) === 'root') {
            return $subPath === '' ? 'root' : $subPath;
        }
        return $subPath === '' ? $shareRootKey : ($shareRootKey . '/' . $subPath);
    }

    private static function extractStatMtime(array $stat): ?int
    {
        $raw = $stat['mtime'] ?? $stat['modified'] ?? $stat['lastModified'] ?? null;
        if (is_int($raw)) {
            return $raw;
        }
        if (is_numeric($raw)) {
            return (int)$raw;
        }
        if (is_string($raw) && $raw !== '') {
            $ts = strtotime($raw);
            if ($ts !== false) {
                return $ts;
            }
        }
        return null;
    }

    private static function listSharedFolderEntries(StorageAdapterInterface $storage, string $realFolderPath): array
    {
        $folders = [];
        $files = [];
        $all = $storage->list($realFolderPath);
        foreach ($all as $it) {
            if ($it === '.' || $it === '..') {
                continue;
            }
            if ($it === '' || $it[0] === '.') {
                continue;
            }

            $fullPath = $realFolderPath . DIRECTORY_SEPARATOR . $it;
            $stat = $storage->stat($fullPath);
            if ($stat === null) {
                continue;
            }
            $type = $stat['type'] ?? '';
            if ($type === 'dir') {
                if (!preg_match(REGEX_FOLDER_NAME, $it)) {
                    continue;
                }
                $folders[] = [
                    'type' => 'folder',
                    'name' => $it,
                    'size' => null,
                    'modified' => self::extractStatMtime($stat),
                ];
                continue;
            }
            if ($type === 'file') {
                if (!preg_match(REGEX_FILE_NAME, $it)) {
                    continue;
                }
                $files[] = [
                    'type' => 'file',
                    'name' => $it,
                    'size' => array_key_exists('size', $stat) ? (int)$stat['size'] : null,
                    'modified' => self::extractStatMtime($stat),
                ];
            }
        }

        $sortByName = function (array $a, array $b): int {
            return strnatcasecmp($a['name'] ?? '', $b['name'] ?? '');
        };
        usort($folders, $sortByName);
        usort($files, $sortByName);

        return array_merge($folders, $files);
    }

    private static function resolveSharedFolderContext(string $token, ?string $providedPass, string $subPath = ''): array
    {
        $record = self::findShareFolderRecord($token);
        if (!$record) {
            return ["error" => "Share link not found."];
        }

        if (time() > ($record['expires'] ?? 0)) {
            return ["error" => "This share link has expired."];
        }

        if (!empty($record['password']) && empty($providedPass)) {
            return ["needs_password" => true];
        }
        if (!empty($record['password']) && !password_verify($providedPass, $record['password'])) {
            return ["error" => "Invalid password."];
        }

        // Encrypted folders/descendants: shared access is blocked (v1).
        $folder = trim((string)$record['folder'], "/\\ ");
        $folderKey = ($folder === '' ? 'root' : $folder);
        try {
            if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
                return ["error" => "This shared folder is not accessible (encrypted folders cannot be shared)."];
            }
        } catch (\Throwable $e) {
/* ignore */
        }

        $allowSubfolders = !empty($record['allowSubfolders']);
        [$normalizedSubPath, $pathErr] = self::normalizeShareSubPath($subPath);
        if ($pathErr) {
            return ["error" => $pathErr];
        }
        if ($normalizedSubPath !== '' && !$allowSubfolders) {
            return ["error" => "Subfolder access is not enabled for this share."];
        }

        $combinedKey = self::buildSharedFolderKey($folderKey, $normalizedSubPath);
        if ($combinedKey !== $folderKey) {
            try {
                if (FolderCrypto::isEncryptedOrAncestor($combinedKey)) {
                    return ["error" => "This shared folder is not accessible (encrypted folders cannot be shared)."];
                }
            } catch (\Throwable $e) {
/* ignore */
            }
        }
        $storage = self::storage();

        // Resolve shared folder
        [$realFolderPath, $relative, $err] = self::resolveFolderPath($combinedKey, false);
        if ($err) {
            return ["error" => "Shared folder not found."];
        }
        $dirStat = $storage->stat($realFolderPath);
        if ($dirStat === null || ($dirStat['type'] ?? '') !== 'dir') {
            return ["error" => "Shared folder not found."];
        }

        $allEntries = self::listSharedFolderEntries($storage, $realFolderPath);
        if (!$allowSubfolders) {
            $allEntries = array_values(array_filter($allEntries, function ($entry) {
                return (($entry['type'] ?? '') !== 'folder');
            }));
        }

        return [
            "record"        => $record,
            "folder"        => $relative,
            "shareRoot"     => $folderKey,
            "path"          => $normalizedSubPath,
            "realFolderPath" => $realFolderPath,
            "entries"       => $allEntries,
            "allowSubfolders" => $allowSubfolders ? 1 : 0,
        ];
    }

    public static function getSharedFolderEntries(string $token, ?string $providedPass, string $subPath = ''): array
    {
        return self::resolveSharedFolderContext($token, $providedPass, $subPath);
    }

    /**
     * Retrieves shared folder data based on a share token.
     */
    public static function getSharedFolderData(string $token, ?string $providedPass, int $page = 1, int $itemsPerPage = 10, string $subPath = ''): array
    {
        $ctx = self::resolveSharedFolderContext($token, $providedPass, $subPath);
        if (isset($ctx['error']) || isset($ctx['needs_password'])) {
            return $ctx;
        }
        $allEntries = $ctx['entries'] ?? [];

        $totalEntries = count($allEntries);
        $totalPages  = max(1, (int)ceil($totalEntries / max(1, $itemsPerPage)));
        $currentPage = min(max(1, $page), $totalPages);
        $startIndex  = ($currentPage - 1) * $itemsPerPage;
        $entriesOnPage = array_slice($allEntries, $startIndex, $itemsPerPage);

        $ctx['entries'] = $entriesOnPage;
        $ctx['currentPage'] = $currentPage;
        $ctx['totalPages'] = $totalPages;
        $ctx['totalEntries'] = $totalEntries;
        return $ctx;
    }

    /**
     * Creates a share link for a folder.
     */
    public static function createShareFolderLink(string $folder, int $expirationSeconds = 3600, string $password = "", int $allowUpload = 0, int $allowSubfolders = 0): array
    {
        try {
            if (FolderCrypto::isEncryptedOrAncestor($folder)) {
                return ["error" => "Sharing is disabled inside encrypted folders."];
            }
        } catch (\Throwable $e) {
/* ignore */
        }

        // Validate folder (and ensure it exists)
        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) {
            return ["error" => $err];
        }

        // Token
        try {
            $token = bin2hex(random_bytes(16));
        } catch (\Throwable $e) {
            return ["error" => "Could not generate token."];
        }

        $expires       = time() + max(1, $expirationSeconds);
        $hashedPassword = $password !== "" ? password_hash($password, PASSWORD_DEFAULT) : "";

        $shareFile = self::metaRoot() . "share_folder_links.json";
        $links = file_exists($shareFile)
            ? (json_decode(file_get_contents($shareFile), true) ?? [])
            : [];

        // cleanup expired
        $now = time();
        foreach ($links as $k => $v) {
            if (!empty($v['expires']) && $v['expires'] < $now) {
                unset($links[$k]);
            }
        }

        $links[$token] = [
            "folder"      => $relative,
            "expires"     => $expires,
            "password"    => $hashedPassword,
            "allowUpload" => $allowUpload ? 1 : 0,
            "allowSubfolders" => $allowSubfolders ? 1 : 0
        ];

        if (file_put_contents($shareFile, json_encode($links, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            return ["error" => "Could not save share link."];
        }

        // Build URL
        $https   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme  = $https ? 'https' : 'http';
        $host    = $_SERVER['HTTP_HOST'] ?? gethostbyname(gethostname());
        $publishedBase = defined('FR_PUBLISHED_URL_EFFECTIVE') ? trim((string)FR_PUBLISHED_URL_EFFECTIVE) : '';
        if ($publishedBase !== '') {
            $link = rtrim($publishedBase, '/') . "/api/folder/shareFolder.php?token=" . urlencode($token);
        } else {
            $baseUrl = $scheme . '://' . rtrim($host, '/');
            $link    = $baseUrl . fr_with_base_path("/api/folder/shareFolder.php?token=" . urlencode($token));
        }

        return ["token" => $token, "expires" => $expires, "link" => $link];
    }

    /**
     * Retrieves information for a shared file from a shared folder link.
     */
    public static function getSharedFileInfo(string $token, string $path, ?string $providedPass = null): array
    {
        $record = self::findShareFolderRecord($token);
        if (!$record) {
            return ["error" => "Share link not found."];
        }

        if (time() > ($record['expires'] ?? 0)) {
            return ["error" => "This share link has expired."];
        }

        if (!empty($record['password']) && ($providedPass === null || $providedPass === '')) {
            return ["needs_password" => true];
        }
        if (!empty($record['password']) && !password_verify((string)$providedPass, $record['password'])) {
            return ["error" => "Invalid password."];
        }

        // Encrypted folders/descendants: shared access is blocked (v1).
        $folderKey = trim((string)($record['folder'] ?? ''), "/\\ ");
        $folderKey = ($folderKey === '' ? 'root' : $folderKey);
        try {
            if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
                return ["error" => "This shared folder is not accessible (encrypted folders cannot be shared)."];
            }
        } catch (\Throwable $e) {
/* ignore */
        }

        $allowSubfolders = !empty($record['allowSubfolders']);
        [$subPath, $file, $pathErr] = self::splitShareFilePath($path);
        if ($pathErr) {
            return ["error" => $pathErr];
        }
        if ($subPath !== '' && !$allowSubfolders) {
            return ["error" => "Subfolder access is not enabled for this share."];
        }
        $combinedKey = self::buildSharedFolderKey($folderKey, $subPath);
        if ($combinedKey !== $folderKey) {
            try {
                if (FolderCrypto::isEncryptedOrAncestor($combinedKey)) {
                    return ["error" => "This shared folder is not accessible (encrypted folders cannot be shared)."];
                }
            } catch (\Throwable $e) {
/* ignore */
            }
        }

        $storage = self::storage();
        [$realFolderPath,, $err] = self::resolveFolderPath($combinedKey, false);
        if ($err) {
            return ["error" => "Shared folder not found."];
        }
        $dirStat = $storage->stat($realFolderPath);
        if ($dirStat === null || ($dirStat['type'] ?? '') !== 'dir') {
            return ["error" => "Shared folder not found."];
        }

        $full = $realFolderPath . DIRECTORY_SEPARATOR . $file;
        if ($storage->isLocal()) {
            $real = realpath($full);
            if ($real === false || strpos($real, $realFolderPath) !== 0 || !is_file($real)) {
                return ["error" => "File not found."];
            }

            // Never allow shared downloads of encrypted-at-rest files (v1).
            try {
                if (CryptoAtRest::isEncryptedFile($real)) {
                    return ["error" => "This file is not available for shared download (encrypted)."];
                }
            } catch (\Throwable $e) {
/* ignore */
            }

            $mime = function_exists('mime_content_type') ? mime_content_type($real) : 'application/octet-stream';
            return [
                "filePath"     => $real,
                "mimeType"     => $mime,
                "downloadName" => basename($real),
                "folder"       => $combinedKey,
                "file"         => $file,
                "isLocal"      => true,
            ];
        }

        $stat = $storage->stat($full);
        if ($stat === null || ($stat['type'] ?? '') !== 'file') {
            $probe = $storage->openReadStream($full, 1, 0);
            if ($probe === false) {
                return ["error" => "File not found."];
            }
            if (is_resource($probe)) {
                @fclose($probe);
            } elseif (is_object($probe) && method_exists($probe, 'close')) {
                $probe->close();
            }
            $stat = [
                'type' => 'file',
                'size' => 0,
                'sizeUnknown' => true,
            ];
        }

        $downloadName = $file;
        $downloadExt = $stat['downloadExt'] ?? '';
        if (is_string($downloadExt)) {
            $downloadExt = ltrim($downloadExt, '.');
            if ($downloadExt !== '') {
                $suffix = '.' . strtolower($downloadExt);
                if (!str_ends_with(strtolower($downloadName), $suffix)) {
                    $downloadName .= '.' . $downloadExt;
                }
            }
        }

        $mimeType = $stat['downloadMime'] ?? $stat['mime'] ?? 'application/octet-stream';
        if (!$mimeType || !is_string($mimeType)) {
            $mimeType = 'application/octet-stream';
        }

        $ext = strtolower(pathinfo($downloadName, PATHINFO_EXTENSION));
        if ($ext === 'svg') {
            $mimeType = 'image/svg+xml';
        }

        return [
            "filePath"     => $full,
            "mimeType"     => $mimeType,
            "downloadName" => $downloadName,
            "folder"       => $combinedKey,
            "file"         => $file,
            "isLocal"      => false,
            "size"         => (int)($stat['size'] ?? 0),
            "sizeUnknown"  => !empty($stat['sizeUnknown']),
        ];
    }

    /**
     * Handles uploading a file to a shared folder.
     */
    public static function uploadToSharedFolder(string $token, array $fileUpload, string $subPath = '', ?string $providedPass = null): array
    {
        // Max size & allowed extensions (mirror FileModel’s common types)
        $maxSize = 50 * 1024 * 1024; // 50 MB
        $allowedExtensions = [
            'jpg',
            'jpeg',
            'png',
            'gif',
            'pdf',
            'doc',
            'docx',
            'txt',
            'xls',
            'xlsx',
            'ppt',
            'pptx',
            'mp4',
            'webm',
            'mp3',
            'mkv',
            'csv',
            'json',
            'xml',
            'md'
        ];

        $record = self::findShareFolderRecord($token);
        if (!$record) {
            return ["error" => "Invalid share token."];
        }

        if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
            return ["error" => "Source is read-only."];
        }

        if (time() > ($record['expires'] ?? 0)) {
            return ["error" => "This share link has expired."];
        }
        if (!empty($record['password']) && ($providedPass === null || $providedPass === '')) {
            return ["error" => "Password required."];
        }
        if (!empty($record['password']) && !password_verify((string)$providedPass, $record['password'])) {
            return ["error" => "Invalid password."];
        }
        if (empty($record['allowUpload']) || (int)$record['allowUpload'] !== 1) {
            return ["error" => "File uploads are not allowed for this share."];
        }

        // Encrypted folders/descendants: shared access is blocked (v1).
        $folderKey = trim((string)($record['folder'] ?? ''), "/\\ ");
        $folderKey = ($folderKey === '' ? 'root' : $folderKey);
        try {
            if (FolderCrypto::isEncryptedOrAncestor($folderKey)) {
                @unlink($fileUpload['tmp_name'] ?? '');
                return ["error" => "Uploads are disabled for encrypted folders."];
            }
        } catch (\Throwable $e) {
/* ignore */
        }

        $allowSubfolders = !empty($record['allowSubfolders']);
        [$normalizedSubPath, $pathErr] = self::normalizeShareSubPath($subPath);
        if ($pathErr) {
            return ["error" => $pathErr];
        }
        if ($normalizedSubPath !== '' && !$allowSubfolders) {
            return ["error" => "Subfolder uploads are not enabled for this share."];
        }

        if (($fileUpload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return ["error" => "File upload error. Code: " . (int)$fileUpload['error']];
        }
        if (($fileUpload['size'] ?? 0) > $maxSize) {
            return ["error" => "File size exceeds allowed limit."];
        }

        $uploadedName = basename((string)($fileUpload['name'] ?? ''));
        $ext = strtolower(pathinfo($uploadedName, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExtensions, true)) {
            return ["error" => "File type not allowed."];
        }

        $storage = self::storage();

        // Resolve target folder
        $combinedKey = self::buildSharedFolderKey($folderKey, $normalizedSubPath);
        if ($combinedKey !== $folderKey) {
            try {
                if (FolderCrypto::isEncryptedOrAncestor($combinedKey)) {
                    @unlink($fileUpload['tmp_name'] ?? '');
                    return ["error" => "Uploads are disabled for encrypted folders."];
                }
            } catch (\Throwable $e) {
/* ignore */
            }
        }
        [$targetDir, $relative, $err] = self::resolveFolderPath($combinedKey, true);
        if ($err) {
            return ["error" => $err];
        }

        // New safe filename
        $safeBase   = preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $uploadedName);
        $newFilename = uniqid('', true) . "_" . $safeBase;
        $targetPath = $targetDir . DIRECTORY_SEPARATOR . $newFilename;

        if ($storage->isLocal()) {
            if (!move_uploaded_file($fileUpload['tmp_name'], $targetPath)) {
                return ["error" => "Failed to move the uploaded file."];
            }
        } else {
            $tmpPath = (string)($fileUpload['tmp_name'] ?? '');
            $stream = @fopen($tmpPath, 'rb');
            if ($stream === false) {
                return ["error" => "Failed to read the uploaded file."];
            }
            $length = isset($fileUpload['size']) ? (int)$fileUpload['size'] : null;
            $mimeType = isset($fileUpload['type']) && is_string($fileUpload['type']) ? $fileUpload['type'] : null;
            $written = $storage->writeStream($targetPath, $stream, $length, $mimeType);
            if (is_resource($stream)) {
                @fclose($stream);
            }
            if (!$written) {
                return ["error" => "Failed to save the uploaded file."];
            }
        }

        // Update metadata (uploaded + modified + uploader)
        $metadataFile = self::getMetadataFilePath($relative);
        $meta = file_exists($metadataFile) ? (json_decode(file_get_contents($metadataFile), true) ?: []) : [];

        $now = date(DATE_TIME_FORMAT);
        $meta[$newFilename] = [
            "uploaded" => $now,
            "modified" => $now,
            "uploader" => "Outside Share"
        ];
        file_put_contents($metadataFile, json_encode($meta, JSON_PRETTY_PRINT), LOCK_EX);

        return [
            "success" => "File uploaded successfully.",
            "newFilename" => $newFilename,
            "folder" => $combinedKey,
        ];
    }

    public static function getAllShareFolderLinks(): array
    {
        $shareFile = self::metaRoot() . "share_folder_links.json";
        if (!file_exists($shareFile)) {
            return [];
        }
        $links = json_decode(file_get_contents($shareFile), true);
        return is_array($links) ? $links : [];
    }

    public static function deleteShareFolderLink(string $token): bool
    {
        $shareFile = self::metaRoot() . "share_folder_links.json";
        if (!file_exists($shareFile)) {
            return false;
        }

        $links = json_decode(file_get_contents($shareFile), true);
        if (!is_array($links) || !isset($links[$token])) {
            return false;
        }

        unset($links[$token]);
        file_put_contents($shareFile, json_encode($links, JSON_PRETTY_PRINT), LOCK_EX);
        return true;
    }
}
