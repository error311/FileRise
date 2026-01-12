<?php
// src/lib/ACL.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class ACL
{
    private static $cache = null;
    private static $path  = null;
    private static $metaRoot = null;
    private static $memo  = [];

    private const BUCKETS = [
        'owners',
        'read',
        'write',
        'share',
        'read_own',
        'create',
        'upload',
        'edit',
        'rename',
        'copy',
        'move',
        'delete',
        'extract',
        'share_file',
        'share_folder'
    ];

    private static function path(): string
    {
        $metaRoot = class_exists('SourceContext') ? SourceContext::metaRoot() : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!self::$path || self::$metaRoot !== $metaRoot) {
            self::$metaRoot = $metaRoot;
            self::$path = self::pathForMetaRoot($metaRoot);
            self::$cache = null;
            self::resetMemo();
        }
        return self::$path;
    }

    private static function pathForMetaRoot(string $metaRoot): string
    {
        return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'folder_acl.json';
    }

    private static function resetMemo(): void
    {
        self::$memo = [];
    }

    private static function memoScope(): string
    {
        // Keep memo/cache aligned with the active source context.
        $path = self::path();
        return $path !== '' ? $path : (self::$metaRoot ?? '');
    }

    public static function normalizeFolder(string $f): string
    {
        $f = trim(str_replace('\\', '/', $f), "/ \t\r\n");
        if ($f === '' || $f === 'root') return 'root';
        return $f;
    }

    public static function purgeUser(string $user): bool
    {
        $user = (string)$user;

        if (class_exists('SourceContext') && SourceContext::sourcesEnabled() && class_exists('ProSources')) {
            $cfg = ProSources::getConfig();
            $sources = isset($cfg['sources']) && is_array($cfg['sources']) ? $cfg['sources'] : [];
            $changedAny = false;
            foreach ($sources as $src) {
                $id = (string)($src['id'] ?? '');
                $metaRoot = SourceContext::metaRootForId($id);
                $path = self::pathForMetaRoot($metaRoot);
                if (self::purgeUserAtPath($user, $path)) {
                    $changedAny = true;
                }
            }
            self::$cache = null;
            self::$path = null;
            self::resetMemo();
            return $changedAny;
        }

        return self::purgeUserAtPath($user, self::path());
    }

    private static function purgeUserAtPath(string $user, string $path): bool
    {
        $user = (string)$user;
        $acl = null;
        if (is_file($path)) {
            $acl = json_decode((string)@file_get_contents($path), true);
        }
        if (!is_array($acl)) {
            @mkdir(dirname($path), 0755, true);
            $acl = [
                'folders' => [
                    'root' => [
                        'owners'  => ['admin'],
                        'read'    => ['admin'],
                        'write'   => ['admin'],
                        'share'   => ['admin'],
                        'read_own' => [],
                        'inherit' => [],
                        'explicit' => [],
                        'create'       => [],
                        'upload'       => [],
                        'edit'         => [],
                        'rename'       => [],
                        'copy'         => [],
                        'move'         => [],
                        'delete'       => [],
                        'extract'      => [],
                        'share_file'   => [],
                        'share_folder' => [],
                    ],
                ],
                'groups' => [],
            ];
        }
        $changed = false;
        foreach ($acl['folders'] as $folder => &$rec) {
            foreach (self::BUCKETS as $k) {
                $before = is_array($rec[$k] ?? null) ? $rec[$k] : [];
                $rec[$k] = array_values(array_filter($before, fn($u) => strcasecmp((string)$u, $user) !== 0));
                if ($rec[$k] !== $before) $changed = true;
            }
            if (isset($rec['inherit']) && is_array($rec['inherit'])) {
                $beforeInherit = $rec['inherit'];
                foreach ($rec['inherit'] as $k => $v) {
                    if (strcasecmp((string)$k, $user) === 0) {
                        unset($rec['inherit'][$k]);
                    }
                }
                if ($beforeInherit !== $rec['inherit']) $changed = true;
            }
        }
        unset($rec);

        if ($changed) {
            @file_put_contents($path, json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
            @chmod($path, 0664);
        }
        return $changed;
    }

    public static function userHasAnyAccess(string $user, array $perms, string $folder = 'root'): bool
    {
        if (self::isAdmin($perms)) return true;
        if (self::canReadOwn($user, $perms, $folder)) return true;
        if (self::normalizeFolder($folder) !== 'root') return false;
        // Fall back to any explicit grants within this source when root isn't readable.
        return self::userHasAnyExplicitAccess($user);
    }
    public static function ownsFolderOrAncestor(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        if (self::hasGrant($user, $folder, 'owners')) return true;

        $folder = trim($folder, "/\\ ");
        if ($folder === '' || $folder === 'root') return false;

        $parts = explode('/', $folder);
        while (count($parts) > 1) {
            array_pop($parts);
            $parent = implode('/', $parts);
            if (self::hasGrant($user, $parent, 'owners')) return true;
        }
        return false;
    }

    public static function migrateSubtree(string $source, string $target): array
    {
        // PHP <8 polyfill
        if (!function_exists('str_starts_with')) {
            function str_starts_with(string $h, string $n): bool
            {
                return $n === '' || strncmp($h, $n, strlen($n)) === 0;
            }
        }

        $src = self::normalizeFolder($source);
        $dst = self::normalizeFolder($target);
        if ($src === 'root') return ['changed' => false, 'moved' => 0];

        $file = self::path(); // e.g. META_DIR/folder_acl.json
        $raw  = @file_get_contents($file);
        $map  = is_string($raw) ? json_decode($raw, true) : [];
        if (!is_array($map)) $map = [];

        $prefix = $src;
        $needle = $src . '/';

        $new = $map;
        $changed = false;
        $moved = 0;

        foreach ($map as $key => $entry) {
            $isMatch = ($key === $prefix) || str_starts_with($key . '/', $needle);
            if (!$isMatch) continue;

            unset($new[$key]);

            $suffix = substr($key, strlen($prefix)); // '' or '/sub/...'
            $newKey = ($dst === 'root') ? ltrim($suffix, '/\\') : rtrim($dst, '/\\') . $suffix;

            // keep only known buckets (defensive)
            if (is_array($entry)) {
                $clean = [];
                foreach (self::BUCKETS as $b) if (array_key_exists($b, $entry)) $clean[$b] = $entry[$b];
                if (array_key_exists('inherit', $entry)) $clean['inherit'] = $entry['inherit'];
                if (array_key_exists('explicit', $entry)) $clean['explicit'] = $entry['explicit'];
                $entry = $clean ?: $entry;
            }

            // overwrite any existing entry at destination path (safer than union)
            $new[$newKey] = $entry;
            $changed = true;
            $moved++;
        }

        if ($changed) {
            @file_put_contents($file, json_encode($new, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
            @chmod($file, 0664);
            self::$cache = $new; // keep in-process cache fresh if you use it
            self::resetMemo();
        }

        return ['changed' => $changed, 'moved' => $moved];
    }

    /** Re-key explicit ACL entries for an entire subtree: old/... → new/... */
    public static function renameTree(string $oldFolder, string $newFolder): void
    {
        $old = self::normalizeFolder($oldFolder);
        $new = self::normalizeFolder($newFolder);
        if ($old === '' || $old === 'root') return; // nothing to re-key for root

        $acl = self::$cache ?? self::loadFresh();
        if (!isset($acl['folders']) || !is_array($acl['folders'])) return;

        $rebased = [];
        foreach ($acl['folders'] as $k => $rec) {
            if ($k === $old || strpos($k, $old . '/') === 0) {
                $suffix = substr($k, strlen($old));
                $suffix = ltrim((string)$suffix, '/');
                $newKey = $new . ($suffix !== '' ? '/' . $suffix : '');
                $rebased[$newKey] = $rec;
            } else {
                $rebased[$k] = $rec;
            }
        }
        $acl['folders'] = $rebased;
        self::save($acl);
    }

    /** Remove explicit ACL entries for a folder subtree. */
    public static function deleteTree(string $folder): array
    {
        $prefix = self::normalizeFolder($folder);
        if ($prefix === '' || $prefix === 'root') {
            return ['changed' => false, 'removed' => 0];
        }

        $acl = self::$cache ?? self::loadFresh();
        if (!isset($acl['folders']) || !is_array($acl['folders'])) {
            return ['changed' => false, 'removed' => 0];
        }

        $needle = $prefix . '/';
        $removed = 0;
        foreach (array_keys($acl['folders']) as $key) {
            if ($key === $prefix || strpos($key, $needle) === 0) {
                unset($acl['folders'][$key]);
                $removed++;
            }
        }

        if ($removed > 0) {
            self::save($acl);
            return ['changed' => true, 'removed' => $removed];
        }

        return ['changed' => false, 'removed' => 0];
    }

    private static function loadFresh(): array
    {
        $path = self::path();
        if (!is_file($path)) {
            @mkdir(dirname($path), 0755, true);
            $init = [
                'folders' => [
                    'root' => [
                        'owners'  => ['admin'],
                        'read'    => ['admin'],
                        'write'   => ['admin'],
                        'share'   => ['admin'],
                        'read_own' => [],
                        'inherit' => [],
                        'explicit' => [],
                        'create'       => [],
                        'upload'       => [],
                        'edit'         => [],
                        'rename'       => [],
                        'copy'         => [],
                        'move'         => [],
                        'delete'       => [],
                        'extract'      => [],
                        'share_file'   => [],
                        'share_folder' => [],
                    ],
                ],
                'groups' => [],
            ];
            @file_put_contents($path, json_encode($init, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        }

        $json = (string) @file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) $data = [];
        $data['folders'] = isset($data['folders']) && is_array($data['folders']) ? $data['folders'] : [];
        $data['groups']  = isset($data['groups'])  && is_array($data['groups'])  ? $data['groups']  : [];

        if (!isset($data['folders']['root']) || !is_array($data['folders']['root'])) {
            $data['folders']['root'] = [
                'owners'   => ['admin'],
                'read'     => ['admin'],
                'write'    => ['admin'],
                'share'    => ['admin'],
                'read_own' => [],
                'inherit'  => [],
                'explicit' => [],
                'create'       => [],
                'upload'       => [],
                'edit'         => [],
                'rename'       => [],
                'copy'         => [],
                'move'         => [],
                'delete'       => [],
                'extract'      => [],
                'share_file'   => [],
                'share_folder' => [],
            ];
        }

        $healed = false;
        foreach ($data['folders'] as $folder => &$rec) {
            if (!is_array($rec)) {
                $rec = [];
                $healed = true;
            }
            if (!isset($rec['inherit']) || !is_array($rec['inherit'])) {
                $rec['inherit'] = [];
                $healed = true;
            }
            if (!isset($rec['explicit']) || !is_array($rec['explicit'])) {
                $rec['explicit'] = [];
                $healed = true;
            }
            // Normalize inherit map to associative: username => true
            $inheritNorm = [];
            foreach ($rec['inherit'] as $k => $v) {
                if (is_int($k)) {
                    $key = (string)$v;
                } else {
                    $key = (string)$k;
                }
                if ($key === '') continue;
                $inheritNorm[$key] = (bool)$v;
            }
            if ($rec['inherit'] !== $inheritNorm) {
                $rec['inherit'] = $inheritNorm;
                $healed = true;
            }
            // Normalize explicit map to associative: username => true
            $explicitNorm = [];
            foreach ($rec['explicit'] as $k => $v) {
                $key = is_int($k) ? (string)$v : (string)$k;
                if ($key === '') continue;
                $explicitNorm[$key] = (bool)$v;
            }
            if ($rec['explicit'] !== $explicitNorm) {
                $rec['explicit'] = $explicitNorm;
                $healed = true;
            }
            foreach (self::BUCKETS as $k) {
                $v = $rec[$k] ?? [];
                if (!is_array($v)) {
                    $v = [];
                    $healed = true;
                }
                $v = array_values(array_unique(array_map('strval', $v)));
                if (($rec[$k] ?? null) !== $v) {
                    $rec[$k] = $v;
                    $healed = true;
                }
            }
        }
        unset($rec);

        self::$cache = $data;
        self::resetMemo();
        if ($healed) @file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        return $data;
    }


    /**
     * Load Pro user groups from FR_PRO_BUNDLE_DIR/users/pro/groups.json.
     * Returns a map: groupName => ['name','label','members'=>[],'grants'=>[]]
     * When Pro is inactive or no file exists, returns an empty array.
     */
    private static function loadGroupData(): array
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) return [];
        if (!defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) return [];

        static $loaded = false;
        static $cache  = [];
        static $mtime  = 0;

        $base = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\");
        if ($base === '') return [];

        $file = $base . DIRECTORY_SEPARATOR . 'groups.json';
        $mt   = @filemtime($file) ?: 0;

        if ($loaded && $mtime === $mt) {
            return $cache;
        }

        $loaded = true;
        $mtime  = $mt;
        if (!$mt || !is_file($file)) {
            $cache = [];
            return $cache;
        }

        $raw = @file_get_contents($file);
        if ($raw === false || $raw === '') {
            $cache = [];
            return $cache;
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $cache = [];
            return $cache;
        }

        $groups = isset($data['groups']) && is_array($data['groups']) ? $data['groups'] : $data;
        $norm   = [];

        foreach ($groups as $key => $g) {
            if (!is_array($g)) continue;
            $name = isset($g['name']) ? (string)$g['name'] : (string)$key;
            $name = trim($name);
            if ($name === '') continue;

            $g['name']  = $name;
            $g['label'] = isset($g['label']) ? (string)$g['label'] : $name;

            if (!isset($g['members']) || !is_array($g['members'])) {
                $g['members'] = [];
            } else {
                $g['members'] = array_values(array_unique(array_map('strval', $g['members'])));
            }

            if (!isset($g['grants']) || !is_array($g['grants'])) {
                $g['grants'] = [];
            }

            $norm[$name] = $g;
        }

        $cache = $norm;
        return $cache;
    }

    /**
     * Map a group grants record for a single folder to a capability bucket.
     * Supports both internal bucket keys and the UI-style keys: view, viewOwn,
     * manage, shareFile, shareFolder.
     */
    private static function groupGrantsCap(array $grants, string $capKey): bool
    {
        // Direct match (owners, read, write, share, read_own, create, upload, edit, rename, copy, move, delete, extract, share_file, share_folder)
        if (array_key_exists($capKey, $grants) && $grants[$capKey] === true) {
            return true;
        }

        switch ($capKey) {
            case 'read':
                return !empty($grants['view']);
            case 'read_own':
                // Full view always implies own
                if (!empty($grants['view'])) return true;
                return !empty($grants['viewOwn']);
            case 'share_file':
                if (!empty($grants['share_file'])) return true;
                return !empty($grants['shareFile']);
            case 'share_folder':
                if (!empty($grants['share_folder'])) return true;
                return !empty($grants['shareFolder']);
            case 'write':
            case 'create':
            case 'upload':
            case 'edit':
            case 'rename':
            case 'copy':
            case 'move':
            case 'delete':
            case 'extract':
                if (!empty($grants[$capKey])) return true;
                // Group "manage" implies all write-ish caps
                return !empty($grants['manage']);
            case 'share':
                if (!empty($grants['share'])) return true;
                // Manage can optionally imply share; this keeps UI simple
                return !empty($grants['manage']);
        }

        return false;
    }

    private static function groupGrantsExplicit(array $grants): bool
    {
        if (array_key_exists('explicit', $grants) && $grants['explicit'] !== null) {
            return (bool)$grants['explicit'];
        }
        if (array_key_exists('__explicit', $grants) && $grants['__explicit'] !== null) {
            return (bool)$grants['__explicit'];
        }

        $uiCaps = [
            'view', 'viewOwn', 'manage', 'create', 'upload', 'edit', 'rename',
            'copy', 'move', 'delete', 'extract', 'shareFile', 'shareFolder', 'share'
        ];

        foreach ($uiCaps as $k) {
            if (!empty($grants[$k])) return true;
        }

        foreach (self::BUCKETS as $k) {
            if (!empty($grants[$k])) return true;
        }

        return false;
    }

    /**
     * Check whether any Pro group the user belongs to grants this cap for folder.
     * Groups are additive only; they never remove access.
     */
    private static function groupHasGrant(string $user, string $folder, string $capKey): bool
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) return false;
        $user = (string)$user;
        if ($user === '') return false;

        $folder = self::normalizeFolder($folder);
        if ($folder === '') $folder = 'root';

        $groups = self::loadGroupData();
        if (!$groups) return false;

        foreach ($groups as $g) {
            if (!is_array($g)) continue;

            $members = $g['members'] ?? [];
            $isMember = false;
            if (is_array($members)) {
                foreach ($members as $m) {
                    if (strcasecmp((string)$m, $user) === 0) {
                        $isMember = true;
                        break;
                    }
                }
            }
            if (!$isMember) continue;

            $grantsMap = isset($g['grants']) && is_array($g['grants']) ? $g['grants'] : [];

            $folderGrants = $grantsMap[$folder] ?? null;
            if (is_array($folderGrants) && self::groupGrantsCap($folderGrants, $capKey)) {
                return true;
            }

            if (is_array($folderGrants) && self::groupGrantsExplicit($folderGrants)) {
                continue; // explicit entry blocks ancestor inheritance for this folder
            }

            $ancestors = self::ancestors($folder);
            foreach ($ancestors as $ancestor) {
                $ancestorGrants = $grantsMap[$ancestor] ?? null;
                if (!is_array($ancestorGrants)) continue;
                $inheritFlag = (!empty($ancestorGrants['inherit'])) || (!empty($ancestorGrants['__inherit']));
                if (!$inheritFlag) continue;
                if (self::groupGrantsCap($ancestorGrants, $capKey)) {
                    return true;
                }
            }
        }

        return false;
    }
    private static function save(array $acl): bool
    {
        $ok = @file_put_contents(self::path(), json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX) !== false;
        if ($ok) self::$cache = $acl;
        if ($ok) self::resetMemo();
        return $ok;
    }

    private static function listFor(string $folder, string $key): array
    {
        $acl = self::$cache ?? self::loadFresh();
        $f   = $acl['folders'][$folder] ?? null;
        return is_array($f[$key] ?? null) ? $f[$key] : [];
    }

    private static function inheritMap(string $folder): array
    {
        $acl = self::$cache ?? self::loadFresh();
        $f   = $acl['folders'][$folder] ?? null;
        if (!is_array($f)) return [];
        $raw = $f['inherit'] ?? [];
        if (!is_array($raw)) return [];
        $out = [];
        foreach ($raw as $k => $v) {
            $key = is_int($k) ? (string)$v : (string)$k;
            if ($key === '') continue;
            $out[$key] = (bool)$v;
        }
        return $out;
    }

    private static function inheritFlag(string $folder, string $user): bool
    {
        $map = self::inheritMap($folder);
        foreach ($map as $k => $v) {
            if (strcasecmp((string)$k, $user) === 0) return $v === true;
        }
        return false;
    }

    private static function ancestors(string $folder): array
    {
        $folder = self::normalizeFolder($folder);
        if ($folder === 'root' || $folder === '') return [];
        $parts = explode('/', $folder);
        $out = [];
        while (count($parts) > 0) {
            array_pop($parts);
            if (empty($parts)) {
                $out[] = 'root';
                break;
            }
            $out[] = implode('/', $parts);
        }
        return $out;
    }

    private static function hasExplicitUserGrant(string $user, string $folder, string $capKey): bool
    {
        $arr = self::listFor($folder, $capKey);
        foreach ($arr as $u) {
            if (strcasecmp((string)$u, $user) === 0) {
                return true;
            }
        }
        return false;
    }

    private static function hasAnyExplicitEntry(string $user, string $folder): bool
    {
        $acl = self::$cache ?? self::loadFresh();
        $rec = $acl['folders'][$folder] ?? [];
        $explicit = $rec['explicit'] ?? [];
        if (is_array($explicit)) {
            foreach ($explicit as $k => $v) {
                $key = is_int($k) ? (string)$v : (string)$k;
                if ($key === '') continue;
                if (strcasecmp($key, $user) === 0 && $v !== null) return true;
            }
        }
        foreach (self::BUCKETS as $k) {
            $arr = $rec[$k] ?? [];
            if (!is_array($arr) || !count($arr)) continue;
            foreach ($arr as $u) {
                if (strcasecmp((string)$u, $user) === 0) return true;
            }
        }
        return false;
    }

    private static function userHasAnyExplicitAccess(string $user): bool
    {
        $user = (string)$user;
        if ($user === '') return false;

        $memoKey = self::memoScope() . '|__any__|' . strtolower($user);
        if (array_key_exists($memoKey, self::$memo)) {
            return self::$memo[$memoKey];
        }

        $acl = self::$cache ?? self::loadFresh();
        $folders = $acl['folders'] ?? [];
        if (is_array($folders)) {
            foreach ($folders as $folder => $rec) {
                if (!is_array($rec)) continue;
                if (self::hasAnyExplicitEntry($user, (string)$folder)) {
                    return self::$memo[$memoKey] = true;
                }
            }
        }

        if (self::userHasAnyGroupGrant($user)) {
            return self::$memo[$memoKey] = true;
        }

        return self::$memo[$memoKey] = false;
    }

    private static function userHasAnyGroupGrant(string $user): bool
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) return false;
        $user = (string)$user;
        if ($user === '') return false;

        $groups = self::loadGroupData();
        if (!$groups) return false;

        foreach ($groups as $g) {
            if (!is_array($g)) continue;
            $members = $g['members'] ?? [];
            $isMember = false;
            if (is_array($members)) {
                foreach ($members as $m) {
                    if (strcasecmp((string)$m, $user) === 0) {
                        $isMember = true;
                        break;
                    }
                }
            }
            if (!$isMember) continue;

            $grantsMap = isset($g['grants']) && is_array($g['grants']) ? $g['grants'] : [];
            foreach ($grantsMap as $folder => $grants) {
                if (!is_array($grants)) continue;
                if (self::groupGrantsExplicit($grants)) {
                    return true;
                }
            }
        }

        return false;
    }

    public static function ensureFolderRecord(string $folder, string $owner = 'admin'): void
    {
        $folder = self::normalizeFolder($folder);
        $acl = self::$cache ?? self::loadFresh();
        if (!isset($acl['folders'][$folder])) {
            $acl['folders'][$folder] = [
                'owners'   => [$owner],
                'read'     => [$owner],
                'write'    => [$owner],
                'share'    => [$owner],
                'read_own' => [],
                'inherit'  => [],
                'explicit' => [],
                'create'       => [],
                'upload'       => [],
                'edit'         => [],
                'rename'       => [],
                'copy'         => [],
                'move'         => [],
                'delete'       => [],
                'extract'      => [],
                'share_file'   => [],
                'share_folder' => [],
            ];
            self::save($acl);
        }
    }

    public static function isAdmin(array $perms = []): bool
    {
        if (!empty($_SESSION['isAdmin'])) return true;
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
        if (isset($perms['role']) && (string)$perms['role'] === '1') return true;
        if (!empty($_SESSION['role']) && (string)$_SESSION['role'] === '1') return true;
        if (
            defined('DEFAULT_ADMIN_USER') && !empty($_SESSION['username'])
            && strcasecmp((string)$_SESSION['username'], (string)DEFAULT_ADMIN_USER) === 0
        ) {
            return true;
        }
        return false;
    }

    public static function hasGrant(string $user, string $folder, string $cap): bool
    {
        $folder = self::normalizeFolder($folder);
        $capKey = ($cap === 'owner') ? 'owners' : $cap;

        $memoKey = self::memoScope() . '|' . strtolower((string)$user) . '|' . $folder . '|' . $capKey;
        if (array_key_exists($memoKey, self::$memo)) {
            return self::$memo[$memoKey];
        }

        // 1) Core per-folder ACL buckets (folder_acl.json)
        if (self::hasExplicitUserGrant($user, $folder, $capKey)) {
            return self::$memo[$memoKey] = true;
        }

        // 2) Pro user groups (if enabled) – additive only
        if (self::groupHasGrant($user, $folder, $capKey)) {
            return self::$memo[$memoKey] = true;
        }

        // 3) Inherit from nearest ancestor where inherit=true for this principal
        $hasExplicitAny = self::hasAnyExplicitEntry($user, $folder);
        if (!$hasExplicitAny) {
        $ancestors = self::ancestors($folder);
        foreach ($ancestors as $ancestor) {
            if (!self::inheritFlag($ancestor, $user)) continue;
            if (self::hasExplicitUserGrant($user, $ancestor, $capKey) || self::groupHasGrant($user, $ancestor, $capKey)) {
                return self::$memo[$memoKey] = true;
            }
        }
        }

        return self::$memo[$memoKey] = false;
    }

    public static function isOwner(string $user, array $perms, string $folder): bool
    {
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners');
    }

    public static function canManage(string $user, array $perms, string $folder): bool
    {
        return self::isOwner($user, $perms, $folder);
    }

    public static function canRead(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'read');
    }

    public static function canReadOwn(string $user, array $perms, string $folder): bool
    {
        if (self::canRead($user, $perms, $folder)) return true;
        return self::hasGrant($user, $folder, 'read_own');
    }

    public static function canWrite(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canShare(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'share');
    }

    // Legacy-only explicit (to avoid breaking existing callers)
    public static function explicit(string $folder): array
    {
        $folder = self::normalizeFolder($folder);
        $acl = self::$cache ?? self::loadFresh();
        $rec = $acl['folders'][$folder] ?? [];
        $norm = function ($v): array {
            if (!is_array($v)) return [];
            $v = array_map('strval', $v);
            return array_values(array_unique($v));
        };
        return [
            'owners'   => $norm($rec['owners']   ?? []),
            'read'     => $norm($rec['read']     ?? []),
            'write'    => $norm($rec['write']    ?? []),
            'share'    => $norm($rec['share']    ?? []),
            'read_own' => $norm($rec['read_own'] ?? []),
        ];
    }

    // New: full explicit including granular
    public static function explicitAll(string $folder): array
    {
        $folder = self::normalizeFolder($folder);
        $acl = self::$cache ?? self::loadFresh();
        $rec = $acl['folders'][$folder] ?? [];
        $norm = function ($v): array {
            if (!is_array($v)) return [];
            $v = array_map('strval', $v);
            return array_values(array_unique($v));
        };
        $inheritMap = [];
        if (isset($rec['inherit']) && is_array($rec['inherit'])) {
            foreach ($rec['inherit'] as $k => $v) {
                $key = is_int($k) ? (string)$v : (string)$k;
                if ($key === '') continue;
                $inheritMap[$key] = (bool)$v;
            }
        }
        $explicitMap = [];
        if (isset($rec['explicit']) && is_array($rec['explicit'])) {
            foreach ($rec['explicit'] as $k => $v) {
                $key = is_int($k) ? (string)$v : (string)$k;
                if ($key === '') continue;
                $explicitMap[$key] = (bool)$v;
            }
        }
        return [
            'owners'       => $norm($rec['owners']       ?? []),
            'read'         => $norm($rec['read']         ?? []),
            'write'        => $norm($rec['write']        ?? []),
            'share'        => $norm($rec['share']        ?? []),
            'read_own'     => $norm($rec['read_own']     ?? []),
            'create'       => $norm($rec['create']       ?? []),
            'upload'       => $norm($rec['upload']       ?? []),
            'edit'         => $norm($rec['edit']         ?? []),
            'rename'       => $norm($rec['rename']       ?? []),
            'copy'         => $norm($rec['copy']         ?? []),
            'move'         => $norm($rec['move']         ?? []),
            'delete'       => $norm($rec['delete']       ?? []),
            'extract'      => $norm($rec['extract']      ?? []),
            'share_file'   => $norm($rec['share_file']   ?? []),
            'share_folder' => $norm($rec['share_folder'] ?? []),
            'inherit'      => $inheritMap,
            'explicit'     => $explicitMap,
        ];
    }

    public static function upsert(string $folder, array $owners, array $read, array $write, array $share): bool
    {
        $folder = self::normalizeFolder($folder);
        $acl = self::$cache ?? self::loadFresh();
        $existing = $acl['folders'][$folder] ?? ['read_own' => []];
        $fmt = function (array $arr): array {
            return array_values(array_unique(array_map('strval', $arr)));
        };
        $acl['folders'][$folder] = [
            'owners'   => $fmt($owners),
            'read'     => $fmt($read),
            'write'    => $fmt($write),
            'share'    => $fmt($share),
            'read_own' => isset($existing['read_own']) && is_array($existing['read_own'])
                ? array_values(array_unique(array_map('strval', $existing['read_own'])))
                : [],
            'inherit'      => isset($existing['inherit'])      && is_array($existing['inherit'])      ? $existing['inherit']      : [],
            'explicit'     => isset($existing['explicit'])     && is_array($existing['explicit'])     ? $existing['explicit']     : [],
            'create'       => isset($existing['create'])       && is_array($existing['create'])       ? array_values(array_unique(array_map('strval', $existing['create'])))       : [],
            'upload'       => isset($existing['upload'])       && is_array($existing['upload'])       ? array_values(array_unique(array_map('strval', $existing['upload'])))       : [],
            'edit'         => isset($existing['edit'])         && is_array($existing['edit'])         ? array_values(array_unique(array_map('strval', $existing['edit'])))         : [],
            'rename'       => isset($existing['rename'])       && is_array($existing['rename'])       ? array_values(array_unique(array_map('strval', $existing['rename'])))       : [],
            'copy'         => isset($existing['copy'])         && is_array($existing['copy'])         ? array_values(array_unique(array_map('strval', $existing['copy'])))         : [],
            'move'         => isset($existing['move'])         && is_array($existing['move'])         ? array_values(array_unique(array_map('strval', $existing['move'])))         : [],
            'delete'       => isset($existing['delete'])       && is_array($existing['delete'])       ? array_values(array_unique(array_map('strval', $existing['delete'])))       : [],
            'extract'      => isset($existing['extract'])      && is_array($existing['extract'])      ? array_values(array_unique(array_map('strval', $existing['extract'])))      : [],
            'share_file'   => isset($existing['share_file'])   && is_array($existing['share_file'])   ? array_values(array_unique(array_map('strval', $existing['share_file'])))   : [],
            'share_folder' => isset($existing['share_folder']) && is_array($existing['share_folder']) ? array_values(array_unique(array_map('strval', $existing['share_folder']))) : [],
        ];
        return self::save($acl);
    }

    public static function applyUserGrantsAtomic(string $user, array $grants): array
    {
        $user = (string)$user;
        $path = self::path();

        $fh = @fopen($path, 'c+');
        if (!$fh) throw new RuntimeException('Cannot open ACL storage');
        if (!flock($fh, LOCK_EX)) {
            fclose($fh);
            throw new RuntimeException('Cannot lock ACL storage');
        }

        try {
            $raw = stream_get_contents($fh);
            if ($raw === false) $raw = '';
            $acl = json_decode($raw, true);
            if (!is_array($acl)) $acl = ['folders' => [], 'groups' => []];
            if (!isset($acl['folders']) || !is_array($acl['folders'])) $acl['folders'] = [];
            if (!isset($acl['groups'])  || !is_array($acl['groups']))  $acl['groups']  = [];

            $changed = [];

            foreach ($grants as $folder => $caps) {
                $ff = self::normalizeFolder((string)$folder);
                if (!isset($acl['folders'][$ff]) || !is_array($acl['folders'][$ff])) $acl['folders'][$ff] = [];
                $rec = &$acl['folders'][$ff];

                foreach (self::BUCKETS as $k) {
                    if (!isset($rec[$k]) || !is_array($rec[$k])) $rec[$k] = [];
                }
                if (!isset($rec['inherit']) || !is_array($rec['inherit'])) $rec['inherit'] = [];
                if (!isset($rec['explicit']) || !is_array($rec['explicit'])) $rec['explicit'] = [];
                foreach (self::BUCKETS as $k) {
                    $arr = is_array($rec[$k]) ? $rec[$k] : [];
                    $rec[$k] = array_values(array_filter(
                        array_map('strval', $arr),
                        fn($u) => strcasecmp((string)$u, $user) !== 0
                    ));
                }
                // Remove explicit marker for this user before re-applying
                $explicitRaw = is_array($rec['explicit']) ? $rec['explicit'] : [];
                $explicitNorm = [];
                foreach ($explicitRaw as $k => $v) {
                    $key = is_int($k) ? (string)$v : (string)$k;
                    if ($key === '' || strcasecmp($key, $user) === 0) continue;
                    $explicitNorm[$key] = (bool)$v;
                }

                $v   = !empty($caps['view']);
                $vo  = !empty($caps['viewOwn']);
                $u   = !empty($caps['upload']);
                $m   = !empty($caps['manage']);
                $s   = !empty($caps['share']);
                $w   = !empty($caps['write']);

                $c   = !empty($caps['create']);
                $ed  = !empty($caps['edit']);
                $rn  = !empty($caps['rename']);
                $cp  = !empty($caps['copy']);
                $mv  = !empty($caps['move']);
                $dl  = !empty($caps['delete']);
                $ex  = !empty($caps['extract']);
                $sf  = !empty($caps['shareFile'])   || !empty($caps['share_file']);
                $sfo = !empty($caps['shareFolder']) || !empty($caps['share_folder']);
                $inheritRequested = !empty($caps['inherit']);
                $explicitRequested = !empty($caps['explicit']);

                if ($m) {
                    $v = true;
                    $w = true;
                    $u = $c = $ed = $rn = $cp = $dl = $ex = $sf = $sfo = true;
                }
                if ($u && !$v && !$vo) $vo = true;
                //if ($s && !$v) $v = true;
                if ($w) {
                    $c = $u = $ed = $rn = $cp = $dl = $ex = true;
                }

                if ($m)  $rec['owners'][]       = $user;
                if ($v)  $rec['read'][]         = $user;
                if ($vo) $rec['read_own'][]     = $user;
                if ($w)  $rec['write'][]        = $user;
                if ($s)  $rec['share'][]        = $user;

                if ($u)  $rec['upload'][]       = $user;
                if ($c)  $rec['create'][]       = $user;
                if ($ed) $rec['edit'][]         = $user;
                if ($rn) $rec['rename'][]       = $user;
                if ($cp) $rec['copy'][]         = $user;
                if ($mv) $rec['move'][]         = $user;
                if ($dl) $rec['delete'][]       = $user;
                if ($ex) $rec['extract'][]      = $user;
                if ($sf) $rec['share_file'][]   = $user;
                if ($sfo) $rec['share_folder'][] = $user;

                $inheritRaw = is_array($rec['inherit']) ? $rec['inherit'] : [];
                $inheritNorm = [];
                foreach ($inheritRaw as $k => $v) {
                    $key = is_int($k) ? (string)$v : (string)$k;
                    if ($key === '') continue;
                    $inheritNorm[$key] = (bool)$v;
                }
                if ($inheritRequested) {
                    $inheritNorm[$user] = true;
                } else {
                    foreach ($inheritNorm as $k => $_) {
                        if (strcasecmp((string)$k, $user) === 0) unset($inheritNorm[$k]);
                    }
                }
                $rec['inherit'] = $inheritNorm;

                // Mark this folder as explicitly set for the user even if no caps are true
                $anyCapsTrue = $v || $vo || $u || $m || $s || $w || $c || $ed || $rn || $cp || $mv || $dl || $ex || $sf || $sfo;
                if ($explicitRequested || $inheritRequested || $anyCapsTrue) {
                    $explicitNorm[$user] = true;
                }
                $rec['explicit'] = $explicitNorm;

                foreach (self::BUCKETS as $k) {
                    $rec[$k] = array_values(array_unique(array_map('strval', $rec[$k])));
                }

                $changed[] = $ff;
                unset($rec);
            }

            ftruncate($fh, 0);
            rewind($fh);
            $ok = fwrite($fh, json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) !== false;
            if (!$ok) throw new RuntimeException('Write failed');

            self::$cache = $acl;
            self::resetMemo();
            return ['ok' => true, 'updated' => $changed];
        } finally {
            fflush($fh);
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }

    // --- Granular write family -----------------------------------------------

    public static function canCreate(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'create')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canCreateFolder(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        // Only owners/managers can create subfolders under $folder
        return self::hasGrant($user, $folder, 'owners');
    }

    public static function canUpload(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'upload')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canEdit(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'edit')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canRename(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'rename')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canCopy(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'copy')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canMove(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::ownsFolderOrAncestor($user, $perms, $folder);
    }

    public static function canMoveFolder(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::ownsFolderOrAncestor($user, $perms, $folder);
    }

    public static function canDelete(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'delete')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canExtract(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'extract')
            || self::hasGrant($user, $folder, 'write');
    }

    /** Sharing: files use share, folders require share + full-view. */
    public static function canShareFile(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners') || self::hasGrant($user, $folder, 'share');
    }
    public static function canShareFolder(string $user, array $perms, string $folder): bool
    {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        $can = self::hasGrant($user, $folder, 'owners') || self::hasGrant($user, $folder, 'share');
        if (!$can) return false;
        // require full view too
        return self::hasGrant($user, $folder, 'owners') || self::hasGrant($user, $folder, 'read');
    }
}
