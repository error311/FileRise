<?php
// public/api/admin/diskUsageDeleteSnapshot.php
/**
 * @OA\Post(
 *   path="/api/admin/diskUsageDeleteSnapshot.php",
 *   summary="Delete disk usage snapshot",
 *   description="Deletes the cached disk usage snapshot file.",
 *   operationId="adminDiskUsageDeleteSnapshot",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Snapshot deleted"),
 *   @OA\Response(response=400, description="CSRF mismatch"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/models/DiskUsageModel.php';

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

// Optional CSRF guard (best-effort; mirrors other admin endpoints)
$csrf = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$meta = (string)($_SESSION['csrf_token'] ?? '');
if ($meta !== '' && $csrf !== '' && !hash_equals($meta, $csrf)) {
    http_response_code(400);
    echo json_encode([
        'ok'    => false,
        'error' => 'csrf_mismatch',
    ]);
    return;
}

try {
    $deleted = DiskUsageModel::deleteSnapshot();
    http_response_code(200);
    echo json_encode([
        'ok'       => true,
        'deleted'  => $deleted,
        'snapshot' => DiskUsageModel::snapshotPath(),
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'error'   => 'internal_error',
        'message' => $e->getMessage(),
    ]);
}
