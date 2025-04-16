<?php
// public/api/upload/upload.php
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/uploadController.php';

$uploadController = new UploadController();
$uploadController->handleUpload();