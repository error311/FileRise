<?php
// public/api/pro/groups/list.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

try {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();

    $ctrl   = new AdminController();
    $groups = $ctrl->getProGroups();

    echo json_encode([
        'success' => true,
        'groups'  => $groups,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $code = $e instanceof InvalidArgumentException ? 400 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => 'Error loading groups: ' . $e->getMessage(),
    ]);
}