<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/listChildren.php",
 *   summary="List folder children",
 *   description="Returns a paged list of child folders for tree navigation.",
 *   operationId="listFolderChildren",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1, maximum=2000), example=500),
 *   @OA\Parameter(name="cursor", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Child list payload"),
 *   @OA\Response(response=401, description="Unauthorized")
 * )
 */
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
