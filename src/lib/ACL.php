<?php
// src/lib/ACL.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';

class ACL
{
    /** In-memory cache of the ACL file. */
    private static $cache = null;
    /** Absolute path to folder_acl.json */
    private static $path  = null;

    /** Capability buckets we store per folder. */
    private const BUCKETS = ['owners','read','write','share','read_own']; // + read_own (view own only)

    /** Compute/cache the ACL storage path. */
    private static function path(): string {
        if (!self::$path) {
            self::$path = rtrim(META_DIR, '/\\') . DIRECTORY_SEPARATOR . 'folder_acl.json';
        }
        return self::$path;
    }

    /** Normalize folder names (slashes + root). */
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
                $before = $rec[$k] ?? [];
                $rec[$k] = array_values(array_filter($before, fn($u) => strcasecmp((string)$u, $user) !== 0));
                if ($rec[$k] !== $before) $changed = true;
            }
        }
        unset($rec);
    
        return $changed ? self::save($acl) : true;
    }

    /** Load ACL fresh from disk, create/heal if needed. */
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
                        'read_own'=> [],          // new bucket; empty by default
                    ],
                ],
                'groups' => [],
            ];
            @file_put_contents($path, json_encode($init, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        }

        $json = (string) @file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) $data = [];

        // Normalize shape
        $data['folders'] = isset($data['folders']) && is_array($data['folders']) ? $data['folders'] : [];
        $data['groups']  = isset($data['groups'])  && is_array($data['groups'])  ? $data['groups']  : [];

        // Ensure root exists and has all buckets
        if (!isset($data['folders']['root']) || !is_array($data['folders']['root'])) {
            $data['folders']['root'] = [
                'owners'   => ['admin'],
                'read'     => ['admin'],
                'write'    => ['admin'],
                'share'    => ['admin'],
                'read_own' => [],
            ];
        } else {
            foreach (self::BUCKETS as $k) {
                if (!isset($data['folders']['root'][$k]) || !is_array($data['folders']['root'][$k])) {
                    // sensible defaults: admin in the classic buckets, empty for read_own
                    $data['folders']['root'][$k] = ($k === 'read_own') ? [] : ['admin'];
                }
            }
        }

        // Heal any folder records
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

        // Persist back if we healed anything
        if ($healed) {
            @file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        }

        return $data;
    }

    /** Persist ACL to disk and refresh cache. */
    private static function save(array $acl): bool {
        $ok = @file_put_contents(self::path(), json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX) !== false;
        if ($ok) self::$cache = $acl;
        return $ok;
    }

    /** Get a bucket list (owners/read/write/share/read_own) for a folder (explicit only). */
    private static function listFor(string $folder, string $key): array {
        $acl = self::$cache ?? self::loadFresh();
        $f   = $acl['folders'][$folder] ?? null;
        return is_array($f[$key] ?? null) ? $f[$key] : [];
    }

    /** Ensure a folder record exists (giving an initial owner). */
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
            ];
            self::save($acl);
        }
    }

    /** True if this request is admin. */
    public static function isAdmin(array $perms = []): bool {
        if (!empty($_SESSION['isAdmin'])) return true;
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
        if (isset($perms['role']) && (string)$perms['role'] === '1') return true;
        if (!empty($_SESSION['role']) && (string)$_SESSION['role'] === '1') return true;
        // Optional: if you configured DEFAULT_ADMIN_USER, treat that username as admin
        if (defined('DEFAULT_ADMIN_USER') && !empty($_SESSION['username'])
            && strcasecmp((string)$_SESSION['username'], (string)DEFAULT_ADMIN_USER) === 0) {
            return true;
        }
        return false;
    }

    /** Case-insensitive membership in a capability bucket. $cap: owner|owners|read|write|share|read_own */
    public static function hasGrant(string $user, string $folder, string $cap): bool {
        $folder = self::normalizeFolder($folder);
        $capKey = ($cap === 'owner') ? 'owners' : $cap;
        $arr    = self::listFor($folder, $capKey);
        foreach ($arr as $u) {
            if (strcasecmp((string)$u, $user) === 0) return true;
        }
        return false;
    }

    /** True if user is an explicit owner (or admin). */
    public static function isOwner(string $user, array $perms, string $folder): bool {
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners');
    }

    /** "Manage" in UI == owner. */
    public static function canManage(string $user, array $perms, string $folder): bool {
        return self::isOwner($user, $perms, $folder);
    }

    public static function canRead(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        // IMPORTANT: write no longer implies read
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'read');
    }

    /** Own-only view = read_own OR (any full view). */
    public static function canReadOwn(string $user, array $perms, string $folder): bool {
        // if they can full-view, this is trivially true
        if (self::canRead($user, $perms, $folder)) return true;
        return self::hasGrant($user, $folder, 'read_own');
    }

    /** Upload = write OR owner. No bypassOwnership. */
    public static function canWrite(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'write');
    }

    /** Share = share OR owner. No bypassOwnership. */
    public static function canShare(string $user, array $perms, string $folder): bool {
        $folder = self::normalizeFolder($folder);
        if (self::isAdmin($perms)) return true;
        return self::hasGrant($user, $folder, 'owners')
            || self::hasGrant($user, $folder, 'share');
    }

    /**
     * Return explicit lists for a folder (no inheritance).
     * Keys: owners, read, write, share, read_own (always arrays).
     */
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

    /**
     * Upsert a full explicit record for a folder.
     * NOTE: preserves existing 'read_own' so older callers don't wipe it.
     */
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
            // preserve any own-only grants unless caller explicitly manages them elsewhere
            'read_own' => isset($existing['read_own']) && is_array($existing['read_own'])
                ? array_values(array_unique(array_map('strval', $existing['read_own'])))
                : [],
        ];
        return self::save($acl);
    }

    /**
     * Atomic per-user update across many folders.
     * $grants is like:
     *   [
     *     "folderA" => ["view"=>true, "viewOwn"=>false, "upload"=>true, "manage"=>false, "share"=>false],
     *     "folderB" => ["view"=>false, "viewOwn"=>true,  "upload"=>false, "manage"=>false, "share"=>false],
     *   ]
     * If a folder is INCLUDED with all false, the user is removed from all its buckets.
     * (If the frontend omits a folder entirely, this method leaves that folder unchanged.)
     */
    public static function applyUserGrantsAtomic(string $user, array $grants): array {
        $user = (string)$user;
        $path = self::path();

        $fh = @fopen($path, 'c+');
        if (!$fh) throw new RuntimeException('Cannot open ACL storage');
        if (!flock($fh, LOCK_EX)) { fclose($fh); throw new RuntimeException('Cannot lock ACL storage'); }

        try {
            // Read current content
            $raw = stream_get_contents($fh);
            if ($raw === false) $raw = '';
            $acl = json_decode($raw, true);
            if (!is_array($acl)) $acl = ['folders'=>[], 'groups'=>[]];
            if (!isset($acl['folders']) || !is_array($acl['folders'])) $acl['folders'] = [];
            if (!isset($acl['groups'])  || !is_array($acl['groups']))  $acl['groups']  = [];

            $changed = [];

            foreach ($grants as $folder => $caps) {
                $ff = self::normalizeFolder((string)$folder);
                if (!isset($acl['folders'][$ff]) || !is_array($acl['folders'][$ff])) {
                    $acl['folders'][$ff] = ['owners'=>[], 'read'=>[], 'write'=>[], 'share'=>[], 'read_own'=>[]];
                }
                $rec =& $acl['folders'][$ff];

                // Remove user from all buckets first (idempotent)
                foreach (self::BUCKETS as $k) {
                    $rec[$k] = array_values(array_filter(
                        array_map('strval', $rec[$k]),
                        fn($u) => strcasecmp($u, $user) !== 0
                    ));
                }

                $v  = !empty($caps['view']);       // full view
                $vo = !empty($caps['viewOwn']);    // own-only view
                $u  = !empty($caps['upload']);
                $m  = !empty($caps['manage']);
                $s  = !empty($caps['share']);

                // Implications
                if ($m) { $v = true; $u = true; }   // owner implies read+write
                if ($u && !$v && !$vo) $vo = true;  // upload needs at least own-only visibility
                if ($s && !$v) $v = true;           // sharing implies full read (can be relaxed if desired)

                // Add back per caps
                if ($m) $rec['owners'][]   = $user;
                if ($v) $rec['read'][]     = $user;
                if ($vo) $rec['read_own'][]= $user;
                if ($u) $rec['write'][]    = $user;
                if ($s) $rec['share'][]    = $user;

                // De-dup
                foreach (self::BUCKETS as $k) {
                    $rec[$k] = array_values(array_unique(array_map('strval', $rec[$k])));
                }

                $changed[] = $ff;
                unset($rec);
            }

            // Write back atomically
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
}