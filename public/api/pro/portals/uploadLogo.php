<?php
// public/api/pro/portals/uploadLogo.php

declare(strict_types=1);

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

header('Content-Type: application/json; charset=utf-8');

// Pro-only gate
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error'   => 'FileRise Pro is not active on this instance.'
    ]);
    exit;
}

try {
    $ctrl = new UserController();
    $ctrl->uploadPortalLogo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Exception: ' . $e->getMessage(),
    ]);
}