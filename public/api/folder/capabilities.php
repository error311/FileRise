<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$username = (string)($_SESSION['username'] ?? '');
if ($username === '') { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }
@session_write_close();

$folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
$folder = str_replace('\\', '/', trim($folder));
$folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

echo json_encode(FolderController::capabilities($folder, $username), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);