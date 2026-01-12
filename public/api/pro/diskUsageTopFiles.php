<?php
// public/api/pro/diskUsageTopFiles.php
/**
 * @OA\Get(
 *   path="/api/pro/diskUsageTopFiles.php",
 *   summary="Get top files by size",
 *   description="Returns the largest files across the instance (Pro).",
 *   operationId="proDiskUsageTopFiles",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=100),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Top files payload"),
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

@session_write_close();

// Pro-only gate: require Pro active AND ProDiskUsage class
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProDiskUsage') || !fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_DISK_USAGE)) {
    http_response_code(403);
    echo json_encode([
        'ok'    => false,
        'error' => 'FileRise Pro is not active on this instance.',
    ]);
    return;
}

$limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 100;
$sourceId = isset($_GET['sourceId']) ? trim((string)$_GET['sourceId']) : '';

try {
    $result = ProDiskUsage::getTopFiles($limit, $sourceId);
    if (empty($result['ok'])) {
        $err = (string)($result['error'] ?? '');
        if ($err === 'invalid_source' || $err === 'unsupported_source') {
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
