<?php
// public/api/admin/diskUsageSummary.php
/**
 * @OA\Get(
 *   path="/api/admin/diskUsageSummary.php",
 *   summary="Get disk usage snapshot summary",
 *   description="Returns snapshot summary and optional scan log tail.",
 *   operationId="adminDiskUsageSummary",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="topFolders", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=5),
 *   @OA\Parameter(name="topFiles", in="query", required=false, @OA\Schema(type="integer", minimum=0), example=0),
 *   @OA\Response(response=200, description="Summary payload"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=404, description="Snapshot not found"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/models/DiskUsageModel.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');

$authenticated = !empty($_SESSION['authenticated']);
$isAdmin       = !empty($_SESSION['isAdmin']) || (!empty($_SESSION['admin']) && $_SESSION['admin'] === '1');

if (!$authenticated || !$isAdmin) {
    http_response_code(401);
    echo json_encode([
        'ok'    => false,
        'error' => 'Unauthorized',
    ]);
    exit;
}

// Optional tuning via query params
$topFolders = isset($_GET['topFolders']) ? max(1, (int)$_GET['topFolders']) : 5;
  $topFiles   = isset($_GET['topFiles'])   ? max(0, (int)$_GET['topFiles'])   : 0;

try {
    $summary = DiskUsageModel::getSummary($topFolders, $topFiles);
    $logInfo = DiskUsageModel::readScanLogTail();
    if ($logInfo !== null) {
        $summary['scanLog'] = $logInfo;
    }
    // Avoid noisy 404s in console when snapshot doesn't exist yet; still include ok=false
    if (!$summary['ok'] && ($summary['error'] ?? '') === 'no_snapshot') {
        http_response_code(200);
    } else {
        http_response_code($summary['ok'] ? 200 : 404);
    }
    echo json_encode($summary, JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'error'   => 'internal_error',
        'message' => $e->getMessage(),
    ]);
}
