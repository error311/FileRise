<?php
// public/api/pro/sources/select.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

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
    if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid source id']);
        exit;
    }

    $cfg = ProSources::getConfig();
    if (empty($cfg['enabled'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Sources are not enabled']);
        exit;
    }

    $source = ProSources::getSource($id);
    if (!$source || empty($source['enabled'])) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Source not found']);
        exit;
    }

    $username = (string)($_SESSION['username'] ?? '');
    $perms = [];
    if (function_exists('loadUserPermissions')) {
        $p = loadUserPermissions($username);
        $perms = is_array($p) ? $p : [];
    } elseif (class_exists('userModel') && method_exists('userModel', 'getUserPermissions')) {
        $all = userModel::getUserPermissions();
        if (is_array($all)) {
            if (isset($all[$username])) {
                $perms = (array)$all[$username];
            } else {
                $lk = strtolower($username);
                if (isset($all[$lk])) $perms = (array)$all[$lk];
            }
        }
    }

    $originalId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';
    if (class_exists('SourceContext')) {
        SourceContext::setActiveId($id, false);
    }
    if (!ACL::userHasAnyAccess($username, $perms, 'root')) {
        if (class_exists('SourceContext') && $originalId !== '') {
            SourceContext::setActiveId($originalId, false);
        }
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Access denied']);
        exit;
    }

    if (class_exists('SourceContext')) {
        SourceContext::setActiveId($id, true);
    }

    echo json_encode(['ok' => true, 'activeId' => $id], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error selecting source'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
