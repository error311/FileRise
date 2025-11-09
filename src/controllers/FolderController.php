<?php
// src/controllers/FolderController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

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

    /** Stats for a folder (currently: empty/non-empty via folders/files counts). */
    public static function stats(string $folder, string $user, array $perms): array
    {
        // Normalize inside model; this is a thin action
        return FolderModel::countVisible($folder, $user, $perms);
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
        } catch (\Throwable $e) { /* ignore */ }
        return [];
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
        case 'manage':      $ok = ACL::canManage($username, $perms, $folder);      break;

        // legacy:
        case 'write':       $ok = ACL::canWrite($username, $perms, $folder);       break;
        case 'share':       $ok = ACL::canShare($username, $perms, $folder);       break;

        // read flavors:
        case 'read_own':    $ok = ACL::canReadOwn($username, $perms, $folder);     break;
        case 'read':        $ok = ACL::canRead($username, $perms, $folder);        break;

        // granular write-ish:
        case 'create':      $ok = ACL::canCreate($username, $perms, $folder);      break;
        case 'upload':      $ok = ACL::canUpload($username, $perms, $folder);      break;
        case 'edit':        $ok = ACL::canEdit($username, $perms, $folder);        break;
        case 'rename':      $ok = ACL::canRename($username, $perms, $folder);      break;
        case 'copy':        $ok = ACL::canCopy($username, $perms, $folder);        break;
        case 'move':        $ok = ACL::canMove($username, $perms, $folder);        break;
        case 'delete':      $ok = ACL::canDelete($username, $perms, $folder);      break;
        case 'extract':     $ok = ACL::canExtract($username, $perms, $folder);     break;

        // granular share (support both key styles)
        case 'shareFile':
        case 'share_file':  $ok = ACL::canShareFile($username, $perms, $folder);   break;
        case 'shareFolder':
        case 'share_folder':$ok = ACL::canShareFolder($username, $perms, $folder); break;

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
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed.']); return; }
    self::requireCsrf();
    self::requireNotReadOnly();

    try {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        if (!isset($input['folderName'])) { http_response_code(400); echo json_encode(['error' => 'Folder name not provided.']); return; }

        $folderName = trim((string)$input['folderName']);
        $parentIn   = isset($input['parent']) ? trim((string)$input['parent']) : 'root';

        if (!preg_match(REGEX_FOLDER_NAME, $folderName)) {
            http_response_code(400); echo json_encode(['error' => 'Invalid folder name.']); return;
        }
        if ($parentIn !== '' && strcasecmp($parentIn, 'root') !== 0 && !preg_match(REGEX_FOLDER_NAME, $parentIn)) {
            http_response_code(400); echo json_encode(['error' => 'Invalid parent folder name.']); return;
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
            http_response_code(403); echo json_encode(['error' => $msg]); return;
        }

        $result = FolderModel::createFolder($folderName, $parent, $username);
        if (empty($result['success'])) {
            http_response_code(400);
            echo json_encode($result);
            return;
        }

        echo json_encode($result);
    } catch (Throwable $e) {
        error_log('createFolder fatal: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
        http_response_code(500);
        echo json_encode(['error' => 'Internal error creating folder.']);
    }
}

    /* -------------------- API: Delete Folder -------------------- */
    public function deleteFolder(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(["error" => "Method not allowed."]); exit; }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['folder'])) { http_response_code(400); echo json_encode(["error" => "Folder name not provided."]); exit; }

        $folder = trim((string)$input['folder']);
        if (strcasecmp($folder, 'root') === 0) { http_response_code(400); echo json_encode(["error" => "Cannot delete root folder."]); exit; }
        if (!preg_match(REGEX_FOLDER_NAME, $folder)) { http_response_code(400); echo json_encode(["error" => "Invalid folder name."]); exit; }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();

        // Folder-scope: need manage (owner) OR explicit manage grant
        if ($msg = self::enforceFolderScope($folder, $username, $perms, 'manage')) {
            http_response_code(403); echo json_encode(["error" => $msg]); exit;
        }

        // Require either manage permission or ancestor ownership (strong gate)
        $canManage = ACL::canManage($username, $perms, $folder) || self::ownsFolderOrAncestor($folder, $username, $perms);
        if (!$canManage) {
            http_response_code(403); echo json_encode(["error" => "Forbidden: you lack manage rights for this folder."]); exit;
        }

        // If not bypassing ownership, require ownership (direct or ancestor) as an extra safeguard
        if (!self::canBypassOwnership($perms) && !self::ownsFolderOrAncestor($folder, $username, $perms)) {
            http_response_code(403); echo json_encode(["error" => "Forbidden: you are not the folder owner."]); exit;
        }

        $result = FolderModel::deleteFolder($folder);
        echo json_encode($result);
        exit;
    }

    /* -------------------- API: Rename Folder -------------------- */
    public function renameFolder(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed.']); exit; }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
            http_response_code(400); echo json_encode(['error' => 'Required folder names not provided.']); exit;
        }

        $oldFolder = trim((string)$input['oldFolder']);
        $newFolder = trim((string)$input['newFolder']);

        if (!preg_match(REGEX_FOLDER_NAME, $oldFolder) || !preg_match(REGEX_FOLDER_NAME, $newFolder)) {
            http_response_code(400); echo json_encode(['error' => 'Invalid folder name(s).']); exit;
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();

        // Must be allowed to manage the old folder
        if ($msg = self::enforceFolderScope($oldFolder, $username, $perms, 'manage')) {
            http_response_code(403); echo json_encode(["error" => $msg]); exit;
        }
        // For the new folder path, require write scope (we're "creating" a path)
        if ($msg = self::enforceFolderScope($newFolder, $username, $perms, 'manage')) {
            http_response_code(403); echo json_encode(["error" => "New path not allowed: " . $msg]); exit;
        }

        // Strong gates: need manage on old OR ancestor owner; need manage on new parent OR ancestor owner
        $canManageOld = ACL::canManage($username, $perms, $oldFolder) || self::ownsFolderOrAncestor($oldFolder, $username, $perms);
        if (!$canManageOld) {
            http_response_code(403); echo json_encode(['error' => 'Forbidden: you lack manage rights on the source folder.']); exit;
        }

        // If not bypassing ownership, require ownership (direct or ancestor) on the old folder
        if (!self::canBypassOwnership($perms) && !self::ownsFolderOrAncestor($oldFolder, $username, $perms)) {
            http_response_code(403); echo json_encode(['error' => 'Forbidden: you are not the folder owner.']); exit;
        }

        $result = FolderModel::renameFolder($oldFolder, $newFolder);
        echo json_encode($result);
        exit;
    }

    /* -------------------- API: Get Folder List -------------------- */
    public function getFolderList(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();

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

        // 1) Full list from model
        $all = FolderModel::getFolderList(); // each row: ["folder","fileCount","metadataFile"]
        if (!is_array($all)) { echo json_encode([]); exit; }

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

        echo json_encode($all);
        exit;
    }

    /* -------------------- Public Shared Folder HTML -------------------- */
    public function shareFolder(): void
    {
        $token        = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);
        $page         = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
        if ($page === false || $page < 1) $page = 1;

        if (empty($token)) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(["error" => "Missing token."]); exit; }

        $data = FolderModel::getSharedFolderData($token, $providedPass, $page);

        if (isset($data['needs_password']) && $data['needs_password'] === true) {
            header("Content-Type: text/html; charset=utf-8"); ?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enter Password</title>
<style>body{font-family:Arial,sans-serif;padding:20px;background:#f7f7f7}.container{max-width:400px;margin:80px auto;background:#fff;padding:20px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.1)}input[type=password],button{width:100%;padding:10px;margin:10px 0;font-size:1rem}button{background:#007BFF;border:none;color:#fff;cursor:pointer}button:hover{background:#0056b3}</style>
</head><body><div class="container"><h2>Folder Protected</h2><p>This folder is protected by a password. Please enter the password to view its contents.</p>
<form method="get" action="/api/folder/shareFolder.php"><input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>"><label for="pass">Password:</label><input type="password" name="pass" id="pass" required><button type="submit">Submit</button></form></div></body></html>
<?php       exit;
        }

        if (isset($data['error'])) { http_response_code(403); header('Content-Type: application/json'); echo json_encode(["error" => $data['error']]); exit; }

        require_once PROJECT_ROOT . '/src/models/AdminModel.php';
        $adminConfig          = AdminModel::getConfig();
        $sharedMaxUploadSize  = (isset($adminConfig['sharedMaxUploadSize']) && is_numeric($adminConfig['sharedMaxUploadSize']))
            ? (int)$adminConfig['sharedMaxUploadSize'] : null;

        $folderName  = $data['folder'];
        $files       = $data['files'];
        $currentPage = $data['currentPage'];
        $totalPages  = $data['totalPages'];

        header("Content-Type: text/html; charset=utf-8"); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></title>
<style>
body{background:#f2f2f2;font-family:Arial,sans-serif;padding:0 20px 20px;color:#333}.header{text-align:center;margin:0 0 30px}.container{max-width:800px;margin:0 auto;background:#fff;border-radius:4px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}th{background:#007BFF;color:#fff}
.pagination{text-align:center;margin-top:20px}.pagination a,.pagination span{margin:0 5px;padding:8px 12px;background:#007BFF;color:#fff;border-radius:4px;text-decoration:none}
.pagination span.current{background:#0056b3}.shared-gallery-container{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;padding:10px 0}
.shared-gallery-card{border:1px solid #ccc;padding:5px;text-align:center}.shared-gallery-card img{max-width:100%;display:block;margin:0 auto}
.upload-container{margin-top:30px;text-align:center}.upload-container h3{font-size:1.4rem;margin-bottom:10px}.upload-container form{display:inline-block;margin-top:10px}
.upload-container button{background-color:#28a745;border:none;color:#fff;padding:10px 20px;font-size:1rem;border-radius:4px;cursor:pointer}
.upload-container button:hover{background-color:#218838}.footer{text-align:center;margin-top:40px;font-size:.9rem;color:#777}
.toggle-btn{background-color:#007BFF;color:#fff;border:none;border-radius:4px;padding:8px 16px;font-size:1rem;cursor:pointer}.toggle-btn:hover{background-color:#0056b3}.pagination a:hover{background-color:#0056b3}.pagination span{cursor:default}
</style>
</head>
<body>
<div class="header"><h1>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></h1></div>
<div class="container">
<button id="toggleBtn" class="toggle-btn">Switch to Gallery View</button>
<div id="listViewContainer">
<?php if (empty($files)): ?>
<p style="text-align:center;">This folder is empty.</p>
<?php else: ?>
<table><thead><tr><th>Filename</th><th>Size</th></tr></thead><tbody>
<?php foreach ($files as $file):
    $safeName   = htmlspecialchars($file, ENT_QUOTES, 'UTF-8');
    $filePath   = $data['realFolderPath'] . DIRECTORY_SEPARATOR . $file;
    $sizeString = (is_file($filePath) ? self::formatBytes((int)@filesize($filePath)) : "Unknown");
    $downloadLink = "/api/folder/downloadSharedFile.php?token=" . urlencode($token) . "&file=" . urlencode($file);
?>
<tr><td><a href="<?php echo htmlspecialchars($downloadLink, ENT_QUOTES, 'UTF-8'); ?>"><?php echo $safeName; ?> <span class="download-icon">&#x21E9;</span></a></td><td><?php echo $sizeString; ?></td></tr>
<?php endforeach; ?>
</tbody></table>
<?php endif; ?>
</div>
<div id="galleryViewContainer" style="display:none;"></div>
<div class="pagination">
<?php if ($currentPage > 1): ?>
<a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage - 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Prev</a>
<?php else: ?><span>Prev</span><?php endif; ?>
<?php $startPage = max(1, $currentPage - 2); $endPage = min($totalPages, $currentPage + 2);
for ($i = $startPage; $i <= $endPage; $i++): ?>
<?php if ($i == $currentPage): ?><span class="current"><?php echo $i; ?></span>
<?php else: ?><a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $i; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>"><?php echo $i; ?></a>
<?php endif; endfor; ?>
<?php if ($currentPage < $totalPages): ?>
<a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage + 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Next</a>
<?php else: ?><span>Next</span><?php endif; ?>
</div>

<?php if (isset($data['record']['allowUpload']) && (int)$data['record']['allowUpload'] === 1): ?>
<div class="upload-container">
<h3>Upload File <?php if ($sharedMaxUploadSize !== null): ?>(<?php echo self::formatBytes($sharedMaxUploadSize); ?> max size)<?php endif; ?></h3>
<form action="/api/folder/uploadToSharedFolder.php" method="post" enctype="multipart/form-data">
<input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
<input type="file" name="fileToUpload" required><br><br><button type="submit">Upload</button>
</form>
</div>
<?php endif; ?>
</div>
<div class="footer">&copy; <?php echo date("Y"); ?> FileRise. All rights reserved.</div>
<script type="application/json" id="shared-data">{"token": <?php echo json_encode($token, JSON_HEX_TAG); ?>,"files": <?php echo json_encode($files, JSON_HEX_TAG); ?>}</script>
<script src="/js/sharedFolderView.js" defer></script>
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
        if (!$in || !isset($in['folder'])) { http_response_code(400); echo json_encode(["error" => "Invalid input."]); exit; }

        $folder      = trim((string)$in['folder']);
        $value       = isset($in['expirationValue']) ? intval($in['expirationValue']) : 60;
        $unit        = $in['expirationUnit'] ?? 'minutes';
        $password    = (string)($in['password'] ?? '');
        $allowUpload = intval($in['allowUpload'] ?? 0);

        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) { http_response_code(400); echo json_encode(["error" => "Invalid folder name."]); exit; }

        $username = $_SESSION['username'] ?? '';
        $perms    = self::getPerms();
        $isAdmin  = self::isAdmin($perms);

        // Must have share on this folder OR be ancestor owner
        if (!(ACL::canShare($username, $perms, $folder) || self::ownsFolderOrAncestor($folder, $username, $perms))) {
            http_response_code(403); echo json_encode(["error" => "Sharing is not permitted for your account."]); exit;
        }

        // Folder-scope: need share capability within scope
        if ($msg = self::enforceFolderScope($folder, $username, $perms, 'share')) {
            http_response_code(403); echo json_encode(["error" => $msg]); exit;
        }

        // Ownership requirement unless bypassed (allow ancestor owners)
        if (!self::canBypassOwnership($perms) && !self::ownsFolderOrAncestor($folder, $username, $perms)) {
            http_response_code(403); echo json_encode(["error" => "Forbidden: you are not the owner of this folder."]); exit;
        }

        if ($allowUpload === 1 && !empty($perms['disableUpload']) && !$isAdmin) {
            http_response_code(403); echo json_encode(["error" => "You cannot enable uploads on shared folders."]); exit;
        }

        if ($value < 1) $value = 1;
        switch ($unit) {
            case 'seconds': $seconds = $value; break;
            case 'hours':   $seconds = $value * 3600; break;
            case 'days':    $seconds = $value * 86400; break;
            case 'minutes':
            default:        $seconds = $value * 60; break;
        }
        $seconds = min($seconds, 31536000);

        $res = FolderModel::createShareFolderLink($folder, $seconds, $password, $allowUpload);
        echo json_encode($res);
        exit;
    }

    /* -------------------- API: Download Shared File -------------------- */
    public function downloadSharedFile(): void
    {
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $file  = filter_input(INPUT_GET, 'file', FILTER_SANITIZE_STRING);

        if (empty($token) || empty($file)) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(["error" => "Missing token or file parameter."]); exit; }

        $basename = basename($file);
        if (!preg_match(REGEX_FILE_NAME, $basename)) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(["error" => "Invalid file name."]); exit; }

        $result = FolderModel::getSharedFileInfo($token, $basename);
        if (isset($result['error'])) { http_response_code(404); header('Content-Type: application/json'); echo json_encode(["error" => $result['error']]); exit; }

        $realFilePath = $result['realFilePath'];
        $mimeType     = $result['mimeType'];

        header('X-Content-Type-Options: nosniff');
        header("Content-Type: " . $mimeType);
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
            header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
        } else {
            header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
        }
        $size = @filesize($realFilePath);
        if (is_int($size)) header('Content-Length: ' . $size);
        readfile($realFilePath);
        exit;
    }

    /* -------------------- API: Upload to Shared Folder -------------------- */
    public function uploadToSharedFolder(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); header('Content-Type: application/json'); echo json_encode(["error" => "Method not allowed."]); exit; }

        if (empty($_POST['token'])) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(["error" => "Missing share token."]); exit; }
        $token = trim($_POST['token']);

        if (!isset($_FILES['fileToUpload'])) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(["error" => "No file was uploaded."]); exit; }
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
            http_response_code(400); header('Content-Type: application/json'); echo json_encode(['error' => $msg]); exit;
        }

        $result = FolderModel::uploadToSharedFolder($token, $fileUpload);
        if (isset($result['error'])) { http_response_code(400); header('Content-Type: application/json'); echo json_encode($result); exit; }

        $_SESSION['upload_message'] = "File uploaded successfully.";
        $redirectUrl = "/api/folder/shareFolder.php?token=" . urlencode($token);
        header("Location: " . $redirectUrl);
        exit;
    }

    /* -------------------- Admin: List/Delete Share Folder Links -------------------- */
    public function getAllShareFolderLinks(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        self::requireAdmin(); // exposing all share folder links is an admin operation

        $shareFile = META_DIR . 'share_folder_links.json';
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
        if (!$token) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'No token provided']); return; }

        $deleted = FolderModel::deleteShareFolderLink($token);
        if ($deleted) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Not found']);
        }
    }

    /* -------------------- API: Move Folder -------------------- */
    public function moveFolder(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        self::requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { http_response_code(405); echo json_encode(['error'=>'Method not allowed']); return; }
        // CSRF: accept header or form field
        $hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $tok = $_SESSION['csrf_token'] ?? '';
        if (!$hdr || !$tok || !hash_equals((string)$tok, (string)$hdr)) { http_response_code(403); echo json_encode(['error'=>'Invalid CSRF token']); return; }

        $raw = file_get_contents('php://input');
        $input = json_decode($raw ?: "{}", true);
        $source = trim((string)($input['source'] ?? ''));
        $destination = trim((string)($input['destination'] ?? ''));

        if ($source === '' || strcasecmp($source,'root')===0) { http_response_code(400); echo json_encode(['error'=>'Invalid source folder']); return; }
        if ($destination === '') $destination = 'root';

        // basic segment validation
        foreach ([$source,$destination] as $f) {
            if ($f==='root') continue;
            $parts = array_filter(explode('/', trim($f, "/\\ ")), fn($p)=>$p!=='');
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) { http_response_code(400); echo json_encode(['error'=>'Invalid folder segment']); return; }
            }
        }

        $srcNorm = trim($source, "/\\ ");
        $dstNorm = $destination==='root' ? '' : trim($destination, "/\\ ");

        // prevent move into self/descendant
        if ($dstNorm !== '' && (strcasecmp($dstNorm,$srcNorm)===0 || strpos($dstNorm.'/', $srcNorm.'/')===0)) {
            http_response_code(400); echo json_encode(['error'=>'Destination cannot be the source or its descendant']); return;
        }

        $username = $_SESSION['username'] ?? '';
        $perms = $this->loadPerms($username);

        // enforce scopes (source manage-ish, dest write-ish)
        if ($msg = self::enforceFolderScope($source, $username, $perms, 'manage')) { http_response_code(403); echo json_encode(['error'=>$msg]); return; }
        if ($msg = self::enforceFolderScope($destination, $username, $perms, 'write')) { http_response_code(403); echo json_encode(['error'=>$msg]); return; }

        // Check capabilities using ACL helpers
        $canManageSource = ACL::canManage($username, $perms, $source) || ACL::isOwner($username, $perms, $source);
        $canMoveIntoDest = ACL::canMove($username, $perms, $destination) || ($destination==='root' ? self::isAdmin($perms) : ACL::isOwner($username, $perms, $destination));
        if (!$canManageSource) { http_response_code(403); echo json_encode(['error'=>'Forbidden: manage rights required on source']); return; }
        if (!$canMoveIntoDest) { http_response_code(403); echo json_encode(['error'=>'Forbidden: move rights required on destination']); return; }

        // Non-admin: enforce same owner between source and destination tree (if any)
        $isAdmin = self::isAdmin($perms);
        if (!$isAdmin) {
            try {
                $ownerSrc = FolderModel::getOwnerFor($source) ?? '';
                $ownerDst = $destination==='root' ? '' : (FolderModel::getOwnerFor($destination) ?? '');
                if ($ownerSrc !== $ownerDst) {
                    http_response_code(403); echo json_encode(['error'=>'Source and destination must have the same owner']); return;
                }
            } catch (\Throwable $e) { /* ignore – fall through */ }
        }

        // Compute final target "destination/basename(source)"
        $baseName = basename(str_replace('\\','/', $srcNorm));
        $target   = $destination==='root' ? $baseName : rtrim($destination, "/\\ ") . '/' . $baseName;

        try {
            $result = FolderModel::renameFolder($source, $target);
            echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (\Throwable $e) {
            error_log('moveFolder error: '.$e->getMessage());
            http_response_code(500);
            echo json_encode(['error'=>'Internal error moving folder']);
        }
    }
}
