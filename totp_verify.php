<?php
// totp_verify.php

require_once 'vendor/autoload.php';
require_once 'config.php';

// Secure session cookie
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'domain'   => '',        // your domain
    'secure'   => true,      // only over HTTPS
    'httponly' => true,
    'samesite' => 'Lax'
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// JSON + CSP
header('Content-Type: application/json');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';");

try {
    // standardized error helper
    function respond($status, $code, $message, $data = []) {
        http_response_code($code);
        echo json_encode([
            'status'  => $status,
            'code'    => $code,
            'message' => $message,
            'data'    => $data
        ]);
        exit;
    }

    // Rate‑limit TOTP attempts
    if (!isset($_SESSION['totp_failures'])) {
        $_SESSION['totp_failures'] = 0;
    }
    if ($_SESSION['totp_failures'] >= 5) {
        respond('error', 429, 'Too many TOTP attempts. Please try again later.');
    }

    /**
     * Helper: Get a user's role from users.txt
     */
    function getUserRole(string $username): ?string {
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) return null;
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 3 && $parts[0] === $username) {
                return trim($parts[2]);
            }
        }
        return null;
    }

    // Must be authenticated or pending TOTP
    if (
        !(
            (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true)
            || isset($_SESSION['pending_login_user'])
        )
    ) {
        respond('error', 403, 'Not authenticated');
    }

    // CSRF check
    $csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!isset($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
        respond('error', 403, 'Invalid CSRF token');
    }

    // Parse & validate input
    $input = json_decode(file_get_contents("php://input"), true);
    $code  = trim($input['totp_code'] ?? '');
    if (!preg_match('/^\d{6}$/', $code)) {
        respond('error', 400, 'A valid 6-digit TOTP code is required');
    }

    // LOGIN flow (Basic‑Auth or OIDC)
    if (isset($_SESSION['pending_login_user'])) {
        $username   = $_SESSION['pending_login_user'];
        $totpSecret = $_SESSION['pending_login_secret'];
        $tfa        = new \RobThree\Auth\TwoFactorAuth('FileRise');

        if (!$tfa->verifyCode($totpSecret, $code)) {
            $_SESSION['totp_failures']++;
            respond('error', 400, 'Invalid TOTP code');
        }

        // success → complete login
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        $_SESSION['username']      = $username;
        $_SESSION['isAdmin']       = (getUserRole($username) === "1");
        $_SESSION['folderOnly']    = loadUserPermissions($username);

        unset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret'], $_SESSION['totp_failures']);

        respond('ok', 200, 'Login successful');
    }

    // SETUP‑VERIFICATION flow
    $username = $_SESSION['username'] ?? '';
    if (!$username) {
        respond('error', 400, 'Username not found in session');
    }

    /**
     * Helper: retrieve the user's TOTP secret from users.txt
     */
    function getUserTOTPSecret(string $username): ?string {
        global $encryptionKey;
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) return null;
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
                return decryptData($parts[3], $encryptionKey);
            }
        }
        return null;
    }

    $totpSecret = getUserTOTPSecret($username);
    if (!$totpSecret) {
        respond('error', 500, 'TOTP secret not found. Please set up TOTP again.');
    }

    $tfa = new \RobThree\Auth\TwoFactorAuth('FileRise');
    if (!$tfa->verifyCode($totpSecret, $code)) {
        $_SESSION['totp_failures']++;
        respond('error', 400, 'Invalid TOTP code');
    }

    // success
    unset($_SESSION['totp_failures']);
    respond('ok', 200, 'TOTP successfully verified');

} catch (\Throwable $e) {
    // log error internally, then generic response
    error_log("totp_verify error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'code'    => 500,
        'message' => 'Internal server error'
    ]);
    exit;
}