<?php
// config.php

// Prevent caching
header("Cache-Control: no-cache, must-revalidate");
header("Pragma: no-cache");
header("Expires: Sat, 26 Jul 1997 05:00:00 GMT");
header("Expires: 0");

// Security headers
header('X-Content-Type-Options: nosniff');
header("X-Frame-Options: SAMEORIGIN");
header("Referrer-Policy: no-referrer-when-downgrade");
header("Permissions-Policy: geolocation=(), microphone=(), camera=()");
header("X-XSS-Protection: 1; mode=block");
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    header("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload");
}

// Define constants
define('PROJECT_ROOT', dirname(__DIR__));
define('UPLOAD_DIR',    '/var/www/uploads/');
define('USERS_DIR',     '/var/www/users/');
define('USERS_FILE',    'users.txt');
define('META_DIR',      '/var/www/metadata/');
define('META_FILE',     'file_metadata.json');
define('TRASH_DIR',     UPLOAD_DIR . 'trash/');
define('TIMEZONE',      'America/New_York');
define('DATE_TIME_FORMAT','m/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE','5G');
define('REGEX_FOLDER_NAME','/^(?!^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$)(?!.*[. ]$)(?:[^<>:"\/\\\\|?*\x00-\x1F]{1,255})(?:[\/\\\\][^<>:"\/\\\\|?*\x00-\x1F]{1,255})*$/xu');
define('PATTERN_FOLDER_NAME','[\p{L}\p{N}_\-\s\/\\\\]+');
define('REGEX_FILE_NAME', '/^[^\x00-\x1F\/\\\\]{1,255}$/u');
define('REGEX_USER',       '/^[\p{L}\p{N}_\- ]+$/u');

date_default_timezone_set(TIMEZONE);


// Encryption helpers
function encryptData($data, $encryptionKey)
{
    $cipher = 'AES-256-CBC';
    $ivlen  = openssl_cipher_iv_length($cipher);
    $iv     = openssl_random_pseudo_bytes($ivlen);
    $ct     = openssl_encrypt($data, $cipher, $encryptionKey, OPENSSL_RAW_DATA, $iv);
    return base64_encode($iv . $ct);
}

function decryptData($encryptedData, $encryptionKey)
{
    $cipher = 'AES-256-CBC';
    $data   = base64_decode($encryptedData);
    $ivlen  = openssl_cipher_iv_length($cipher);
    $iv     = substr($data, 0, $ivlen);
    $ct     = substr($data, $ivlen);
    return openssl_decrypt($ct, $cipher, $encryptionKey, OPENSSL_RAW_DATA, $iv);
}

// Load encryption key
$envKey = getenv('PERSISTENT_TOKENS_KEY');
if ($envKey === false || $envKey === '') {
    $encryptionKey = 'default_please_change_this_key';
    error_log('WARNING: Using default encryption key. Please set PERSISTENT_TOKENS_KEY in your environment.');
} else {
    $encryptionKey = $envKey;
}

// Helper to load JSON permissions (with optional decryption)
function loadUserPermissions($username)
{
    global $encryptionKey;
    $permissionsFile = USERS_DIR . 'userPermissions.json';
    if (file_exists($permissionsFile)) {
        $content = file_get_contents($permissionsFile);
        $decrypted = decryptData($content, $encryptionKey);
        $json = ($decrypted !== false) ? $decrypted : $content;
        $perms = json_decode($json, true);
        if (is_array($perms) && isset($perms[$username])) {
            return !empty($perms[$username]) ? $perms[$username] : false;
        }
    }
    return false;
}

// Determine HTTPS usage
$envSecure = getenv('SECURE');
$secure = ($envSecure !== false)
    ? filter_var($envSecure, FILTER_VALIDATE_BOOLEAN)
    : (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

// Choose session lifetime based on "remember me" cookie
$defaultSession = 7200;           // 2 hours
$persistentDays = 30 * 24 * 60 * 60; // 30 days
$sessionLifetime = isset($_COOKIE['remember_me_token'])
    ? $persistentDays
    : $defaultSession;

// Configure PHP session cookie and GC
session_set_cookie_params([
    'lifetime' => $sessionLifetime,
    'path'     => '/',
    'domain'   => '',      // adjust if you need a specific domain
    'secure'   => $secure,
    'httponly' => true,
    'samesite' => 'Lax'
]);
ini_set('session.gc_maxlifetime', (string)$sessionLifetime);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}


