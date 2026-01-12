<?php
// src/controllers/FolderController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/FolderMeta.php';
require_once PROJECT_ROOT . '/src/lib/FS.php';
require_once PROJECT_ROOT . '/src/models/UploadModel.php';
require_once PROJECT_ROOT . '/src/lib/AuditHook.php';
require_once PROJECT_ROOT . '/src/models/FolderCrypto.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class FolderController
{
    /* -------------------- Session / Header helpers -------------------- */
    private static function ensureSession(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    }

    private static function getHeadersLower(): array
    {
        if (function_exists('getallheaders')) {
            $h = getallheaders();
            if (is_array($h)) return array_change_key_case($h, CASE_LOWER);
        }
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (strpos($k, 'HTTP_') === 0) {
                $name = strtolower(str_replace('_', '-', substr($k, 5)));
                $headers[$name] = $v;
            }
        }
        return $headers;
    }

    private function normalizeSourceId($id): string
    {
        $id = trim((string)$id);
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return '';
        }
        return $id;
    }

    private function withSourceContext(string $sourceId, callable $fn, bool $allowDisabled = false)
    {
        if (!class_exists('SourceContext') || $sourceId === '') {
            return $fn();
        }
        $prev = SourceContext::getActiveId();
        SourceContext::setActiveId($sourceId, false, $allowDisabled);
        try {
            return $fn();
        } finally {
            SourceContext::setActiveId($prev, false);
        }
    }

    private function crossSourceEncryptedError(
        string $sourceId,
        string $sourceFolder,
        string $destSourceId,
        string $destFolder
    ): ?string {
        if (!class_exists('SourceContext')) {
            return null;
        }
        $srcEncrypted = (bool)$this->withSourceContext($sourceId, function () use ($sourceFolder) {
            try {
                return FolderCrypto::isEncryptedOrAncestor($sourceFolder);
            } catch (\Throwable $e) {
                return false;
            }
        });
        $dstEncrypted = (bool)$this->withSourceContext($destSourceId, function () use ($destFolder) {
            try {
                return FolderCrypto::isEncryptedOrAncestor($destFolder);
            } catch (\Throwable $e) {
                return false;
            }
        });
        if ($srcEncrypted || $dstEncrypted) {
            return 'Encrypted folders are not supported for cross-source copy/move.';
        }
        return null;
    }

    public static function listChildren(string $folder, string $user, array $perms, ?string $cursor = null, int $limit = 500, bool $probe = true): array
    {
        return FolderModel::listChildren($folder, $user, $perms, $cursor, $limit, $probe);
    }

    /** Stats for a folder (folders/files/bytes; deep totals are opt-in). */
    public static function stats(string $folder, string $user, array $perms, bool $deep = false, ?int $maxDepth = null): array
    {
        // Normalize inside model; this is a thin action
        if (!$deep) {
            return FolderModel::countVisible($folder, $user, $perms);
        }

        if ($maxDepth !== null) {
            $maxDepth = (int)$maxDepth;
            if ($maxDepth <= 0) {
                $maxDepth = null;
            } else {
                $maxDepth = min($maxDepth, 10);
            }
        }

        return FolderModel::countVisibleDeep($folder, $user, $perms, 20000, $maxDepth);
    }

    /** Capabilities for UI buttons/menus (unchanged semantics; just centralized). */
    public static function capabilities(string $folder, string $username): array
    {
        $folder = ACL::normalizeFolder($folder);
        $perms  = self::loadPermsFor($username);

        $isAdmin       = ACL::isAdmin($perms);
        $folderOnly    = self::boolFrom($perms, 'folderOnly', 'userFolderOnly', 'UserFolderOnly');
        $readOnly      = !empty($perms['readOnly']) || (class_exists('SourceContext') && SourceContext::isReadOnly());
        $disableUpload = !empty($perms['disableUpload']);

        $isOwner = ACL::isOwner($username, $perms, $folder);

        $inScope = self::inUserFolderScope($folder, $username, $perms, $isAdmin, $folderOnly);

        $canViewBase   = $isAdmin || ACL::canRead($username, $perms, $folder);
        $canViewOwn    = $isAdmin || ACL::canReadOwn($username, $perms, $folder);
        $canShareBase  = $isAdmin || ACL::canShare($username, $perms, $folder);

        $gCreateBase   = $isAdmin || ACL::canCreate($username, $perms, $folder);
        $gRenameBase   = $isAdmin || ACL::canRename($username, $perms, $folder);
        $gDeleteBase   = $isAdmin || ACL::canDelete($username, $perms, $folder);
        $gMoveBase     = $isAdmin || ACL::canMove($username, $perms, $folder);
        $gUploadBase   = $isAdmin || ACL::canUpload($username, $perms, $folder);
        $gEditBase     = $isAdmin || ACL::canEdit($username, $perms, $folder);
        $gCopyBase     = $isAdmin || ACL::canCopy($username, $perms, $folder);
        $gExtractBase  = $isAdmin || ACL::canExtract($username, $perms, $folder);
        $gShareFile    = $isAdmin || ACL::canShareFile($username, $perms, $folder);
        $gShareFolder  = $isAdmin || ACL::canShareFolder($username, $perms, $folder);

        $canView       = $canViewBase && $inScope;

        $canUpload     = $gUploadBase && !$readOnly && !$disableUpload && $inScope;
        $canCreate     = $gCreateBase && !$readOnly && $inScope;
        $canRename     = $gRenameBase && !$readOnly && $inScope;
        $canDelete     = $gDeleteBase && !$readOnly && $inScope;
        $canDeleteFile = $gDeleteBase && !$readOnly && $inScope;

        $canDeleteFolder = !$readOnly && $inScope && (
            $isAdmin ||
            $isOwner ||
            ACL::canManage($username, $perms, $folder) ||
            $gDeleteBase // if your ACL::canDelete should also allow folder deletes
        );

        $canReceive    = ($gUploadBase || $gCreateBase || $isAdmin) && !$readOnly && !$disableUpload && $inScope;
        $canMoveIn     = $canReceive;

        $canEdit       = $gEditBase && !$readOnly && $inScope;
        $canCopy       = $gCopyBase && !$readOnly && $inScope;
        $canExtract    = $gExtractBase && !$readOnly && $inScope;

        $canShareEff   = $canShareBase && $inScope;
        $canShareFile  = $gShareFile   && $inScope;
        $canShareFold  = $gShareFolder && $inScope;

        $canAudit      = $isAdmin || self::ownsFolderOrAncestor($folder, $username, $perms);

        // Encryption-at-rest status for this folder (and descendants)
        $enc = [
            'supported' => false,
            'hasMasterKey' => false,
            'encrypted' => false,
            'rootEncrypted' => false,
            'inherited' => false,
            'root' => null,
            'job' => [
                'active' => false,
                'root' => null,
                'id' => null,
                'type' => null,
                'state' => null,
                'error' => null,
            ],
            'canEncrypt' => false,
            'canDecrypt' => false,
        ];
        try {
            $enc['supported'] = CryptoAtRest::isAvailable();
            $enc['hasMasterKey'] = CryptoAtRest::masterKeyIsConfigured();
            $st = FolderCrypto::getStatus($folder);
            $enc['encrypted'] = !empty($st['encrypted']);
            $enc['rootEncrypted'] = !empty($st['rootEncrypted']);
            $enc['inherited'] = !empty($st['inherited']);
            $enc['root'] = $st['root'] ?? null;

            $jobSt = FolderCrypto::getJobStatus($folder);
            if (!empty($jobSt['active']) && !empty($jobSt['job']) && is_array($jobSt['job'])) {
                $enc['job'] = [
                    'active' => true,
                    'root' => $jobSt['root'] ?? null,
                    'id' => $jobSt['job']['id'] ?? null,
                    'type' => $jobSt['job']['type'] ?? null,
                    'state' => $jobSt['job']['state'] ?? null,
                    'error' => $jobSt['job']['error'] ?? null,
                ];
            }
        } catch (\Throwable $e) {
            // keep defaults
        }

        // Treat folders as restricted during an active crypto job (even if not fully encrypted yet).
        if (!empty($enc['job']['active'])) {
            $enc['encrypted'] = true;
        }

        if (!empty($enc['encrypted'])) {
            // v1 enforcement: no shares / no ZIP operations inside encrypted folders
            $canShareEff = false;
            $canShareFile = false;
            $canShareFold = false;
            $canExtract = false;
        }

        $isRoot = ($folder === 'root');
        $canMoveFolder = false;
        if ($isRoot) {
            $canRename     = false;
            $canDelete     = false;
            $canShareFold  = false;
        } else {
            $canMoveFolder = (ACL::canManage($username, $perms, $folder) || ACL::isOwner($username, $perms, $folder))
                && !$readOnly;
        }

        $owner = null;
        try {
            if (class_exists('FolderModel') && method_exists('FolderModel', 'getOwnerFor')) $owner = FolderModel::getOwnerFor($folder);
        } catch (\Throwable $e) {
        }

        // Allow folder encryption toggles for admins and folder-managers/owners (not within inherited encrypted trees)
        $canManageForEncryption = $isAdmin
            || ACL::canManage($username, $perms, $folder)
            || $isOwner;
        if ($isRoot && !$isAdmin) $canManageForEncryption = false;

        if (!empty($enc['supported']) && !empty($enc['hasMasterKey']) && $canManageForEncryption && empty($enc['inherited'])) {
            $enc['canEncrypt'] = empty($enc['encrypted']) && !$readOnly;
            $enc['canDecrypt'] = !empty($enc['rootEncrypted']) && !$readOnly;
        }

        // During a crypto job, disable toggles to avoid multiple concurrent operations.
        if (!empty($enc['job']['active'])) {
            $enc['canEncrypt'] = false;
            $enc['canDecrypt'] = false;
        }

        return [
            'user'    => $username,
            'folder'  => $folder,
            'isAdmin' => $isAdmin,
            'flags'   => [
                'folderOnly'    => $folderOnly,
                'readOnly'      => $readOnly,
                'disableUpload' => $disableUpload,
            ],
            'owner'          => $owner,

            'canView'        => $canView,
            'canViewOwn'     => $canViewOwn,

            'canUpload'      => $canUpload,
            'canCreate'      => $canCreate,
            'canRename'      => $canRename,
            'canDelete'      => $canDeleteFile,
            'canDeleteFolder' => $canDeleteFolder,

            'canMoveIn'      => $canMoveIn,
            'canMove'        => $canMoveIn,         // legacy alias
            'canMoveFolder'  => $canMoveFolder,

            'canEdit'        => $canEdit,
            'canCopy'        => $canCopy,
            'canExtract'     => $canExtract,

            'canShare'       => $canShareEff,       // legacy umbrella
            'canShareFile'   => $canShareFile,
            'canShareFolder' => $canShareFold,
            'canAudit'       => $canAudit,

            'encryption'     => $enc,
        ];
    }

    /* ---------------------------
       Private helpers (caps)
    ----------------------------*/
    private static function loadPermsFor(string $u): array
    {
        try {
            if (function_exists('loadUserPermissions')) {
                $p = loadUserPermissions($u);
                return is_array($p) ? $p : [];
            }
            if (class_exists('userModel') && method_exists('userModel', 'getUserPermissions')) {
                $all = userModel::getUserPermissions();
                if (is_array($all)) {
                    if (isset($all[$u])) return (array)$all[$u];
                    $lk = strtolower($u);
                    if (isset($all[$lk])) return (array)$all[$lk];
                }
            }
        } catch (\Throwable $e) {
        }
        return [];
    }

    private static function boolFrom(array $a, string ...$keys): bool
    {
        foreach ($keys as $k) if (!empty($a[$k])) return true;
        return false;
    }

    private static function isOwnerOrAncestorOwner(string $user, array $perms, string $folder): bool
    {
        $f = ACL::normalizeFolder($folder);
        if (ACL::isOwner($user, $perms, $f)) return true;
        while ($f !== '' && strcasecmp($f, 'root') !== 0) {
            $pos = strrpos($f, '/');
            if ($pos === false) break;
            $f = substr($f, 0, $pos);
            if ($f === '' || strcasecmp($f, 'root') === 0) break;
            if (ACL::isOwner($user, $perms, $f)) return true;
        }
        return false;
    }

    private static function inUserFolderScope(string $folder, string $u, array $perms, bool $isAdmin, bool $folderOnly): bool
    {
        if ($isAdmin) return true;
        if (!$folderOnly) return true; // normal users: global scope

        $f = ACL::normalizeFolder($folder);
        if ($f === 'root' || $f === '') {
            return self::isOwnerOrAncestorOwner($u, $perms, $f);
        }
        if ($f === $u || str_starts_with($f, $u . '/')) return true;
        return self::isOwnerOrAncestorOwner($u, $perms, $f);
    }

    private static function requireCsrf(): void
    {
        self::ensureSession();
        $headers  = self::getHeadersLower();
        $received = trim($headers['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));
        if (!isset($_SESSION['csrf_token']) || $received !== $_SESSION['csrf_token']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid CSRF token']);
            exit;
        }
    }

    private static function requireAuth(): void
    {
        self::ensureSession();
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }

    /* -------------------- Permissions helpers -------------------- */
    private static function loadPerms(string $username): array
    {
        try {
            if (function_exists('loadUserPermissions')) {
                $p = loadUserPermissions($username);
                return is_array($p) ? $p : [];
            }
            if (class_exists('userModel') && method_exists('userModel', 'getUserPermissions')) {
                $all = userModel::getUserPermissions();
                if (is_array($all)) {
                    if (isset($all[$username])) return (array)$all[$username];
                    $lk = strtolower($username);
                    if (isset($all[$lk])) return (array)$all[$lk];
                }
            }
        } catch (\Throwable $e) { /* ignore */
        }
        return [];
    }

    private static function migrateFolderColors(string $source, string $target): array
    {
        // PHP 8 polyfill
        if (!function_exists('str_starts_with')) {
            function str_starts_with(string $haystack, string $needle): bool
            {
                return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
            }
        }

        $metaDir = class_exists('SourceContext')
            ? rtrim(SourceContext::metaRoot(), '/\\')
            : rtrim((string)META_DIR, '/\\');
        $file = $metaDir . '/folder_colors.json';

        // Read current map (treat unreadable/invalid as empty)
        $raw = @file_get_contents($file);
        $map = is_string($raw) ? json_decode($raw, true) : [];
        if (!is_array($map)) $map = [];

        // Nothing to do fast-path
        $prefixSrc  = $source;
        $prefixNeed = $source . '/';
        $changed = false;
        $new = $map;
        $movedCount = 0;

        foreach ($map as $key => $hex) {
            if ($key === $prefixSrc || str_starts_with($key . '/', $prefixNeed)) {
                unset($new[$key]);
                $suffix = substr($key, strlen($prefixSrc)); // '' or '/sub/...'
                $newKey = ($target === 'root') ? ltrim($suffix, '/\\') : rtrim($target, '/\\') . $suffix;
                $new[$newKey] = $hex;
                $changed = true;
                $movedCount++;
            }
        }

        if ($changed) {
            // Write back (atomic-ish). Ignore failures (don’t block the move).
            $json = json_encode($new, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if (is_string($json)) {
                @file_put_contents($file, $json, LOCK_EX);
                @chmod($file, 0664);
            }
        }

        return ['changed' => $changed, 'moved' => $movedCount];
    }

    private static function getPerms(): array
    {
        self::ensureSession();
        $u = $_SESSION['username'] ?? '';
        return $u ? self::loadPerms($u) : [];
    }

    private static function isAdmin(array $perms = []): bool
    {
        self::ensureSession();
        if (!empty($_SESSION['isAdmin'])) return true;
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;

        // Fallback: role from users.txt (role "1" means admin)
        $u = $_SESSION['username'] ?? '';
        if ($u && class_exists('userModel') && method_exists('userModel', 'getUserRole')) {
            $roleStr = userModel::getUserRole($u);
            if ($roleStr === '1') return true;
        }
        return false;
    }

    private static function isFolderOnly(array $perms): bool
    {
        return !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
    }

    private static function requireNotReadOnly(): void
    {
        if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Source is read-only.']);
            exit;
        }
        $perms = self::getPerms();
        if (!empty($perms['readOnly'])) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Read-only users are not allowed to perform this action.']);
            exit;
        }
    }

    private static function requireAdmin(): void
    {
        $perms = self::getPerms();
        if (!self::isAdmin($perms)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Admin privileges required.']);
            exit;
        }
    }

    private static function formatBytes(int $bytes): string
    {
        if ($bytes < 1024) return $bytes . " B";
        if ($bytes < 1048576) return round($bytes / 1024, 2) . " KB";
        if ($bytes < 1073741824) return round($bytes / 1048576, 2) . " MB";
        return round($bytes / 1073741824, 2) . " GB";
    }

    /** Return true if user is explicit owner of the folder or any of its ancestors (admins also true). */
    private static function ownsFolderOrAncestor(string $folder, string $username, array $perms): bool
    {
        if (self::isAdmin($perms)) return true;
        $folder = ACL::normalizeFolder($folder);
        $f = $folder;
        while ($f !== '' && strtolower($f) !== 'root') {
            if (ACL::isOwner($username, $perms, $f)) return true;
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? '' : substr($f, 0, $pos);
        }
        return false;
    }

    /**
     * Enforce per-folder scope for folder-only accounts.
     * $need: 'read' | 'write' | 'manage' | 'share' | 'read_own' (default 'read')
     * Returns null if allowed, or an error string if forbidden.
     */
    // In FolderController.php
    private static function enforceFolderScope(
        string $folder,
        string $username,
        array  $perms,
        string $need = 'read'
    ): ?string {
        // Admins bypass scope
        if (self::isAdmin($perms)) return null;

        // If this account isn't folder-scoped, don't gate here
        if (!self::isFolderOnly($perms)) return null;

        $folder = ACL::normalizeFolder($folder);

        // If user owns folder or an ancestor, allow
        $f = $folder;
        while ($f !== '' && strtolower($f) !== 'root') {
            if (ACL::isOwner($username, $perms, $f)) return null;
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? '' : substr($f, 0, $pos);
        }

        // Normalize aliases so callers can pass either camelCase or snake_case
        switch ($need) {
            case 'manage':
                $ok = ACL::canManage($username, $perms, $folder);
                break;

            // legacy:
            case 'write':
                $ok = ACL::canWrite($username, $perms, $folder);
                break;
            case 'share':
                $ok = ACL::canShare($username, $perms, $folder);
                break;

            // read flavors:
            case 'read_own':
                $ok = ACL::canReadOwn($username, $perms, $folder);
                break;
            case 'read':
                $ok = ACL::canRead($username, $perms, $folder);
                break;

            // granular write-ish:
            case 'create':
                $ok = ACL::canCreate($username, $perms, $folder);
                break;
            case 'upload':
                $ok = ACL::canUpload($username, $perms, $folder);
                break;
            case 'edit':
                $ok = ACL::canEdit($username, $perms, $folder);
                break;
            case 'rename':
                $ok = ACL::canRename($username, $perms, $folder);
                break;
            case 'copy':
                $ok = ACL::canCopy($username, $perms, $folder);
                break;
            case 'move':
                $ok = ACL::canMove($username, $perms, $folder);
                break;
            case 'delete':
                $ok = ACL::canDelete($username, $perms, $folder);
                break;
            case 'extract':
                $ok = ACL::canExtract($username, $perms, $folder);
                break;

            // granular share (support both key styles)
            case 'shareFile':
            case 'share_file':
                $ok = ACL::canShareFile($username, $perms, $folder);
                break;
            case 'shareFolder':
            case 'share_folder':
                $ok = ACL::canShareFolder($username, $perms, $folder);
                break;

            default:
                // Default to full read if unknown need was passed
                $ok = ACL::canRead($username, $perms, $folder);
        }

        return $ok ? null : "Forbidden: folder scope violation.";
    }

    /** Returns true if caller can ignore ownership (admin or bypassOwnership/default). */
    private static function canBypassOwnership(array $perms): bool
    {
        if (self::isAdmin($perms)) return true;
        return (bool)($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
    }

    /** ACL-aware folder owner check (explicit). */
    private static function isFolderOwner(string $folder, string $username, array $perms): bool
    {
        return ACL::isOwner($username, $perms, $folder);
    }

    /* -------------------- API: Create Folder -------------------- */
    public function createFolder(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            return;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        try {
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            if (!isset($input['folderName'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Folder name not provided.']);
                return;
            }

            $folderName = trim((string)$input['folderName']);
            $parentIn   = isset($input['parent']) ? trim((string)$input['parent']) : 'root';

            if (!preg_match(REGEX_FOLDER_NAME, $folderName)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid folder name.']);
                return;
            }
            if ($parentIn !== '' && strcasecmp($parentIn, 'root') !== 0 && !preg_match(REGEX_FOLDER_NAME, $parentIn)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid parent folder name.']);
                return;
            }

            $parent = ($parentIn === '' ? 'root' : $parentIn);

            $username = $_SESSION['username'] ?? '';
            $perms    = self::getPerms();

            // Need create on parent OR ownership on parent/ancestor
            if (!(ACL::canCreateFolder($username, $perms, $parent) || self::ownsFolderOrAncestor($parent, $username, $perms))) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden: manager/owner required on parent.']);
                exit;
            }

            // Folder-scope gate for folder-only accounts (need create on parent)
            if ($msg = self::enforceFolderScope($parent, $username, $perms, 'manage')) {
                http_response_code(403);
                echo json_encode(['error' => $msg]);
                return;
            }

            $result = FolderModel::createFolder($folderName, $parent, $username);
            if (empty($result['success'])) {
                http_response_code(400);
                echo json_encode($result);
                return;
            }

            $newFolder = ($parent === 'root') ? $folderName : ($parent . '/' . $folderName);
            AuditHook::log('folder.create', [
                'user'   => $username,
                'folder' => $newFolder,
                'path'   => $newFolder,
            ]);

            echo json_encode($result);
        } catch (Throwable $e) {
            error_log('createFolder fatal: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            http_response_code(500);
            echo json_encode(['error' => 'Internal error creating folder.']);
        }
    }

    /* -------------------- API: Delete Folder -------------------- */
    public function deleteFolder(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(["error" => "Method not allowed."]);
            exit;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        $sourceId = is_array($input) && isset($input['sourceId']) ? trim((string)$input['sourceId']) : '';
        if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
                http_response_code(400);
                echo json_encode(["error" => "Invalid source id."]);
                exit;
            }
            $src = SourceContext::getSourceById($sourceId);
            if (!$src || empty($src['enabled'])) {
                http_response_code(400);
                echo json_encode(["error" => "Invalid source."]);
                exit;
            }
            SourceContext::setActiveId($sourceId, false, true);
        }
        if (!isset($input['folder'])) {
            http_response_code(400);
            echo json_encode(["error" => "Folder name not provided."]);
            exit;
        }

        $folder = trim((string)$input['folder']);
        if (strcasecmp($folder, 'root') === 0) {
            http_response_code(400);
            echo json_encode(["error" => "Cannot delete root folder."]);
            exit;
        }
        if (!preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();

        // Folder-scope: need manage (owner) OR explicit manage grant
        if ($msg = self::enforceFolderScope($folder, $username, $perms, 'manage')) {
            http_response_code(403);
            echo json_encode(["error" => $msg]);
            exit;
        }

        // Require either manage permission or ancestor ownership (strong gate)
        $canManage = ACL::canManage($username, $perms, $folder) || self::ownsFolderOrAncestor($folder, $username, $perms);
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(["error" => "Forbidden: you lack manage rights for this folder."]);
            exit;
        }

        // If not bypassing ownership, require ownership (direct or ancestor) as an extra safeguard
        if (!self::canBypassOwnership($perms) && !self::ownsFolderOrAncestor($folder, $username, $perms)) {
            http_response_code(403);
            echo json_encode(["error" => "Forbidden: you are not the folder owner."]);
            exit;
        }

        $result = FolderModel::deleteFolder($folder);
        if (!empty($result['success'])) {
            AuditHook::log('folder.delete', [
                'user'   => $username,
                'folder' => $folder,
                'path'   => $folder,
            ]);
        }
        echo json_encode($result);
        exit;
    }

    /* -------------------- API: Rename Folder -------------------- */
    public function renameFolder(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            exit;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Required folder names not provided.']);
            exit;
        }

        $oldFolder = trim((string)$input['oldFolder']);
        $newFolder = trim((string)$input['newFolder']);

        if (!preg_match(REGEX_FOLDER_NAME, $oldFolder) || !preg_match(REGEX_FOLDER_NAME, $newFolder)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder name(s).']);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();

        // Must be allowed to manage the old folder
        if ($msg = self::enforceFolderScope($oldFolder, $username, $perms, 'manage')) {
            http_response_code(403);
            echo json_encode(["error" => $msg]);
            exit;
        }
        // For the new folder path, require write scope (we're "creating" a path)
        if ($msg = self::enforceFolderScope($newFolder, $username, $perms, 'manage')) {
            http_response_code(403);
            echo json_encode(["error" => "New path not allowed: " . $msg]);
            exit;
        }

        // Strong gates: need manage on old OR ancestor owner; need manage on new parent OR ancestor owner
        $canManageOld = ACL::canManage($username, $perms, $oldFolder) || self::ownsFolderOrAncestor($oldFolder, $username, $perms);
        if (!$canManageOld) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: you lack manage rights on the source folder.']);
            exit;
        }

        // If not bypassing ownership, require ownership (direct or ancestor) on the old folder
        if (!self::canBypassOwnership($perms) && !self::ownsFolderOrAncestor($oldFolder, $username, $perms)) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: you are not the folder owner.']);
            exit;
        }

        $result = FolderModel::renameFolder($oldFolder, $newFolder);
        if (!empty($result['success'])) {
            AuditHook::log('folder.rename', [
                'user'   => $username,
                'folder' => $newFolder,
                'from'   => $oldFolder,
                'to'     => $newFolder,
            ]);
        }
        echo json_encode($result);
        exit;
    }

    /* -------------------- API: Get Folder List -------------------- */
    public function getFolderList(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();

        $countsRaw = $_GET['counts'] ?? null;
        $includeCounts = true;
        if ($countsRaw !== null) {
            $cv = strtolower((string)$countsRaw);
            if ($cv === '0' || $cv === 'false' || $cv === 'no') $includeCounts = false;
        }

        // Optional "folder" filter (supports nested like "team/reports")
        $parent = $_GET['folder'] ?? null;
        if ($parent !== null && $parent !== '' && strcasecmp($parent, 'root') !== 0) {
            $parts = array_filter(explode('/', trim($parent, "/\\ ")), fn($p) => $p !== '');
            if (empty($parts)) {
                http_response_code(400);
                echo json_encode(["error" => "Invalid folder name."]);
                exit;
            }
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    http_response_code(400);
                    echo json_encode(["error" => "Invalid folder name."]);
                    exit;
                }
            }
            $parent = implode('/', $parts);
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();
        $isAdmin  = self::isAdmin($perms);

        $sourceId = '';
        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $rawSourceId = trim((string)($_GET['sourceId'] ?? ''));
            if ($rawSourceId !== '') {
                $sourceId = $this->normalizeSourceId($rawSourceId);
                if ($sourceId === '') {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid source id.']);
                    exit;
                }
                $info = SourceContext::getSourceById($sourceId);
                if (!$info) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid source.']);
                    exit;
                }
            }
        }

        $runner = function () use ($includeCounts, $isAdmin, $username, $perms, $parent) {
            // 1) Full list from model
            $all = FolderModel::getFolderList($parent, null, [], $includeCounts); // each row: ["folder","fileCount","metadataFile"]
            if (!is_array($all)) {
                return [];
            }

            // 2) Filter by view rights
            if (!$isAdmin) {
                $all = array_values(array_filter($all, function ($row) use ($username, $perms) {
                    $f = $row['folder'] ?? '';
                    if ($f === '') return false;

                    // Full view if canRead OR owns ancestor; otherwise allow if read_own granted
                    $fullView = ACL::canRead($username, $perms, $f) || FolderController::ownsFolderOrAncestor($f, $username, $perms);
                    $ownOnly  = ACL::hasGrant($username, $f, 'read_own');

                    return $fullView || $ownOnly;
                }));
            }

            // 3) Optional parent filter (applies to both admin and non-admin)
            if ($parent && strcasecmp($parent, 'root') !== 0) {
                $pref = $parent . '/';
                $all = array_values(array_filter($all, function ($row) use ($parent, $pref) {
                    $f = $row['folder'] ?? '';
                    return ($f === $parent) || (strpos($f, $pref) === 0);
                }));
            }

            return $all;
        };

        $all = ($sourceId !== '')
            ? $this->withSourceContext($sourceId, $runner, $isAdmin)
            : $runner();

        echo json_encode($all);
        exit;
    }

    /* -------------------- API: Download Shared File -------------------- */
    public function downloadSharedFile(): void
    {
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $file  = filter_input(INPUT_GET, 'file', FILTER_SANITIZE_STRING);

        if (empty($token) || empty($file)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Missing token or file parameter."]);
            exit;
        }

        $basename = basename($file);
        if (!preg_match(REGEX_FILE_NAME, $basename)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }

        $result = FolderModel::getSharedFileInfo($token, $basename);
        if (isset($result['error'])) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => $result['error']]);
            exit;
        }

        $storage = StorageRegistry::getAdapter();
        $filePath = (string)($result['filePath'] ?? '');
        $downloadName = (string)($result['downloadName'] ?? basename($filePath));
        if ($downloadName === '') {
            $downloadName = $basename;
        }
        $ext = strtolower(pathinfo($downloadName, PATHINFO_EXTENSION));

        // Ensure clean binary response (only on the file-stream path)
        if (headers_sent($hf, $hl)) {
            error_log("downloadSharedFile headers already sent at {$hf}:{$hl}");
        }
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        // Harden against sniffing
        header('X-Content-Type-Options: nosniff');

        // Safer filename handling
        $downloadName = str_replace(["\r", "\n"], '', $downloadName);
        $downloadNameStar = rawurlencode($downloadName);

        // Explicit raster map (so PNG/JPG always render even if model mime is wrong)
        $rasterMime = [
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png'  => 'image/png',
            'gif'  => 'image/gif',
            'bmp'  => 'image/bmp',
            'webp' => 'image/webp',
            'ico'  => 'image/x-icon',
        ];

        // SVG / SVGZ: NEVER render inline on shared/public links
        if ($ext === 'svg' || $ext === 'svgz') {
            header('Content-Type: application/octet-stream');
            header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
            // defense-in-depth if something opens it anyway
            header("Content-Security-Policy: sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
        } elseif (isset($rasterMime[$ext])) {
            // Raster images: allow inline so gallery <img> works
            header('Content-Type: ' . $rasterMime[$ext]);
            header("Content-Disposition: inline; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
        } else {
            // Everything else: download
            $mimeType = $result['mimeType'] ?? 'application/octet-stream';
            if (!is_string($mimeType) || $mimeType === '') {
                $mimeType = 'application/octet-stream';
            }
            header('Content-Type: ' . $mimeType);
            header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
        }

        AuditHook::log('file.download', [
            'user'   => 'share:' . $token,
            'source' => 'share',
            'folder' => $result['folder'] ?? 'root',
            'path'   => !empty($result['folder']) && $result['folder'] !== 'root'
                ? ($result['folder'] . '/' . $basename)
                : $basename,
            'meta'   => [
                'token' => $token,
            ],
        ]);

        if ($storage->isLocal()) {
            $size = @filesize($filePath);
            if (is_int($size)) {
                header('Content-Length: ' . $size);
            }
            readfile($filePath);
            exit;
        }

        $size = (int)($result['size'] ?? 0);
        if ($size <= 0 && empty($result['sizeUnknown'])) {
            $stat = $storage->stat($filePath);
            $size = (int)($stat['size'] ?? 0);
        }
        if ($size > 0) {
            header('Content-Length: ' . $size);
        }

        $stream = $storage->openReadStream($filePath, null, 0);
        if ($stream === false) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'File not found']);
            exit;
        }

        $chunkSize = 8192;
        while (true) {
            if (is_resource($stream)) {
                $buffer = fread($stream, $chunkSize);
            } elseif (is_object($stream) && method_exists($stream, 'read')) {
                $buffer = $stream->read($chunkSize);
            } elseif (is_object($stream) && method_exists($stream, 'getContents')) {
                $buffer = $stream->getContents();
            } else {
                $buffer = false;
            }
            if ($buffer === false || $buffer === '') {
                break;
            }
            echo $buffer;
            flush();
            if (connection_aborted()) {
                break;
            }
        }

        if (is_resource($stream)) {
            fclose($stream);
        } elseif (is_object($stream) && method_exists($stream, 'close')) {
            $stream->close();
        }
        exit;
    }

    /* -------------------- Public Shared Folder HTML -------------------- */
    public function shareFolder(): void
    {
        $token        = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);
        $page         = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
        if ($page === false || $page < 1) $page = 1;

        if (empty($token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token."]);
            exit;
        }

        $data = FolderModel::getSharedFolderData($token, $providedPass, $page);

        if (isset($data['needs_password']) && $data['needs_password'] === true) {
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header('X-Frame-Options: DENY');
            header("Content-Security-Policy: frame-ancestors 'none';");
            header("Content-Type: text/html; charset=utf-8"); ?>
            <!DOCTYPE html>
            <html lang="en">

            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Enter Password</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        background: #f7f7f7
                    }

                    .container {
                        max-width: 400px;
                        margin: 80px auto;
                        background: #fff;
                        padding: 20px;
                        border-radius: 4px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, .1)
                    }

                    input[type=password],
                    button {
                        width: 100%;
                        padding: 10px;
                        margin: 10px 0;
                        font-size: 1rem
                    }

                    button {
                        background: #007BFF;
                        border: none;
                        color: #fff;
                        cursor: pointer
                    }

                    button:hover {
                        background: #0056b3
                    }
                </style>
            </head>

            <body>
                <div class="container">
                    <h2>Folder Protected</h2>
                    <p>This folder is protected by a password. Please enter the password to view its contents.</p>
                    <form method="get" action="<?php echo htmlspecialchars(fr_with_base_path('/api/folder/shareFolder.php'), ENT_QUOTES, 'UTF-8'); ?>"><input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>"><label for="pass">Password:</label><input type="password" name="pass" id="pass" required><button type="submit">Submit</button></form>
                </div>
            </body>

            </html>
        <?php exit;
        }

        if (isset($data['error'])) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => $data['error']]);
            exit;
        }

        require_once PROJECT_ROOT . '/src/models/AdminModel.php';
        $adminConfig          = AdminModel::getConfig();
        $sharedMaxUploadSize  = (isset($adminConfig['sharedMaxUploadSize']) && is_numeric($adminConfig['sharedMaxUploadSize']))
            ? (int)$adminConfig['sharedMaxUploadSize'] : null;

        $folderName  = $data['folder'];
        $files       = $data['files'];
        $fileSizes   = is_array($data['fileSizes'] ?? null) ? $data['fileSizes'] : [];
        $currentPage = $data['currentPage'];
        $totalPages  = $data['totalPages'];

        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Frame-Options: DENY');
        header("Content-Security-Policy: frame-ancestors 'none';");
        header("Content-Type: text/html; charset=utf-8"); ?>
        <!DOCTYPE html>
        <html lang="en">

        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></title>
            <style>
                body {
                    background: #f2f2f2;
                    font-family: Arial, sans-serif;
                    padding: 0 20px 20px;
                    color: #333
                }

                .header {
                    text-align: center;
                    margin: 0 0 30px
                }

                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: #fff;
                    border-radius: 4px;
                    padding: 20px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, .1)
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px
                }

                th,
                td {
                    padding: 12px;
                    border-bottom: 1px solid #ddd;
                    text-align: left
                }

                th {
                    background: #007BFF;
                    color: #fff
                }

                .pagination {
                    text-align: center;
                    margin-top: 20px
                }

                .pagination a,
                .pagination span {
                    margin: 0 5px;
                    padding: 8px 12px;
                    background: #007BFF;
                    color: #fff;
                    border-radius: 4px;
                    text-decoration: none
                }

                .pagination span.current {
                    background: #0056b3
                }

                .shared-gallery-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                    padding: 10px 0
                }

                .shared-gallery-card {
                    border: 1px solid #ccc;
                    padding: 5px;
                    text-align: center
                }

                .shared-gallery-card img {
                    max-width: 100%;
                    display: block;
                    margin: 0 auto
                }

                .upload-container {
                    margin-top: 30px;
                    text-align: center
                }

                .upload-container h3 {
                    font-size: 1.4rem;
                    margin-bottom: 10px
                }

                .upload-container form {
                    display: inline-block;
                    margin-top: 10px
                }

                .upload-container button {
                    background-color: #28a745;
                    border: none;
                    color: #fff;
                    padding: 10px 20px;
                    font-size: 1rem;
                    border-radius: 4px;
                    cursor: pointer
                }

                .upload-container button:hover {
                    background-color: #218838
                }

                .footer {
                    text-align: center;
                    margin-top: 40px;
                    font-size: .9rem;
                    color: #777
                }

                .toggle-btn {
                    background-color: #007BFF;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    font-size: 1rem;
                    cursor: pointer
                }

                .toggle-btn:hover {
                    background-color: #0056b3
                }

                .pagination a:hover {
                    background-color: #0056b3
                }

                .pagination span {
                    cursor: default
                }
            </style>
        </head>

        <body>
            <div class="header">
                <h1>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></h1>
            </div>
            <div class="container">
                <button id="toggleBtn" class="toggle-btn">Switch to Gallery View</button>
                <div id="listViewContainer">
                    <?php if (empty($files)): ?>
                        <p style="text-align:center;">This folder is empty.</p>
                    <?php else: ?>
                        <table>
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($files as $file):
                                    $safeName   = htmlspecialchars($file, ENT_QUOTES, 'UTF-8');
                                    $sizeString = "Unknown";
                                    if (array_key_exists($file, $fileSizes)) {
                                        $sizeString = self::formatBytes((int)$fileSizes[$file]);
                                    }
                                    $downloadLink = fr_with_base_path("/api/folder/downloadSharedFile.php?token=" . urlencode($token) . "&file=" . urlencode($file));
                                ?>
                                    <tr>
                                        <td><a href="<?php echo htmlspecialchars($downloadLink, ENT_QUOTES, 'UTF-8'); ?>"><?php echo $safeName; ?> <span class="download-icon">&#x21E9;</span></a></td>
                                        <td><?php echo $sizeString; ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>
                <div id="galleryViewContainer" style="display:none;"></div>
                <div class="pagination">
                    <?php if ($currentPage > 1): ?>
                        <a href="<?php echo htmlspecialchars(fr_with_base_path('/api/folder/shareFolder.php'), ENT_QUOTES, 'UTF-8'); ?>?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage - 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Prev</a>
                    <?php else: ?><span>Prev</span><?php endif; ?>
                    <?php $startPage = max(1, $currentPage - 2);
                    $endPage = min($totalPages, $currentPage + 2);
                    for ($i = $startPage; $i <= $endPage; $i++): ?>
                        <?php if ($i == $currentPage): ?><span class="current"><?php echo $i; ?></span>
                        <?php else: ?><a href="<?php echo htmlspecialchars(fr_with_base_path('/api/folder/shareFolder.php'), ENT_QUOTES, 'UTF-8'); ?>?token=<?php echo urlencode($token); ?>&page=<?php echo $i; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>"><?php echo $i; ?></a>
                    <?php endif;
                    endfor; ?>
                    <?php if ($currentPage < $totalPages): ?>
                        <a href="<?php echo htmlspecialchars(fr_with_base_path('/api/folder/shareFolder.php'), ENT_QUOTES, 'UTF-8'); ?>?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage + 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Next</a>
                    <?php else: ?><span>Next</span><?php endif; ?>
                </div>

                <?php if (isset($data['record']['allowUpload']) && (int)$data['record']['allowUpload'] === 1): ?>
                    <div class="upload-container">
                        <h3>Upload File <?php if ($sharedMaxUploadSize !== null): ?>(<?php echo self::formatBytes($sharedMaxUploadSize); ?> max size)<?php endif; ?></h3>
                        <form action="<?php echo htmlspecialchars(fr_with_base_path('/api/folder/uploadToSharedFolder.php'), ENT_QUOTES, 'UTF-8'); ?>" method="post" enctype="multipart/form-data">
                            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
                            <input type="file" name="fileToUpload" required><br><br><button type="submit">Upload</button>
                        </form>
                    </div>
                <?php endif; ?>
            </div>
            <div class="footer">&copy; <?php echo date("Y"); ?> FileRise. All rights reserved.</div>
            <script type="application/json" id="shared-data">
                {
                    "token": <?php echo json_encode($token, JSON_HEX_TAG); ?>,
                    "files": <?php echo json_encode($files, JSON_HEX_TAG); ?>
                }
            </script>
            <script src="<?php echo htmlspecialchars(fr_with_base_path('/js/sharedFolderView.js'), ENT_QUOTES, 'UTF-8'); ?>" defer></script>
        </body>

        </html>
