<?php
// public/api/folder/capabilities.php
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

header('Content-Type: application/json');

// --- auth ---
$username = $_SESSION['username'] ?? '';
if ($username === '') {
  http_response_code(401);
  echo json_encode(['error' => 'Unauthorized']);
  exit;
}

// --- helpers ---
function loadPermsFor(string $u): array {
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
  } catch (Throwable $e) {}
  return [];
}

function isAdminUser(string $u, array $perms): bool {
  if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
  if (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) return true;
  $role = $_SESSION['role'] ?? null;
  if ($role === 'admin' || $role === '1' || $role === 1) return true;
  if ($u) {
    $r = userModel::getUserRole($u);
    if ($r === '1') return true;
  }
  return false;
}

function inUserFolderScope(string $folder, string $u, array $perms, bool $isAdmin): bool {
  if ($isAdmin) return true;
  $folderOnly = !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
  if (!$folderOnly) return true;
  $f = trim($folder);
  if ($f === '' || strcasecmp($f, 'root') === 0) return false; // non-admin folderOnly: not root
  return ($f === $u) || (strpos($f, $u . '/') === 0);
}

// --- inputs ---
$folder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'root';
// validate folder path: allow "root" or nested segments matching REGEX_FOLDER_NAME
if ($folder !== 'root') {
  $parts = array_filter(explode('/', trim($folder, "/\\ ")));
  if (empty($parts)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid folder name.']);
    exit;
  }
  foreach ($parts as $seg) {
    if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
      http_response_code(400);
      echo json_encode(['error' => 'Invalid folder name.']);
      exit;
    }
  }
  $folder = implode('/', $parts);
}

$perms   = loadPermsFor($username);
$isAdmin = isAdminUser($username, $perms);

// base permissions via ACL
$canRead   = $isAdmin || ACL::canRead($username, $perms, $folder);
$canWrite  = $isAdmin || ACL::canWrite($username, $perms, $folder);
$canShare  = $isAdmin || ACL::canShare($username, $perms, $folder);

// scope + flags
$inScope         = inUserFolderScope($folder, $username, $perms, $isAdmin);
$readOnly        = !empty($perms['readOnly']);
$disableUpload   = !empty($perms['disableUpload']);

$canUpload       = $canWrite && !$readOnly && !$disableUpload && $inScope;
$canCreateFolder = $canWrite && !$readOnly && $inScope;
$canRename       = $canWrite && !$readOnly && $inScope;
$canDelete       = $canWrite && !$readOnly && $inScope;
$canMoveIn       = $canWrite && !$readOnly && $inScope;

// (optional) owner info if you need it client-side
$owner = FolderModel::getOwnerFor($folder);

// output
echo json_encode([
  'user'        => $username,
  'folder'      => $folder,
  'isAdmin'     => $isAdmin,
  'flags'       => [
    'folderOnly'    => !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']),
    'readOnly'      => $readOnly,
    'disableUpload' => $disableUpload,
  ],
  'owner'      => $owner,
  'canView'    => $canRead,
  'canUpload'  => $canUpload,
  'canCreate'  => $canCreateFolder,
  'canRename'  => $canRename,
  'canDelete'  => $canDelete,
  'canMoveIn'  => $canMoveIn,
  'canShare'   => $canShare,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);