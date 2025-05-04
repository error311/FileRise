<?php
// public/api/admin/updateConfig.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

$adminController = new AdminController();
$adminController->updateConfig();