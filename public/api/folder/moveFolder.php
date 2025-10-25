<?php
// public/api/folder/moveFolder.php
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$controller = new FolderController();
$controller->moveFolder();
