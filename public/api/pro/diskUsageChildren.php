<?php
// public/api/pro/diskUsageChildren.php
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
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProDiskUsage')) {
    http_response_code(403);
    echo json_encode([
        'ok'    => false,
        'error' => 'FileRise Pro is not active on this instance.',
    ]);
    return;
}

$folderKey = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';

try {
    /** @var array $result */
    $result = ProDiskUsage::getChildren($folderKey);
    http_response_code(!empty($result['ok']) ? 200 : 404);
    echo json_encode($result, JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'error'   => 'internal_error',
        'message' => $e->getMessage(),
    ]);
}