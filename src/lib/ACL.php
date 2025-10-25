<?php
// src/lib/ACL.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';

class ACL
{
    private static $cache = null;
    private static $path  = null;

    private const BUCKETS = [
        'owners','read','write','share','read_own',
        'create','upload','edit','rename','copy','move','delete','extract',
        'share_file','share_folder'
    ];

    private static function path(): string {
        if (!self::$path) self::$path = rtrim(META_DIR, '/\\') . DIRECTORY_SEPARATOR . 'folder_acl.json';
        return self::$path;
    }

    public static function normalizeFolder(string $f): string {
        $f = trim(str_replace('\\', '/', $f), "/ \t\r\n");
        if ($f === '' || $f === 'root') return 'root';
        return $f;
    }

    public static function purgeUser(string $user): bool {
        $user = (string)$user;
        $acl  = self::$cache ?? self::loadFresh();
        $changed = false;
        foreach ($acl['folders'] as $folder => &$rec) {
            foreach (self::BUCKETS as $k) {
                $before = is_array($rec[$k] ?? null) ? $rec[$k] : [];
                $rec[$k] = array_values(array_filter($before, fn($u) => strcasecmp((string)$u, $user) !== 0));
                if ($rec[$k] !== $before) $changed = true;
            }
        }
        unset($rec);
        return $changed ? self::save($acl) : true;
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

    private static function loadFresh(): array {
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
                        'read_own'=> [],
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
            ];
        }

        $healed = false;
        foreach ($data['folders'] as $folder => &$rec) {
            if (!is_array($rec)) { $rec = []; $healed = true; }
            foreach (self::BUCKETS as $k) {
                $v = $rec[$k] ?? [];
                if (!is_array($v)) { $v = []; $healed = true; }
                $v = array_values(array_unique(array_map('strval', $v)));
                if (($rec[$k] ?? null) !== $v) { $rec[$k] = $v; $healed = true; }
            }
        }
        unset($rec);

