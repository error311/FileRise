<?php
// public/api/pro/portals/listEntries.php
/**
 * List portal entries (folders + files) with pagination.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();

    $slug = isset($_GET['slug']) ? trim((string)$_GET['slug']) : '';
    $path = isset($_GET['path']) ? (string)$_GET['path'] : '';
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $perPage = isset($_GET['perPage']) ? (int)$_GET['perPage'] : 50;
    $all = !empty($_GET['all']);

    $data = \FileRise\Http\Controllers\PortalController::listPortalEntries($slug, $path, $page, $perPage, $all);
    if (isset($data['error'])) {
        http_response_code((int)($data['status'] ?? 400));
        echo json_encode([
            'success' => false,
            'error'   => $data['error'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return;
    }

    echo json_encode(
        ['success' => true] + $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
