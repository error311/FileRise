<?php
declare(strict_types=1);

$sessionDir = getenv('FR_TEST_SESSION_DIR');
if (is_string($sessionDir) && $sessionDir !== '') {
    session_save_path($sessionDir);
}

$token = getenv('FR_TEST_REMEMBER_TOKEN');
if ($token !== false && $token !== '') {
    $_COOKIE['remember_me_token'] = $token;
}

require_once __DIR__ . '/../../config/config.php';

$authController = new \FileRise\Http\Controllers\AuthController();
$authController->checkAuth();
