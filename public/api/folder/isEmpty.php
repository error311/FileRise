<?php
// Fast ACL-aware peek for tree icons/chevrons
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/isEmpty.php",
 *   summary="Check if folder is empty",
 *   description="ACL-aware check used for folder tree icons.",
 *   operationId="folderIsEmpty",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string"), example="local"),
 *   @OA\Parameter(name="deep", in="query", required=false, @OA\Schema(type="integer"), example=1, description="When 1, return recursive totals."),
 *   @OA\Parameter(name="depth", in="query", required=false, @OA\Schema(type="integer"), example=2, description="Max recursive depth when deep=1 (0 = unlimited)."),
 *   @OA\Response(response=200, description="Stats payload"),
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

$deep = isset($_GET['deep']) && $_GET['deep'] !== '' && $_GET['deep'] !== '0';
$depth = null;
if (isset($_GET['depth']) && $_GET['depth'] !== '') {
  $depthVal = filter_var($_GET['depth'], FILTER_VALIDATE_INT);
  if ($depthVal !== false) {
    $depth = (int)$depthVal;
  }
}

echo json_encode(FolderController::stats($folder, $username, $perms, $deep, $depth), JSON_UNESCAPED_SLASHES);
