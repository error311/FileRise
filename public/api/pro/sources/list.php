<?php
// public/api/pro/sources/list.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProSources') || !fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SOURCES)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Pro is not active']);
        exit;
    }

    $cfg = ProSources::getAdminList();
    $activeId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';

    echo json_encode([
        'ok' => true,
        'enabled' => !empty($cfg['enabled']),
        'sources' => $cfg['sources'] ?? [],
        'activeId' => $activeId,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error loading sources'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
