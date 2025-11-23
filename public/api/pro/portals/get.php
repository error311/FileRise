<?php
// public/api/pro/portals/get.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/PortalController.php';

try {
    $slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';

    // For v1: we do NOT require auth here; this is just metadata,
    // real ACL/access control must still be enforced at upload/download endpoints.
    $portal = PortalController::getPortalBySlug($slug);

    echo json_encode([
        'success' => true,
        'portal'  => $portal,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}