<?php
        exit;
    }

    /* -------------------- API: Create Share Folder Link -------------------- */
    public function createShareFolderLink(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        self::requireCsrf();
        self::requireNotReadOnly();

        $in = json_decode(file_get_contents("php://input"), true);
        if (!$in || !isset($in['folder'])) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input."]);
            exit;
        }

        $folder      = trim((string)$in['folder']);
        $value       = isset($in['expirationValue']) ? intval($in['expirationValue']) : 60;
        $unit        = $in['expirationUnit'] ?? 'minutes';
        $password    = (string)($in['password'] ?? '');
        $allowUpload = intval($in['allowUpload'] ?? 0);

        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();
        $isAdmin  = self::isAdmin($perms);

        // Must have share on this folder OR be ancestor owner
        if (!(ACL::canShare($username, $perms, $folder) || self::ownsFolderOrAncestor($folder, $username, $perms))) {
            http_response_code(403);
            echo json_encode(["error" => "Sharing is not permitted for your account."]);
            exit;
        }

        // Folder-scope: need share capability within scope
        if ($msg = self::enforceFolderScope($folder, $username, $perms, 'share')) {
            http_response_code(403);
            echo json_encode(["error" => $msg]);
            exit;
        }

        // Ownership requirement unless bypassed (allow ancestor owners)
        if (!self::canBypassOwnership($perms) && !self::ownsFolderOrAncestor($folder, $username, $perms)) {
            http_response_code(403);
            echo json_encode(["error" => "Forbidden: you are not the owner of this folder."]);
            exit;
        }

        try {
            if (FolderCrypto::isEncryptedOrAncestor($folder)) {
                http_response_code(403);
                echo json_encode(["error" => "Sharing is disabled inside encrypted folders."]);
                exit;
            }
        } catch (\Throwable $e) { /* ignore */ }

        if ($allowUpload === 1 && !empty($perms['disableUpload']) && !$isAdmin) {
            http_response_code(403);
            echo json_encode(["error" => "You cannot enable uploads on shared folders."]);
            exit;
        }

        if ($value < 1) $value = 1;
        switch ($unit) {
            case 'seconds':
                $seconds = $value;
                break;
            case 'hours':
                $seconds = $value * 3600;
                break;
            case 'days':
                $seconds = $value * 86400;
                break;
            case 'minutes':
            default:
                $seconds = $value * 60;
                break;
        }
        $seconds = min($seconds, 31536000);

        $res = FolderModel::createShareFolderLink($folder, $seconds, $password, $allowUpload);
        if (is_array($res) && !empty($res['token'])) {
            AuditHook::log('share.link.create', [
                'user'   => $username,
                'folder' => $folder,
                'path'   => $folder,
                'meta'   => [
                    'token' => $res['token'],
                ],
            ]);
        }
        echo json_encode($res);
        exit;
    }

    /* -------------------- API: Upload to Shared Folder -------------------- */
    public function uploadToSharedFolder(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Method not allowed."]);
            exit;
        }

        if (empty($_POST['token'])) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Missing share token."]);
            exit;
        }
        $token = trim((string)$_POST['token']);

        if (!isset($_FILES['fileToUpload'])) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "No file was uploaded."]);
            exit;
        }
        $fileUpload = $_FILES['fileToUpload'];

        if (!empty($fileUpload['error']) && $fileUpload['error'] !== UPLOAD_ERR_OK) {
            $map = [
                UPLOAD_ERR_INI_SIZE   => 'The uploaded file exceeds the upload_max_filesize directive.',
                UPLOAD_ERR_FORM_SIZE  => 'The uploaded file exceeds the MAX_FILE_SIZE directive.',
                UPLOAD_ERR_PARTIAL    => 'The uploaded file was only partially uploaded.',
                UPLOAD_ERR_NO_FILE    => 'No file was uploaded.',
                UPLOAD_ERR_NO_TMP_DIR => 'Missing a temporary folder.',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
                UPLOAD_ERR_EXTENSION  => 'A PHP extension stopped the file upload.'
            ];
            $msg = $map[$fileUpload['error']] ?? 'Upload error.';
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => $msg]);
            exit;
        }

        // Basic sanity: must be an uploaded tmp file
        $tmp = (string)($fileUpload['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Invalid upload.']);
            exit;
        }

        // Validate & normalize filename
        $origName = (string)($fileUpload['name'] ?? '');
        $basename = basename($origName);

        if (!defined('REGEX_FILE_NAME') || !preg_match(REGEX_FILE_NAME, $basename)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }

        // Block SVG/SVGZ uploads to shared folders (prevents stored XSS via public share endpoints)
        $ext = strtolower(pathinfo($basename, PATHINFO_EXTENSION));

        $detectedMime = '';
        if (function_exists('finfo_open')) {
            $fi = @finfo_open(FILEINFO_MIME_TYPE);
            if ($fi) {
                $detectedMime = (string)@finfo_file($fi, $tmp);
                @finfo_close($fi);
            }
        }

        $looksLikeSvg = false;
        if ($ext === 'svg' || $ext === 'svgz') {
            $looksLikeSvg = true;
        } elseif ($detectedMime === 'image/svg+xml') {
            $looksLikeSvg = true;
        } else {
            // Lightweight content sniff: check first chunk for "<svg"
            $chunk = @file_get_contents($tmp, false, null, 0, 4096);
            if (is_string($chunk) && stripos($chunk, '<svg') !== false) {
                $looksLikeSvg = true;
            }
        }

        if ($looksLikeSvg) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Upload blocked: SVG files are not allowed in shared folders."]);
            exit;
        }

        $tmp = (string)($fileUpload['tmp_name'] ?? '');
        $mime = function_exists('mime_content_type') ? (string)@mime_content_type($tmp) : '';

        if ($mime === 'image/svg+xml') {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Upload blocked: SVG files are not allowed in shared folders.']);
            exit;
        }

        // ultra-light sniff as fallback
        $head = @file_get_contents($tmp, false, null, 0, 4096);
        if (is_string($head) && stripos($head, '<svg') !== false) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Upload blocked: SVG files are not allowed in shared folders.']);
            exit;
        }

        // ---- ClamAV: reuse UploadModel scan logic on the tmp file ----
        $scan = UploadModel::scanSingleUploadIfEnabled($fileUpload);
        if (is_array($scan) && isset($scan['error'])) {
            // scanSingleUploadIfEnabled() already deletes the tmp file on infection
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($scan); // e.g. ["error" => "Upload blocked: virus detected in file."]
            exit;
        }
        // --------------------------------------------------------------

        $result = FolderModel::uploadToSharedFolder($token, $fileUpload);
        if (isset($result['error'])) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($result);
            exit;
        }

        $folderKey = (string)($result['folder'] ?? 'root');
        $newFilename = (string)($result['newFilename'] ?? '');
        if ($newFilename !== '') {
            AuditHook::log('file.upload', [
                'user'   => 'share:' . $token,
                'source' => 'share',
                'folder' => $folderKey !== '' ? $folderKey : 'root',
                'path'   => ($folderKey !== '' && $folderKey !== 'root') ? ($folderKey . '/' . $newFilename) : $newFilename,
                'meta'   => [
                    'token' => $token,
                ],
            ]);
        }

        $_SESSION['upload_message'] = "File uploaded successfully.";
        $redirectUrl = fr_with_base_path("/api/folder/shareFolder.php?token=" . urlencode($token));
        header("Location: " . $redirectUrl);
        exit;
    }



    /* -------------------- Admin: List/Delete Share Folder Links -------------------- */
    public function getAllShareFolderLinks(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        self::requireAdmin(); // exposing all share folder links is an admin operation

        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $shareFile = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'share_folder_links.json';
        $links     = file_exists($shareFile) ? json_decode(file_get_contents($shareFile), true) ?? [] : [];
        $now       = time();
        $cleaned   = [];

        foreach ($links as $token => $record) {
            if (!empty($record['expires']) && $record['expires'] < $now) continue;
            $cleaned[$token] = $record;
        }

        if (count($cleaned) !== count($links)) {
            file_put_contents($shareFile, json_encode($cleaned, JSON_PRETTY_PRINT));
        }

        echo json_encode($cleaned);
    }

    public function deleteShareFolderLink()
    {
        header('Content-Type: application/json');
        self::requireAuth();
        self::requireAdmin();
        self::requireCsrf();

        $token = $_POST['token'] ?? '';
        if (!$token) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No token provided']);
            return;
        }
        $sourceId = $this->normalizeSourceId($_POST['sourceId'] ?? '');
        if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $info = SourceContext::getSourceById($sourceId);
            if (!$info) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid source id']);
                return;
            }
            $deleted = $this->withSourceContext($sourceId, function () use ($token) {
                return FolderModel::deleteShareFolderLink($token);
            }, true);
        } else {
            $deleted = FolderModel::deleteShareFolderLink($token);
        }
        if ($deleted) {
            AuditHook::log('share.link.delete', [
                'user' => $_SESSION['username'] ?? 'Unknown',
                'meta' => [
                    'token' => $token,
                ],
            ]);
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Not found']);
        }
    }

    public function getFolderColors(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        self::requireAuth();

        $user  = $_SESSION['username'] ?? '';
        $perms = $this->loadPerms($user);

        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }

        $map = FolderMeta::getMap();
        $out = [];
        foreach ($map as $folder => $hex) {
            $folder = FolderMeta::normalizeFolder((string)$folder);
            if ($folder === 'root') continue; // don’t bother exposing root
            if (ACL::canRead($user, $perms, $folder) || ACL::canReadOwn($user, $perms, $folder)) {
                $out[$folder] = $hex;
            }
        }
        echo json_encode($out, JSON_UNESCAPED_SLASHES);
    }

    public function saveFolderColor(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        self::requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            return;
        }

        // CSRF
        $hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $tok = $_SESSION['csrf_token'] ?? '';
        if (!$hdr || !$tok || !hash_equals((string)$tok, (string)$hdr)) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid CSRF token']);
            return;
        }

        $user  = $_SESSION['username'] ?? '';
        $perms = $this->loadPerms($user);

        $body   = json_decode(file_get_contents('php://input') ?: "{}", true) ?: [];
        $folder = FolderMeta::normalizeFolder((string)($body['folder'] ?? 'root'));
        $raw    = array_key_exists('color', $body) ? (string)$body['color'] : '';

        if ($folder === 'root') {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot set color on root']);
            return;
        }

        // >>> Require canEdit (not canRename) <<<
        if (!ACL::canEdit($user, $perms, $folder) && !ACL::isAdmin($perms)) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        try {
            // empty string clears; non-empty must be valid #RGB or #RRGGBB
            $hex = ($raw === '') ? null : FolderMeta::normalizeHex($raw);
            $res = FolderMeta::setColor($folder, $hex);
            echo json_encode(['success' => true] + $res, JSON_UNESCAPED_SLASHES);
        } catch (\InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid color']);
        }
    }

    /* -------------------- API: Move Folder -------------------- */
    public function moveFolder(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        self::requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            return;
        }
        // CSRF: accept header or form field
        $hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $tok = $_SESSION['csrf_token'] ?? '';
        if (!$hdr || !$tok || !hash_equals((string)$tok, (string)$hdr)) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid CSRF token']);
            return;
        }

        $raw = file_get_contents('php://input');
        $input = json_decode($raw ?: "{}", true);
        $source = trim((string)($input['source'] ?? ''));
        $destination = trim((string)($input['destination'] ?? ''));
        $mode = strtolower(trim((string)($input['mode'] ?? 'move')));
        if ($mode !== 'move' && $mode !== 'copy') {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid mode']);
            return;
        }

        $rawSourceId = $input['sourceId'] ?? '';
        $rawDestId = $input['destSourceId'] ?? '';
        $sourceId = (class_exists('SourceContext') && SourceContext::sourcesEnabled())
            ? $this->normalizeSourceId($rawSourceId !== '' ? $rawSourceId : SourceContext::getActiveId())
            : '';
        $destSourceId = (class_exists('SourceContext') && SourceContext::sourcesEnabled())
            ? $this->normalizeSourceId($rawDestId !== '' ? $rawDestId : $sourceId)
            : '';
        if (($rawSourceId !== '' && $sourceId === '') || ($rawDestId !== '' && $destSourceId === '')) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid source id.']);
            return;
        }
        $crossSource = ($sourceId !== '' && $destSourceId !== '' && $sourceId !== $destSourceId);

        if ($source === '' || strcasecmp($source, 'root') === 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid source folder']);
            return;
        }
        if ($destination === '') $destination = 'root';

        // basic segment validation
        foreach ([$source, $destination] as $f) {
            if ($f === 'root') continue;
            $parts = array_filter(explode('/', trim($f, "/\\ ")), fn($p) => $p !== '');
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid folder segment']);
                    return;
                }
            }
        }

        $srcNorm = trim($source, "/\\ ");
        $dstNorm = $destination === 'root' ? '' : trim($destination, "/\\ ");

        // prevent move/copy into self/descendant (same source only)
        if (!$crossSource && $dstNorm !== '' && (strcasecmp($dstNorm, $srcNorm) === 0 || strpos($dstNorm . '/', $srcNorm . '/') === 0)) {
            http_response_code(400);
            echo json_encode(['error' => 'Destination cannot be the source or its descendant']);
            return;
        }

        $username = $_SESSION['username'] ?? '';
        $perms = $this->loadPerms($username);
        $isAdmin = self::isAdmin($perms);

        if ($mode === 'copy' || $crossSource) {
            $allowDisabled = $isAdmin;
            if ($sourceId !== '' && $destSourceId !== '') {
                $sourceInfo = SourceContext::getSourceById($sourceId);
                $destInfo = SourceContext::getSourceById($destSourceId);
                if (!$sourceInfo || !$destInfo) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid source.']);
                    return;
                }
                if (!$isAdmin && (empty($sourceInfo['enabled']) || empty($destInfo['enabled']))) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Source is disabled.']);
                    return;
                }
                if (!empty($destInfo['readOnly'])) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Destination source is read-only.']);
                    return;
                }
            } elseif (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                http_response_code(403);
                echo json_encode(['error' => 'Source is read-only.']);
                return;
            }

            if (!empty($perms['readOnly'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Account is read-only.']);
                return;
            }
            if (!empty($perms['disableUpload'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Uploads are disabled for your account.']);
                return;
            }

            $srcErr = $this->withSourceContext($sourceId, function () use ($username, $perms, $source) {
                $canManageSource = ACL::canManage($username, $perms, $source) || ACL::isOwner($username, $perms, $source);
                if (!$canManageSource) {
                    return 'Forbidden: manage rights required on source';
                }
                $sv = self::enforceFolderScope($source, $username, $perms, 'manage');
                if ($sv) {
                    return $sv;
                }
                return null;
            }, $allowDisabled);
            if ($srcErr) {
                http_response_code(403);
                echo json_encode(['error' => $srcErr]);
                return;
            }

            $dstCtx = ($destSourceId !== '' ? $destSourceId : $sourceId);
            $dstErr = $this->withSourceContext($dstCtx, function () use ($username, $perms, $destination) {
                $canCreate = ACL::canCreate($username, $perms, $destination)
                    || FolderController::ownsFolderOrAncestor($destination, $username, $perms);
                if (!$canCreate) {
                    return 'Forbidden: no write access to destination';
                }
                $dv = self::enforceFolderScope($destination, $username, $perms, 'create');
                if ($dv) {
                    return $dv;
                }
                return null;
            }, $allowDisabled);
            if ($dstErr) {
                http_response_code(403);
                echo json_encode(['error' => $dstErr]);
                return;
            }

            if ($crossSource) {
                $encErr = $this->crossSourceEncryptedError($sourceId, $source, $destSourceId, $destination);
                if ($encErr) {
                    http_response_code(400);
                    echo json_encode(['error' => $encErr]);
                    return;
                }
            }

            $baseName = basename(str_replace('\\', '/', $srcNorm));
            $target   = $destination === 'root' ? $baseName : rtrim($destination, "/\\ ") . '/' . $baseName;

            if ($crossSource) {
                $result = ($mode === 'move')
                    ? FolderModel::moveFolderAcrossSources($sourceId, $destSourceId, $source, $target)
                    : FolderModel::copyFolderAcrossSources($sourceId, $destSourceId, $source, $target);
            } else {
                $result = $this->withSourceContext($sourceId, function () use ($source, $target) {
                    return FolderModel::copyFolderSameSource($source, $target);
                }, $allowDisabled);
            }

            if (is_array($result) && (!isset($result['success']) || $result['success'])) {
                $event = ($mode === 'move') ? 'folder.move' : 'folder.copy';
                AuditHook::log($event, [
                    'user'   => $username,
                    'folder' => $target,
                    'from'   => $source,
                    'to'     => $target,
                ]);
            }

            echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }

        if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            SourceContext::setActiveId($sourceId, false, $isAdmin);
        }

        // enforce scopes (source manage-ish, dest write-ish)
        if ($msg = self::enforceFolderScope($source, $username, $perms, 'manage')) {
            http_response_code(403);
            echo json_encode(['error' => $msg]);
            return;
        }
        if ($msg = self::enforceFolderScope($destination, $username, $perms, 'write')) {
            http_response_code(403);
            echo json_encode(['error' => $msg]);
            return;
        }

        // Check capabilities using ACL helpers
        $canManageSource = ACL::canManage($username, $perms, $source) || ACL::isOwner($username, $perms, $source);
        $canMoveIntoDest = ACL::canMove($username, $perms, $destination) || ($destination === 'root' ? self::isAdmin($perms) : ACL::isOwner($username, $perms, $destination));
        if (!$canManageSource) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: manage rights required on source']);
            return;
        }
        if (!$canMoveIntoDest) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: move rights required on destination']);
            return;
        }

        // Non-admin: enforce same owner between source and destination tree (if any)
        $isAdmin = self::isAdmin($perms);
        if (!$isAdmin) {
            try {
                $ownerSrc = FolderModel::getOwnerFor($source) ?? '';
                $ownerDst = $destination === 'root' ? '' : (FolderModel::getOwnerFor($destination) ?? '');
                if ($ownerSrc !== $ownerDst) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Source and destination must have the same owner']);
                    return;
                }
            } catch (\Throwable $e) { /* ignore – fall through */
            }
        }

        // Compute final target "destination/basename(source)"
        $baseName = basename(str_replace('\\', '/', $srcNorm));
        $target   = $destination === 'root' ? $baseName : rtrim($destination, "/\\ ") . '/' . $baseName;

        try {
            $result = FolderModel::renameFolder($source, $target);

            $result = FolderModel::renameFolder($source, $target);

            if (is_array($result) && (!isset($result['success']) || $result['success'])) {
                AuditHook::log('folder.move', [
                    'user'   => $username,
                    'folder' => $target,
                    'from'   => $source,
                    'to'     => $target,
                ]);
            }

            // migrate ACL subtree (best-effort; never block the move)
            $aclStats = [];
            try {
                $aclStats = ACL::migrateSubtree($source, $target);
            } catch (\Throwable $e) {
                error_log('moveFolder ACL-migration warning: ' . $e->getMessage());
            }

            // If you already added color migration, just append this too:
            $resultArr = is_array($result) ? $result : ['success' => true, 'target' => $target];
            $resultArr['aclMigration'] = $aclStats + ['changed' => false, 'moved' => 0];

            echo json_encode($resultArr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            // If the move succeeded, migrate folder color mappings server-side
            $colorStats = [];
            if (is_array($result) && (!isset($result['success']) || $result['success'])) {
                try {
                    $colorStats = self::migrateFolderColors($source, $target);
                } catch (\Throwable $e) {
                    error_log('moveFolder color-migration warning: ' . $e->getMessage());
                }
            }

            // merge stats into response (non-breaking)
            if (is_array($result)) {
                $result['colorMigration'] = $colorStats + ['changed' => false, 'moved' => 0];
                echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            } else {
                echo json_encode(['success' => true, 'target' => $target, 'colorMigration' => $colorStats + ['changed' => false, 'moved' => 0]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
        } catch (\Throwable $e) {
            error_log('moveFolder error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Internal error moving folder']);
        }
    }

    /* -------------------- API: Folder encryption jobs (v2) -------------------- */
    public function encryptionPlan(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        self::requireAuth();

        $folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
        $folder = str_replace('\\', '/', trim($folder));
        $folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

        $mode = isset($_GET['mode']) ? strtolower(trim((string)$_GET['mode'])) : 'encrypt';
        if ($mode !== 'encrypt' && $mode !== 'decrypt') {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid mode.']);
            return;
        }

        // Validate folder path segments
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder name.']);
            return;
        }

        $username = (string)($_SESSION['username'] ?? '');
        if ($username === '') {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        // Permission gate via capabilities (keeps rules centralized)
        $caps = self::capabilities($folder, $username);
        $encCaps = (is_array($caps) && isset($caps['encryption']) && is_array($caps['encryption'])) ? $caps['encryption'] : [];
        if ($mode === 'encrypt' && empty($encCaps['canEncrypt'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: cannot encrypt this folder.']);
            return;
        }
        if ($mode === 'decrypt' && empty($encCaps['canDecrypt'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: cannot decrypt this folder.']);
            return;
        }

        // Plan scan does not require master key (it only counts), but v2 is useless without it.
        if (!CryptoAtRest::isAvailable()) {
            http_response_code(500);
            echo json_encode(['error' => 'Encryption at rest is not supported on this server (libsodium secretstream missing).']);
            return;
        }
        if (!CryptoAtRest::masterKeyIsConfigured()) {
            http_response_code(409);
            echo json_encode(['error' => 'Encryption master key is not configured (Admin → Encryption at rest, or FR_ENCRYPTION_MASTER_KEY).']);
            return;
        }

        $resolved = self::cryptoResolveUploadDir($folder);
        if (isset($resolved['error'])) {
            http_response_code((int)($resolved['status'] ?? 400));
            echo json_encode(['error' => $resolved['error']]);
            return;
        }

        $dir = (string)$resolved['dir'];
        $tot = self::cryptoPlanScan($dir);

        echo json_encode([
            'ok' => true,
            'folder' => $folder,
            'mode' => $mode,
            'totalFiles' => $tot['files'],
            'totalBytes' => $tot['bytes'],
            'truncated' => $tot['truncated'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public function encryptionJobStart(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        self::requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            return;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $raw = file_get_contents('php://input') ?: '';
        $in = json_decode($raw, true);
        if (!is_array($in)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid input.']);
            return;
        }

        $folder = isset($in['folder']) ? (string)$in['folder'] : 'root';
        $folder = str_replace('\\', '/', trim($folder));
        $folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

        $mode = isset($in['mode']) ? strtolower(trim((string)$in['mode'])) : 'encrypt';
        if ($mode !== 'encrypt' && $mode !== 'decrypt') {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid mode.']);
            return;
        }

        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder name.']);
            return;
        }

        $username = (string)($_SESSION['username'] ?? '');
        if ($username === '') {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!CryptoAtRest::isAvailable()) {
            http_response_code(500);
            echo json_encode(['error' => 'Encryption at rest is not supported on this server (libsodium secretstream missing).']);
            return;
        }
        if (!CryptoAtRest::masterKeyIsConfigured()) {
            http_response_code(409);
            echo json_encode(['error' => 'Encryption master key is not configured (Admin → Encryption at rest, or FR_ENCRYPTION_MASTER_KEY).']);
            return;
        }

        // Permission gate via capabilities (keeps rules centralized)
        $caps = self::capabilities($folder, $username);
        $encCaps = (is_array($caps) && isset($caps['encryption']) && is_array($caps['encryption'])) ? $caps['encryption'] : [];
        if ($mode === 'encrypt' && empty($encCaps['canEncrypt'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: cannot encrypt this folder.']);
            return;
        }
        if ($mode === 'decrypt' && empty($encCaps['canDecrypt'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: cannot decrypt this folder.']);
            return;
        }

        // Prevent concurrent jobs on this folder or ancestors.
        $existingJob = FolderCrypto::getJobStatus($folder);
        if (!empty($existingJob['active']) && !empty($existingJob['job']) && is_array($existingJob['job'])) {
            http_response_code(409);
            echo json_encode([
                'error' => 'A folder encryption job is already running.',
                'job' => [
                    'id' => $existingJob['job']['id'] ?? null,
                    'type' => $existingJob['job']['type'] ?? null,
                    'state' => $existingJob['job']['state'] ?? null,
                    'root' => $existingJob['root'] ?? null,
                ],
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }

        $resolved = self::cryptoResolveUploadDir($folder);
        if (isset($resolved['error'])) {
            http_response_code((int)($resolved['status'] ?? 400));
            echo json_encode(['error' => $resolved['error']]);
            return;
        }
        $dir = (string)$resolved['dir'];

        // v2 behavior: encryption is enabled immediately so new uploads are encrypted.
        // Decryption keeps the folder encrypted until completion (job will clear it at the end).
        if ($mode === 'encrypt') {
            $res = FolderCrypto::setEncrypted($folder, true, $username);
            if (empty($res['ok'])) {
                http_response_code(500);
                echo json_encode(['error' => $res['error'] ?? 'Failed to enable encryption for this folder.']);
                return;
            }
        }

        $totalFiles = isset($in['totalFiles']) ? (int)$in['totalFiles'] : 0;
        $totalBytes = isset($in['totalBytes']) ? (int)$in['totalBytes'] : 0;
        if ($totalFiles < 0) $totalFiles = 0;
        if ($totalBytes < 0) $totalBytes = 0;

        $jobId = bin2hex(random_bytes(16));
        $job = [
            'v' => 1,
            'id' => $jobId,
            'type' => $mode,
            'folder' => $folder,
            'startedBy' => $username,
            'createdAt' => time(),
            'updatedAt' => time(),
            'state' => 'running',
            'error' => null,
            'totalFiles' => $totalFiles,
            'totalBytes' => $totalBytes,
            'doneFiles' => 0,
            'doneBytes' => 0,
            // directory-walk state (relative to $dir)
            'queue' => [''], // '' means root dir
            'currentDir' => null,
            'currentOffset' => 0,
        ];

        self::cryptoEnsureJobsDir();
        $path = self::cryptoJobPath($jobId);
        $ok = @file_put_contents($path, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        if ($ok === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create encryption job.']);
            return;
        }
        @chmod($path, 0664);

        // Record job marker in folder metadata so the UI can reconnect after refresh.
        try {
            FolderCrypto::setJob($folder, [
                'id' => $jobId,
                'type' => $mode,
                'state' => 'running',
                'startedAt' => time(),
            ], $username);
        } catch (\Throwable $e) {
            // best-effort; job can still run via jobId
            error_log('Failed to record crypto job marker: ' . $e->getMessage());
        }

        echo json_encode([
            'ok' => true,
            'jobId' => $jobId,
            'folder' => $folder,
            'mode' => $mode,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public function encryptionJobStatus(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        self::requireAuth();

        $jobId = isset($_GET['jobId']) ? trim((string)$_GET['jobId']) : '';
        if (!preg_match('/^[a-f0-9]{16,64}$/i', $jobId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid job id.']);
            return;
        }

        $path = self::cryptoJobPath($jobId);
        if (!is_file($path)) {
            http_response_code(404);
            echo json_encode(['error' => 'Job not found.']);
            return;
        }

        $raw = @file_get_contents($path);
        $job = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($job)) {
            http_response_code(500);
            echo json_encode(['error' => 'Corrupt job state.']);
            return;
        }

        // Basic authz: only the user who started the job (or admins) can view it.
        $username = (string)($_SESSION['username'] ?? '');
        if ($username === '') {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
        $perms = self::getPerms();
        $isAdmin = self::isAdmin($perms);
        $startedBy = (string)($job['startedBy'] ?? '');
        if (!$isAdmin && $startedBy !== '' && strcasecmp($startedBy, $username) !== 0) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden.']);
            return;
        }

        if (($job['state'] ?? '') === 'error') {
            $updatedAt = (int)($job['updatedAt'] ?? 0);
            if ($updatedAt <= 0) {
                $updatedAt = (int)($job['createdAt'] ?? 0);
            }
            if ($updatedAt <= 0) {
                $updatedAt = (int)@filemtime($path);
            }
            if ($updatedAt > 0 && (time() - $updatedAt) >= (7 * 24 * 60 * 60)) {
                self::cryptoDeleteJobFiles($jobId);
                http_response_code(404);
                echo json_encode(['error' => 'Job not found.']);
                return;
            }
        }

        // Return a redacted snapshot (don’t expose queue paths to clients)
        echo json_encode([
            'ok' => true,
            'job' => [
                'id' => $job['id'] ?? $jobId,
                'type' => $job['type'] ?? null,
                'folder' => $job['folder'] ?? null,
                'state' => $job['state'] ?? null,
                'error' => $job['error'] ?? null,
                'createdAt' => $job['createdAt'] ?? null,
                'updatedAt' => $job['updatedAt'] ?? null,
                'totalFiles' => $job['totalFiles'] ?? 0,
                'totalBytes' => $job['totalBytes'] ?? 0,
                'doneFiles' => $job['doneFiles'] ?? 0,
                'doneBytes' => $job['doneBytes'] ?? 0,
            ],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public function encryptionJobTick(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        self::requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            return;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $raw = file_get_contents('php://input') ?: '';
        $in = json_decode($raw, true);
        if (!is_array($in)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid input.']);
            return;
        }

        $jobId = isset($in['jobId']) ? trim((string)$in['jobId']) : '';
        if (!preg_match('/^[a-f0-9]{16,64}$/i', $jobId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid job id.']);
            return;
        }

        $maxFiles = isset($in['maxFiles']) ? (int)$in['maxFiles'] : 2;
        if ($maxFiles < 1) $maxFiles = 1;
        if ($maxFiles > 10) $maxFiles = 10;

        $path = self::cryptoJobPath($jobId);
        if (!is_file($path)) {
            http_response_code(404);
            echo json_encode(['error' => 'Job not found.']);
            return;
        }

        // Serialize tick processing per job to avoid overlapping conversion runs.
        $lockPath = self::cryptoJobLockPath($jobId);
        $lock = @fopen($lockPath, 'c');
        if ($lock === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to open job lock.']);
            return;
        }
        if (!@flock($lock, LOCK_EX)) {
            @fclose($lock);
            http_response_code(500);
            echo json_encode(['error' => 'Failed to lock job.']);
            return;
        }

        $cleanupJobFiles = false;
        try {
            $rawJob = @file_get_contents($path);
            $job = is_string($rawJob) ? json_decode($rawJob, true) : null;
            if (!is_array($job)) {
                http_response_code(500);
                echo json_encode(['error' => 'Corrupt job state.']);
                return;
            }

            $username = (string)($_SESSION['username'] ?? '');
            $perms = self::getPerms();
            $isAdmin = self::isAdmin($perms);
            $startedBy = (string)($job['startedBy'] ?? '');
            if (!$isAdmin && $startedBy !== '' && strcasecmp($startedBy, $username) !== 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden.']);
                return;
            }

            $state = (string)($job['state'] ?? '');
            if ($state !== 'running') {
                echo json_encode(['ok' => true, 'job' => $job, 'note' => 'Job is not running.'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }

            $folder = (string)($job['folder'] ?? 'root');
            $mode = (string)($job['type'] ?? 'encrypt');
            if ($mode !== 'encrypt' && $mode !== 'decrypt') {
                $job['state'] = 'error';
                $job['error'] = 'Invalid job type.';
                $job['updatedAt'] = time();
                @file_put_contents($path, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
                echo json_encode(['ok' => false, 'error' => $job['error']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }

            // Permission gate via capabilities (re-check each tick so scope changes don’t keep running)
            $caps = self::capabilities($folder, $username);
            $encCaps = (is_array($caps) && isset($caps['encryption']) && is_array($caps['encryption'])) ? $caps['encryption'] : [];
            if ($mode === 'encrypt' && empty($encCaps['encrypted']) && empty($encCaps['canEncrypt'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden: cannot encrypt this folder.']);
                return;
            }
            if ($mode === 'decrypt') {
                // Note: capabilities intentionally disables canDecrypt during an active job to prevent starting
                // another job, but ticks must still be allowed for the job owner/admin to proceed.
                $canManageForEncryption = $isAdmin
                    || ACL::canManage($username, $perms, $folder)
                    || ACL::isOwner($username, $perms, $folder);
                if ($folder === 'root' && !$isAdmin) $canManageForEncryption = false;

                $st = FolderCrypto::getStatus($folder);
                $rootEncrypted = !empty($st['rootEncrypted']);
                $inherited = !empty($st['inherited']);

                if (!$canManageForEncryption || !$rootEncrypted || $inherited) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Forbidden: cannot decrypt this folder.']);
                    return;
                }
            }

            $resolved = self::cryptoResolveUploadDir($folder);
            if (isset($resolved['error'])) {
                $job['state'] = 'error';
                $job['error'] = $resolved['error'];
                $job['updatedAt'] = time();
                @file_put_contents($path, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
                http_response_code((int)($resolved['status'] ?? 400));
                echo json_encode(['error' => $resolved['error']]);
                return;
            }
            $rootDir = (string)$resolved['dir'];

            $processed = 0;
            $processedBytes = 0;

            while ($processed < $maxFiles) {
                $next = self::cryptoJobNextFile($job, $rootDir);
                if ($next === null) {
                    // done scanning
                    $job['state'] = 'done';
                    break;
                }

                $filePath = $next['path'];
                $fileSize = $next['size'];
                $processed++;
                $processedBytes += $fileSize;

                $didWork = false;
                try {
                    if ($mode === 'encrypt') {
                        if (!CryptoAtRest::isEncryptedFile($filePath)) {
                            CryptoAtRest::encryptFileInPlace($filePath);
                            $didWork = true;
                        }
                    } else {
                        if (CryptoAtRest::isEncryptedFile($filePath)) {
                            CryptoAtRest::decryptFileInPlace($filePath);
                            $didWork = true;
                        }
                    }
                } catch (\Throwable $e) {
                    $job['state'] = 'error';
                    $job['error'] = $e->getMessage() ?: 'Crypto job failed.';
                    break;
                }

                // Progress always advances by visited file count/bytes (even if we skipped)
                $job['doneFiles'] = (int)($job['doneFiles'] ?? 0) + 1;
                $job['doneBytes'] = (int)($job['doneBytes'] ?? 0) + (int)$fileSize;

                // Best-effort: keep updatedAt reasonably fresh while the job runs
                if ($didWork) {
                    $job['updatedAt'] = time();
                }
            }

            $job['updatedAt'] = time();
            @file_put_contents($path, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

            // Finalization hooks
            if (($job['state'] ?? '') === 'done') {
                if ($mode === 'decrypt') {
                    // v2 behavior: clear folder encryption marker after bulk decrypt finishes
                    try {
                        FolderCrypto::setEncrypted($folder, false, $username);
                    } catch (\Throwable $e) {
                        // don’t fail the job response; folder will remain encrypted
                        error_log('decrypt job finalization failed: ' . $e->getMessage());
                    }
                }
                // Clear job marker
                try {
                    FolderCrypto::setJob($folder, null, $username);
                } catch (\Throwable $e) {
                    error_log('Failed to clear crypto job marker: ' . $e->getMessage());
                }
                $cleanupJobFiles = true;
            } elseif (($job['state'] ?? '') === 'error') {
                // Persist error on folder marker (best-effort)
                try {
                    FolderCrypto::setJob($folder, [
                        'id' => $jobId,
                        'type' => $mode,
                        'state' => 'error',
                        'error' => (string)($job['error'] ?? 'Crypto job failed.'),
                        'startedAt' => (int)($job['createdAt'] ?? time()),
                    ], $username);
                } catch (\Throwable $e) {
                    error_log('Failed to record crypto job error marker: ' . $e->getMessage());
                }
            }

            echo json_encode([
                'ok' => true,
                'job' => [
                    'id' => $job['id'] ?? $jobId,
                    'type' => $job['type'] ?? null,
                    'folder' => $job['folder'] ?? null,
                    'state' => $job['state'] ?? null,
                    'error' => $job['error'] ?? null,
                    'totalFiles' => $job['totalFiles'] ?? 0,
                    'totalBytes' => $job['totalBytes'] ?? 0,
                    'doneFiles' => $job['doneFiles'] ?? 0,
                    'doneBytes' => $job['doneBytes'] ?? 0,
                    'updatedAt' => $job['updatedAt'] ?? null,
                ],
                'tick' => [
                    'processedFiles' => $processed,
                    'processedBytes' => $processedBytes,
                ],
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } finally {
            @flock($lock, LOCK_UN);
            @fclose($lock);
            if ($cleanupJobFiles) {
                self::cryptoDeleteJobFiles($jobId);
            }
        }
    }

    /* -------------------- v2 crypto job helpers -------------------- */
    private static function cryptoJobsDir(): string
    {
        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        return rtrim($metaRoot, "/\\") . DIRECTORY_SEPARATOR . 'crypto_jobs';
    }

    private static function cryptoEnsureJobsDir(): void
    {
        $dir = self::cryptoJobsDir();
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
    }

    private static function cryptoJobPath(string $jobId): string
    {
        $id = strtolower($jobId);
        return self::cryptoJobsDir() . DIRECTORY_SEPARATOR . 'job_' . $id . '.json';
    }

    private static function cryptoJobLockPath(string $jobId): string
    {
        $id = strtolower($jobId);
        return self::cryptoJobsDir() . DIRECTORY_SEPARATOR . 'job_' . $id . '.lock';
    }

    private static function cryptoDeleteJobFiles(string $jobId): void
    {
        $path = self::cryptoJobPath($jobId);
        if (is_file($path)) {
            @unlink($path);
        }
        $lockPath = self::cryptoJobLockPath($jobId);
        if (is_file($lockPath)) {
            @unlink($lockPath);
        }
    }

    private static function cryptoResolveUploadDir(string $folder): array
    {
        $root = class_exists('SourceContext')
            ? SourceContext::uploadRoot()
            : (string)UPLOAD_DIR;
        $base = realpath($root);
        if ($base === false) {
            return ['status' => 500, 'error' => 'Server misconfiguration.'];
        }

        if ($folder === 'root') {
            $dir = $base;
        } else {
            $guess = rtrim($root, "/\\") . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
            $dir = realpath($guess);
        }

        if ($dir === false || !is_dir($dir) || strpos($dir, $base) !== 0) {
            return ['status' => 404, 'error' => 'Folder not found.'];
        }

        return ['dir' => $dir, 'base' => $base];
    }

    /**
     * @return array{files:int,bytes:int,truncated:bool}
     */
    private static function cryptoPlanScan(string $rootDir): array
    {
        $skipDirs = ['trash', 'profile_pics', '@eadir'];
        $files = 0;
        $bytes = 0;
        $truncated = false;

        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($rootDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        $seen = 0;
        foreach ($it as $p => $info) {
            if (++$seen > 250000) { $truncated = true; break; }
            $name = $info->getFilename();
            if ($name === '' || $name[0] === '.') continue;
            $lower = strtolower($name);
            if (in_array($lower, $skipDirs, true)) {
                continue;
            }
            if (str_starts_with($lower, 'resumable_')) {
                continue;
            }
            if ($info->isFile() && !$info->isLink()) {
                $files++;
                $sz = $info->getSize();
                if (is_int($sz) && $sz > 0) $bytes += $sz;
            }
        }

        return ['files' => $files, 'bytes' => $bytes, 'truncated' => $truncated];
    }

    /**
     * Finds the next file path to process for this job and advances its walk state.
     *
     * @return array{path:string,size:int}|null
     */
    private static function cryptoJobNextFile(array &$job, string $rootDir): ?array
    {
        $skipDirs = ['trash', 'profile_pics', '@eadir'];

        if (!isset($job['queue']) || !is_array($job['queue'])) {
            $job['queue'] = [''];
        }

        while (true) {
            $currentDir = $job['currentDir'] ?? null;
            if ($currentDir === null || $currentDir === false) {
                $nextDir = array_shift($job['queue']);
                if ($nextDir === null) {
                    return null;
                }
                $job['currentDir'] = (string)$nextDir;
                $job['currentOffset'] = 0;
                $currentDir = $job['currentDir'];
            }

            $abs = rtrim($rootDir, "/\\");
            if ($currentDir !== '') {
                $abs .= DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, (string)$currentDir);
            }

            if (!is_dir($abs)) {
                // skip missing dirs
                $job['currentDir'] = null;
                $job['currentOffset'] = 0;
                continue;
            }

            $names = @scandir($abs);
            if (!is_array($names)) {
                $job['currentDir'] = null;
                $job['currentOffset'] = 0;
                continue;
            }

            $names = array_values(array_filter($names, fn($n) => $n !== '.' && $n !== '..'));
            sort($names, SORT_STRING);

            $offset = (int)($job['currentOffset'] ?? 0);
            $count = count($names);
            while ($offset < $count) {
                $name = (string)$names[$offset];
                $offset++;
                $job['currentOffset'] = $offset;

                if ($name === '' || $name[0] === '.') continue;
                $lower = strtolower($name);
                if (in_array($lower, $skipDirs, true)) continue;
                if (str_starts_with($lower, 'resumable_')) continue;

                $childAbs = $abs . DIRECTORY_SEPARATOR . $name;
                if (@is_link($childAbs)) {
                    continue; // never follow symlinks
                }

                if (is_dir($childAbs)) {
                    $rel = ($currentDir === '') ? $name : ($currentDir . '/' . $name);
                    $job['queue'][] = $rel;
                    continue;
                }

                if (is_file($childAbs)) {
                    $sz = @filesize($childAbs);
                    if (!is_int($sz) || $sz < 0) $sz = 0;
                    return ['path' => $childAbs, 'size' => $sz];
                }
            }

            // end of directory
            $job['currentDir'] = null;
            $job['currentOffset'] = 0;
        }
    }
}
