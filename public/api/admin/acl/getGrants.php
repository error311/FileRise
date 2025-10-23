<?php
// public/api/admin/acl/getGrants.php
declare(strict_types=1);

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json');

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
  $aclPath = rtrim(META_DIR, "/\\") . DIRECTORY_SEPARATOR . 'folder_acl.json';
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
  $rec = ACL::explicitAll($f); // legacy + granular

  $isOwner    = $has($rec['owners'], $user);
  $canViewAll = $isOwner || $has($rec['read'], $user);
  $canViewOwn = $has($rec['read_own'], $user);
  $canShare   = $isOwner || $has($rec['share'], $user);
  $canUpload  = $isOwner || $has($rec['write'], $user) || $has($rec['upload'], $user);

  if ($canViewAll || $canViewOwn || $canUpload || $canShare || $isOwner
      || $has($rec['create'],$user) || $has($rec['edit'],$user) || $has($rec['rename'],$user)
      || $has($rec['copy'],$user) || $has($rec['move'],$user) || $has($rec['delete'],$user)
      || $has($rec['extract'],$user) || $has($rec['share_file'],$user) || $has($rec['share_folder'],$user)) {
    $out[$f] = [
      'view'        => $canViewAll,
      'viewOwn'     => $canViewOwn,
      'write'       => $has($rec['write'], $user) || $isOwner,
      'manage'      => $isOwner,
      'share'       => $canShare, // legacy
      'create'      => $isOwner || $has($rec['create'], $user),
      'upload'      => $isOwner || $has($rec['upload'], $user) || $has($rec['write'],$user),
      'edit'        => $isOwner || $has($rec['edit'], $user)   || $has($rec['write'],$user),
      'rename'      => $isOwner || $has($rec['rename'], $user) || $has($rec['write'],$user),
      'copy'        => $isOwner || $has($rec['copy'], $user)   || $has($rec['write'],$user),
      'move'        => $isOwner || $has($rec['move'], $user)   || $has($rec['write'],$user),
      'delete'      => $isOwner || $has($rec['delete'], $user) || $has($rec['write'],$user),
      'extract'     => $isOwner || $has($rec['extract'], $user)|| $has($rec['write'],$user),
      'shareFile'   => $isOwner || $has($rec['share_file'], $user) || $has($rec['share'],$user),
      'shareFolder' => $isOwner || $has($rec['share_folder'], $user) || $has($rec['share'],$user),
    ];
  }
}

echo json_encode(['grants' => $out], JSON_UNESCAPED_SLASHES);
