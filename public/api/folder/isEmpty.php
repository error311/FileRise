<?php
// public/api/folder/isEmpty.php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

// Snapshot then release session lock so parallel requests don’t block
$user  = (string)($_SESSION['username'] ?? '');
$perms = [
  'role'    => $_SESSION['role']    ?? null,
  'admin'   => $_SESSION['admin']   ?? null,
  'isAdmin' => $_SESSION['isAdmin'] ?? null,
];
@session_write_close();

// Input
$folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
$folder = str_replace('\\', '/', trim($folder));
$folder = ($folder === '' || $folder === 'root') ? 'root' : trim($folder, '/');

// Delegate to controller (model handles ACL + path safety)
$result = FolderController::stats($folder, $user, $perms);

// Always return a compact JSON object like before
echo json_encode([
  'folders' => (int)($result['folders'] ?? 0),
  'files'   => (int)($result['files'] ?? 0),
]);