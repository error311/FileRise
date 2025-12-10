<?php
// public/api/admin/changeUserPassword.php
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';

$controller = new UserController();
$controller->adminChangeUserPassword();