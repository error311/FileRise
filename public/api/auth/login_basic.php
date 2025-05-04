<?php
// public/api/auth/login_basic.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AuthController.php';

$authController = new AuthController();
$authController->loginBasic();