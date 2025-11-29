<?php
// public/api/pro/diskUsageDeleteFolderRecursive.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

// Pro-only gate
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'FileRise Pro is not active on this instance.']);
    return;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();
    AdminController::requireCsrf();

    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['folder'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid input']);
        return;
    }

    $folder = (string)$body['folder'];
    $folder = $folder === '' ? 'root' : trim($folder, "/\\ ");

    if (strtolower($folder) === 'root') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Cannot deep delete root folder.']);
        return;
    }

    $res = FolderModel::deleteFolderRecursiveAdmin($folder);
    if (!empty($res['error'])) {
        echo json_encode(['ok' => false, 'error' => $res['error']]);
    } else {
        echo json_encode(['ok' => true, 'success' => $res['success'] ?? 'Folder deleted.']);
    }
} catch (Throwable $e) {
    error_log('diskUsageDeleteFolderRecursive error: '.$e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Internal error']);
}