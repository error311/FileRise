<?php
// public/api/totp_saveCode.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->saveTOTPRecoveryCode();