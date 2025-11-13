<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
if (empty($_SESSION['authenticated'])) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$username = (string)($_SESSION['username'] ?? '');
$perms = [
  'role'        => $_SESSION['role']        ?? null,
  'admin'       => $_SESSION['admin']       ?? null,
  'isAdmin'     => $_SESSION['isAdmin']     ?? null,
  'folderOnly'  => $_SESSION['folderOnly']  ?? null,
  'readOnly'    => $_SESSION['readOnly']    ?? null,
];
@session_write_close();

$folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
$folder = str_replace('\\', '/', trim($folder));
$folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

$limit  = max(1, min(2000, (int)($_GET['limit'] ?? 500)));
$cursor = isset($_GET['cursor']) && $_GET['cursor'] !== '' ? (string)$_GET['cursor'] : null;

$res = FolderController::listChildren($folder, $username, $perms, $cursor, $limit);
echo json_encode($res, JSON_UNESCAPED_SLASHES);