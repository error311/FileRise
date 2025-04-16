<?php
// public/api/folder/createFolder.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/folderController.php';

$folderController = new FolderController();
$folderController->createFolder();