        self::$cache = $data;
        if ($healed) @file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        return $data;
    }

    private static function save(array $acl): bool {
        $ok = @file_put_contents(self::path(), json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX) !== false;
        if ($ok) self::$cache = $acl;
        return $ok;
    }

    private static function listFor(string $folder, string $key): array {
        $acl = self::$cache ?? self::loadFresh();
        $f   = $acl['folders'][$folder] ?? null;
        return is_array($f[$key] ?? null) ? $f[$key] : [];
    }

    public static function ensureFolderRecord(string $folder, string $owner = 'admin'): void {
        $folder = self::normalizeFolder($folder);
        $acl = self::$cache ?? self::loadFresh();
        if (!isset($acl['folders'][$folder])) {
            $acl['folders'][$folder] = [
                'owners'   => [$owner],
                'read'     => [$owner],
                'write'    => [$owner],
                'share'    => [$owner],
                'read_own' => [],
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

    public static function isAdmin(array $perms = []): bool {
        if (!empty($_SESSION['isAdmin'])) return true;
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
        if (isset($perms['role']) && (string)$perms['role'] === '1') return true;
        if (!empty($_SESSION['role']) && (string)$_SESSION['role'] === '1') return true;
        if (defined('DEFAULT_ADMIN_USER') && !empty($_SESSION['username'])
            && strcasecmp((string)$_SESSION['username'], (string)DEFAULT_ADMIN_USER) === 0) {
            return true;
        }
        return false;
    }

    public static function hasGrant(string $user, string $folder, string $cap): bool {
        $folder = self::normalizeFolder($folder);
        $capKey = ($cap === 'owner') ? 'owners' : $cap;
        $arr    = self::listFor($folder, $capKey);
        foreach ($arr as $u) if (strcasecmp((string)$u, $user) === 0) return true;
        return false;
    }

    public static function isOwner(string $user, array $perms, string $folder): bool {
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners');
    }

    public static function canManage(string $user, array $perms, string $folder): bool {
        return self::isOwner($user, $perms, $folder);
    }

    public static function canRead(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'read');
    }

    public static function canReadOwn(string $user, array $perms, string $folder): bool {
        if (self::canRead($user, $perms, $folder)) return true;
        return self::hasGrant($user, $folder, 'read_own');
    }

    public static function canWrite(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'write');
    }

    public static function canShare(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'share');
    }

    // Legacy-only explicit (to avoid breaking existing callers)
    public static function explicit(string $folder): array {
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
    public static function explicitAll(string $folder): array {
        $folder = self::normalizeFolder($folder);
        $acl = self::$cache ?? self::loadFresh();
        $rec = $acl['folders'][$folder] ?? [];
        $norm = function ($v): array {
            if (!is_array($v)) return [];
            $v = array_map('strval', $v);
            return array_values(array_unique($v));
        };
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
        ];
    }

    public static function upsert(string $folder, array $owners, array $read, array $write, array $share): bool {
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

    public static function applyUserGrantsAtomic(string $user, array $grants): array {
        $user = (string)$user;
        $path = self::path();

        $fh = @fopen($path, 'c+');
        if (!$fh) throw new RuntimeException('Cannot open ACL storage');
        if (!flock($fh, LOCK_EX)) { fclose($fh); throw new RuntimeException('Cannot lock ACL storage'); }

        try {
            $raw = stream_get_contents($fh);
            if ($raw === false) $raw = '';
            $acl = json_decode($raw, true);
            if (!is_array($acl)) $acl = ['folders'=>[], 'groups'=>[]];
            if (!isset($acl['folders']) || !is_array($acl['folders'])) $acl['folders'] = [];
            if (!isset($acl['groups'])  || !is_array($acl['groups']))  $acl['groups']  = [];

            $changed = [];

            foreach ($grants as $folder => $caps) {
                $ff = self::normalizeFolder((string)$folder);
                if (!isset($acl['folders'][$ff]) || !is_array($acl['folders'][$ff])) $acl['folders'][$ff] = [];
                $rec =& $acl['folders'][$ff];

                foreach (self::BUCKETS as $k) {
                    if (!isset($rec[$k]) || !is_array($rec[$k])) $rec[$k] = [];
                }
                foreach (self::BUCKETS as $k) {
                    $arr = is_array($rec[$k]) ? $rec[$k] : [];
                    $rec[$k] = array_values(array_filter(
                        array_map('strval', $arr),
                        fn($u) => strcasecmp((string)$u, $user) !== 0
                    ));
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

                if ($m) { $v = true; $w = true; $u = $c = $ed = $rn = $cp = $dl = $ex = $sf = $sfo = true; }
                if ($u && !$v && !$vo) $vo = true;
                //if ($s && !$v) $v = true;
                if ($w) { $c = $u = $ed = $rn = $cp = $dl = $ex = true; }

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
                if ($sfo)$rec['share_folder'][] = $user;

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
            return ['ok' => true, 'updated' => $changed];
        } finally {
            fflush($fh);
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }

// --- Granular write family -----------------------------------------------

public static function canCreate(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'create')
        || self::hasGrant($user, $folder, 'write');
}

public static function canCreateFolder(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    // Only owners/managers can create subfolders under $folder
    return self::hasGrant($user, $folder, 'owners');
}

public static function canUpload(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'upload')
        || self::hasGrant($user, $folder, 'write');
}

public static function canEdit(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'edit')
        || self::hasGrant($user, $folder, 'write');
}

public static function canRename(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'rename')
        || self::hasGrant($user, $folder, 'write');
}

public static function canCopy(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'copy')
        || self::hasGrant($user, $folder, 'write');
}

public static function canMove(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::ownsFolderOrAncestor($user, $perms, $folder);
}

public static function canMoveFolder(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::ownsFolderOrAncestor($user, $perms, $folder);
}

public static function canDelete(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'delete')
        || self::hasGrant($user, $folder, 'write');
}

public static function canExtract(string $user, array $perms, string $folder): bool {
    $folder = self::normalizeFolder($folder);
    if (self::isAdmin($perms)) return true;
    return self::hasGrant($user, $folder, 'owners')
        || self::hasGrant($user, $folder, 'extract')
        || self::hasGrant($user, $folder, 'write');
}
    
    /** Sharing: files use share, folders require share + full-view. */
    public static function canShareFile(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners') || self::hasGrant($user, $folder, 'share');
    }
    public static function canShareFolder(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        $can = self::hasGrant($user, $folder, 'owners') || self::hasGrant($user, $folder, 'share');
        if (!$can) return false;
        // require full view too
        return self::hasGrant($user, $folder, 'owners') || self::hasGrant($user, $folder, 'read');
    }
}
