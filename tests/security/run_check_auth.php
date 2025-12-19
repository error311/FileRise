<?php
declare(strict_types=1);

$token = getenv('FR_TEST_REMEMBER_TOKEN');
if ($token !== false && $token !== '') {
    $_COOKIE['remember_me_token'] = $token;
}

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AuthController.php';

$authController = new AuthController();
$authController->checkAuth();
