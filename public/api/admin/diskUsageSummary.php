<?php
// public/api/admin/diskUsageSummary.php
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
