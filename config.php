<?php
// config.php

// Define constants.

// Main configuration
if (file_exists(__DIR__ . '/config.local.php')) {
    // Load local development settings if available
    require_once(__DIR__ . '/config.local.php');
} else {
    // Default production settings
    define('UPLOAD_DIR', '/var/www/uploads/');
    define('USERS_DIR', '/var/www/users/');
    define('META_DIR', '/var/www/metadata/');
    define('BASE_URL', 'http://yourwebsite/uploads/');
}

define('USERS_FILE', 'users.txt');
define('META_FILE', 'file_metadata.json');
define('TRASH_DIR', UPLOAD_DIR . 'trash/');
define('TIMEZONE', 'America/New_York');
define('DATE_TIME_FORMAT', 'm/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE', '5G');

date_default_timezone_set(TIMEZONE);

/**
 * Encrypts data using AES-256-CBC.
 *
 * @param string $data The plaintext.
 * @param string $encryptionKey The encryption key.
 * @return string Base64-encoded string containing IV and ciphertext.
 */
function encryptData($data, $encryptionKey) {
    $cipher = 'AES-256-CBC';
    $ivlen = openssl_cipher_iv_length($cipher);
    $iv = openssl_random_pseudo_bytes($ivlen);
    $ciphertext = openssl_encrypt($data, $cipher, $encryptionKey, OPENSSL_RAW_DATA, $iv);
    return base64_encode($iv . $ciphertext);
}

/**
 * Decrypts data encrypted with AES-256-CBC.
 *
 * @param string $encryptedData Base64-encoded data containing IV and ciphertext.
 * @param string $encryptionKey The encryption key.
 * @return string|false The decrypted plaintext or false on failure.
 */
function decryptData($encryptedData, $encryptionKey) {
    $cipher = 'AES-256-CBC';
    $data = base64_decode($encryptedData);
    $ivlen = openssl_cipher_iv_length($cipher);
    $iv = substr($data, 0, $ivlen);
    $ciphertext = substr($data, $ivlen);
    return openssl_decrypt($ciphertext, $cipher, $encryptionKey, OPENSSL_RAW_DATA, $iv);
}

// Load encryption key from environment (override in production).
$encryptionKey = getenv('PERSISTENT_TOKENS_KEY') ?: 'default_please_change_this_key';
if (!$encryptionKey) {
    die('Encryption key for persistent tokens is not set.');
}

// Determine whether HTTPS is used.
$envSecure = getenv('SECURE');
if ($envSecure !== false) {
    $secure = filter_var($envSecure, FILTER_VALIDATE_BOOLEAN);
} else {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
}

$cookieParams = [
    'lifetime' => 7200,
    'path'     => '/',
    'domain'   => '', // Set your domain as needed.
    'secure'   => $secure,
    'httponly' => true,
    'samesite' => 'Lax'
];
session_set_cookie_params($cookieParams);
ini_set('session.gc_maxlifetime', 7200);
session_start();

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Auto-login via persistent token.
if (!isset($_SESSION["authenticated"]) && isset($_COOKIE['remember_me_token'])) {
    $persistentTokensFile = USERS_DIR . 'persistent_tokens.json';
    $persistentTokens = [];
    if (file_exists($persistentTokensFile)) {
        $encryptedContent = file_get_contents($persistentTokensFile);
        $decryptedContent = decryptData($encryptedContent, $encryptionKey);
        $persistentTokens = json_decode($decryptedContent, true);
        if (!is_array($persistentTokens)) {
            $persistentTokens = [];
        }
    }
    if (isset($persistentTokens[$_COOKIE['remember_me_token']])) {
        $tokenData = $persistentTokens[$_COOKIE['remember_me_token']];
        if ($tokenData['expiry'] >= time()) {
            $_SESSION["authenticated"] = true;
            $_SESSION["username"] = $tokenData["username"];
        } else {
            unset($persistentTokens[$_COOKIE['remember_me_token']]);
            $newEncryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $encryptionKey);
            file_put_contents($persistentTokensFile, $newEncryptedContent, LOCK_EX);
            setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
        }
    }
}

if (strpos(BASE_URL, 'yourwebsite') !== false) {
    $defaultShareUrl = isset($_SERVER['HTTP_HOST'])
        ? "http://" . $_SERVER['HTTP_HOST'] . "/share.php"
        : "http://localhost/share.php";
} else {
    $defaultShareUrl = rtrim(BASE_URL, '/') . "/share.php";
}
define('SHARE_URL', getenv('SHARE_URL') ? getenv('SHARE_URL') : $defaultShareUrl);
?>