// Auto‑login via persistent token
if (empty($_SESSION["authenticated"]) && !empty($_COOKIE['remember_me_token'])) {
    $tokFile = USERS_DIR . 'persistent_tokens.json';
    $tokens = [];
    if (file_exists($tokFile)) {
        $enc = file_get_contents($tokFile);
        $dec = decryptData($enc, $encryptionKey);
        $tokens = json_decode($dec, true) ?: [];
    }
    $token = $_COOKIE['remember_me_token'];
    if (!empty($tokens[$token])) {
        $data = $tokens[$token];
        if ($data['expiry'] >= time()) {
            $_SESSION["authenticated"] = true;
            $_SESSION["username"]      = $data["username"];
            $_SESSION["folderOnly"]    = loadUserPermissions($data["username"]);
            $_SESSION["isAdmin"]       = !empty($data["isAdmin"]);
        } else {
            // expired — clean up
            unset($tokens[$token]);
            file_put_contents($tokFile, encryptData(json_encode($tokens, JSON_PRETTY_PRINT), $encryptionKey), LOCK_EX);
            setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
        }
    }
}

$adminConfigFile = USERS_DIR . 'adminConfig.json';

// sane defaults:
$cfgAuthBypass = false;
$cfgAuthHeader = 'X_REMOTE_USER';

if (file_exists($adminConfigFile)) {
    $encrypted = file_get_contents($adminConfigFile);
    $decrypted = decryptData($encrypted, $encryptionKey);
    $adminCfg  = json_decode($decrypted, true) ?: [];

    $loginOpts = $adminCfg['loginOptions'] ?? [];

    // proxy-only bypass flag
    $cfgAuthBypass = ! empty($loginOpts['authBypass']);

    // header name (e.g. “X-Remote-User” → HTTP_X_REMOTE_USER)
    $hdr = trim($loginOpts['authHeaderName'] ?? '');
    if ($hdr === '') {
        $hdr = 'X-Remote-User';
    }
    // normalize to PHP’s $_SERVER key format:
    $cfgAuthHeader = 'HTTP_' . strtoupper(str_replace('-', '_', $hdr));
}

define('AUTH_BYPASS',  $cfgAuthBypass);
define('AUTH_HEADER',  $cfgAuthHeader);

// ─────────────────────────────────────────────────────────────────────────────
// PROXY-ONLY AUTO–LOGIN now uses those constants:
if (AUTH_BYPASS) {
    $hdrKey = AUTH_HEADER;   // e.g. "HTTP_X_REMOTE_USER"
    if (!empty($_SERVER[$hdrKey])) {
        // regenerate once per session
        if (empty($_SESSION['authenticated'])) {
            session_regenerate_id(true);
        }

        $username = $_SERVER[$hdrKey];
        $_SESSION['authenticated'] = true;
        $_SESSION['username']      = $username;

        // ◾ lookup actual role instead of forcing admin
        require_once PROJECT_ROOT . '/src/models/AuthModel.php';
        $role = AuthModel::getUserRole($username);
        $_SESSION['isAdmin'] = ($role === '1');

        // carry over any folder/read/upload perms
        $perms = loadUserPermissions($username) ?: [];
        $_SESSION['folderOnly']    = $perms['folderOnly']    ?? false;
        $_SESSION['readOnly']      = $perms['readOnly']      ?? false;
        $_SESSION['disableUpload'] = $perms['disableUpload'] ?? false;
    }
}

// Share URL fallback (keep BASE_URL behavior)
define('BASE_URL', 'http://yourwebsite/uploads/');

// Detect scheme correctly (works behind proxies too)
$proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? (
           (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http'
         );
$host  = $_SERVER['HTTP_HOST'] ?? 'localhost';

if (strpos(BASE_URL, 'yourwebsite') !== false) {
    $defaultShare = "{$proto}://{$host}/api/file/share.php";
} else {
    $defaultShare = rtrim(BASE_URL, '/') . "/api/file/share.php";
}

// Final: env var wins, else fallback
define('SHARE_URL', getenv('SHARE_URL') ?: $defaultShare);