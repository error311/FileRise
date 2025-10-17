<?php
// public/api/admin/acl/getGrants.php
declare(strict_types=1);

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json');

// Admin only
if (empty($_SESSION['authenticated']) || empty($_SESSION['isAdmin'])) {
  http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit;
}

$user = trim((string)($_GET['user'] ?? ''));
if ($user === '' || !preg_match(REGEX_USER, $user)) {
  http_response_code(400); echo json_encode(['error'=>'Invalid user']); exit;
}

// Build the folder list (admin sees all)
$folders = [];
try {
  $rows = FolderModel::getFolderList();
  if (is_array($rows)) {
    foreach ($rows as $r) {
      $f = is_array($r) ? ($r['folder'] ?? '') : (string)$r;
      if ($f !== '') $folders[$f] = true;
    }
  }
} catch (Throwable $e) { /* ignore */ }

if (empty($folders)) {
  $aclPath = META_DIR . 'folder_acl.json';
  if (is_file($aclPath)) {
    $data = json_decode((string)@file_get_contents($aclPath), true);
    if (is_array($data['folders'] ?? null)) {
      foreach ($data['folders'] as $name => $_) $folders[$name] = true;
    }
  }
}

$folderList = array_keys($folders);
if (!in_array('root', $folderList, true)) array_unshift($folderList, 'root');

$has = function(array $arr, string $u): bool {
  foreach ($arr as $x) if (strcasecmp((string)$x, $u) === 0) return true;
  return false;
};

$out = [];
foreach ($folderList as $f) {
  $rec = ACL::explicit($f); // owners, read, write, share, read_own

  $isOwner   = $has($rec['owners'],   $user);
  $canUpload = $isOwner || $has($rec['write'], $user);

  // IMPORTANT: full view only if owner or explicit read
  $canViewAll = $isOwner || $has($rec['read'], $user);

  // own-only view reflects explicit read_own (we keep it separate even if they have full view)
  $canViewOwn = $has($rec['read_own'], $user);

  // Share only if owner or explicit share
  $canShare = $isOwner || $has($rec['share'], $user);

  if ($canViewAll || $canViewOwn || $canUpload || $isOwner || $canShare) {
    $out[$f] = [
      'view'    => $canViewAll,
      'viewOwn' => $canViewOwn,
      'upload'  => $canUpload,
      'manage'  => $isOwner,
      'share'   => $canShare,
    ];
  }
}

echo json_encode(['grants' => $out], JSON_UNESCAPED_SLASHES);