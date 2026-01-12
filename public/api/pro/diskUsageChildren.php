<?php
// public/api/pro/diskUsageChildren.php
/**
 * @OA\Get(
 *   path="/api/pro/diskUsageChildren.php",
 *   summary="Get disk usage children",
 *   description="Returns per-folder usage children for the storage explorer (Pro).",
 *   operationId="proDiskUsageChildren",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Children payload"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=404, description="Snapshot not found"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';

// Basic auth / admin check
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$username = (string)($_SESSION['username'] ?? '');
$isAdmin  = !empty($_SESSION['isAdmin']) || (!empty($_SESSION['admin']) && $_SESSION['admin'] === '1');

if ($username === '' || !$isAdmin) {
    http_response_code(403);
    echo json_encode([
        'ok'    => false,
        'error' => 'Forbidden',
    ]);
    return;
}

// Release session lock to avoid blocking parallel requests
@session_write_close();

// Pro-only gate: require Pro active AND ProDiskUsage class available
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProDiskUsage') || !fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_DISK_USAGE)) {
    http_response_code(403);
    echo json_encode([
        'ok'    => false,
        'error' => 'FileRise Pro is not active on this instance.',
    ]);
    return;
}

$folderKey = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
$sourceId = isset($_GET['sourceId']) ? trim((string)$_GET['sourceId']) : '';

try {
    /** @var array $result */
    $result = ProDiskUsage::getChildren($folderKey, $sourceId);
    // Avoid noisy 404s in console when snapshot is missing; still return ok=false
    if (empty($result['ok'])) {
        $err = (string)($result['error'] ?? '');
        if ($err === 'no_snapshot') {
            http_response_code(200);
        } elseif ($err === 'invalid_source' || $err === 'unsupported_source') {
            http_response_code(400);
        } else {
            http_response_code(404);
        }
    } else {
        http_response_code(200);
    }
    echo json_encode($result, JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'error'   => 'internal_error',
        'message' => $e->getMessage(),
    ]);
}
