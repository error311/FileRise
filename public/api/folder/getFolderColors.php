<?php
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }

try {
    $ctl = new FolderController();
    $ctl->getFolderColors();   // echoes JSON + status codes
} catch (Throwable $e) {
    error_log('getFolderColors failed: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Internal server error']);
}