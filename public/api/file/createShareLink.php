<?php
// public/api/file/createShareLink.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/fileController.php';

$fileController = new FileController();
$fileController->createShareLink();