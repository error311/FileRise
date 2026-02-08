<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/capabilities.php",
 *   summary="Get folder capabilities",
 *   description="Returns effective permissions and capability flags for a folder.",
 *   operationId="getFolderCapabilities",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string"), example="local"),
 *   @OA\Response(response=200, description="Capabilities payload"),
 *   @OA\Response(response=401, description="Unauthorized")
 * )
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../../../config/config.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$username = (string)($_SESSION['username'] ?? '');
if ($username === '') { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }
@session_write_close();

$perms = [
  'role'        => $_SESSION['role']        ?? null,
  'admin'       => $_SESSION['admin']       ?? null,
  'isAdmin'     => $_SESSION['isAdmin']     ?? null,
  'folderOnly'  => $_SESSION['folderOnly']  ?? null,
  'readOnly'    => $_SESSION['readOnly']    ?? null,
];
$sourceId = trim((string)($_GET['sourceId'] ?? ''));
if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
  if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
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
  $allowDisabled = !empty($perms['admin']) || !empty($perms['isAdmin']) || ($perms['role'] ?? '') === 'admin' || ($perms['role'] ?? '') === '1';
  if (!$allowDisabled && empty($info['enabled'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Source is disabled.']);
    exit;
  }
  SourceContext::setActiveId($sourceId, false, $allowDisabled);
}

$folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
$folder = str_replace('\\', '/', trim($folder));
$folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

echo json_encode(\FileRise\Http\Controllers\FolderController::capabilities($folder, $username), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
