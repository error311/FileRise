<?php
// public/api/auth/auth.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';
require_once PROJECT_ROOT . '/src/controllers/authController.php';

$authController = new AuthController();
$authController->auth();