<?php
// public/api/upload/removeChunks.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UploadController.php';

$uploadController = new UploadController();
$uploadController->removeChunks();