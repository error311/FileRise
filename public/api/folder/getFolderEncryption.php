<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/getFolderEncryption.php",
 *   summary="Get folder encryption capabilities",
 *   operationId="getFolderEncryption",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Response(response=200, description="Encryption capability payload"),
 *   @OA\Response(response=401, description="Unauthorized")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../../../config/config.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$username = (string)($_SESSION['username'] ?? '');
if ($username === '') {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}
@session_write_close();

$folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
$folder = str_replace('\\', '/', trim($folder));
$folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

$caps = \FileRise\Http\Controllers\FolderController::capabilities($folder, $username);
$enc  = (is_array($caps) && isset($caps['encryption']) && is_array($caps['encryption'])) ? $caps['encryption'] : [];

echo json_encode([
    'ok' => true,
    'folder' => $folder,
    'encryption' => $enc,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
