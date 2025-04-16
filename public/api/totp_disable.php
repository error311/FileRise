<?php
// public/api/totp_disable.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';
require_once PROJECT_ROOT . '/src/controllers/userController.php';

$userController = new UserController();
$userController->disableTOTP();