<?php
// public/api/pro/sources/delete.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();
    AdminController::requireCsrf();

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProSources') || !fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SOURCES)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Pro is not active']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
        exit;
    }

    $id = trim((string)($body['id'] ?? ''));
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing source id']);
        exit;
    }

    $res = ProSources::deleteSource($id);
    if (empty($res['ok'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => $res['error'] ?? 'Failed to delete source']);
        exit;
    }

    $cfg = AdminModel::getConfig();
    if (!isset($cfg['error'])) {
        $public = AdminModel::buildPublicSubset($cfg);
        AdminModel::writeSiteConfig($public);
    }

    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error deleting source'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
