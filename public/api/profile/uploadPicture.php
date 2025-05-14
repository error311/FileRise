<?php
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

// Always JSON, even on PHP notices
header('Content-Type: application/json');

try {
    $userController = new UserController();
    $userController->uploadPicture();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
      'success' => false,
      'error'   => 'Exception: ' . $e->getMessage()
    ]);
}