<?php
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

$ctrl = new AdminController();
$ctrl->setLicense();