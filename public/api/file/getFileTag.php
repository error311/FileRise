<?php
// public/api/file/getFileTag.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/fileController.php';

$fileController = new FileController();
$fileController->getFileTags();