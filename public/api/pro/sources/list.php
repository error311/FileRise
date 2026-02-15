<?php
// public/api/pro/sources/list.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';
require_once PROJECT_ROOT . '/src/lib/SourcesConfig.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();
    \FileRise\Http\Controllers\AdminController::requireAdmin();

    $cfg = SourcesConfig::getAdminList();
    $activeId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';

    echo json_encode([
        'ok' => true,
        'enabled' => !empty($cfg['enabled']),
        'sources' => $cfg['sources'] ?? [],
        'activeId' => $activeId,
        'available' => !empty($cfg['available']),
        'proExtended' => !empty($cfg['proExtended']),
        'allowedTypes' => $cfg['allowedTypes'] ?? [],
        'coreTypes' => $cfg['coreTypes'] ?? [],
        'proTypes' => $cfg['proTypes'] ?? [],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error loading sources'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
