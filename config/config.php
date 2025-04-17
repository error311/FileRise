<?php
// config.php
header("Cache-Control: no-cache, must-revalidate");
header("Expires: Sat, 26 Jul 1997 05:00:00 GMT");
header("Pragma: no-cache");
header("Expires: 0");
header('X-Content-Type-Options: nosniff');
// Security headers
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("Referrer-Policy: no-referrer-when-downgrade");
// Only include Strict-Transport-Security if you are using HTTPS
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    header("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload");
}
header("Permissions-Policy: geolocation=(), microphone=(), camera=()");
header("X-XSS-Protection: 1; mode=block");

// Define constants.
define('PROJECT_ROOT', dirname(__DIR__));
define('UPLOAD_DIR', '/var/www/uploads/');
define('USERS_DIR', '/var/www/users/');
define('USERS_FILE', 'users.txt');
define('META_DIR', '/var/www/metadata/');
define('META_FILE', 'file_metadata.json');
define('TRASH_DIR', UPLOAD_DIR . 'trash/');
define('TIMEZONE', 'America/New_York');
define('DATE_TIME_FORMAT', 'm/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE', '5G');
define('REGEX_FOLDER_NAME', '/^[\p{L}\p{N}_\-\s\/\\\\]+$/u');
define('PATTERN_FOLDER_NAME', '[\p{L}\p{N}_\-\s\/\\\\]+');
define('REGEX_FILE_NAME', '/^[\p{L}\p{N}\p{M}%\-\.\(\) _]+$/u');
define('REGEX_USER', '/^[\p{L}\p{N}_\- ]+$/u');

date_default_timezone_set(TIMEZONE);

/**
 * Encrypts data using AES-256-CBC.
 *
 * @param string $data The plaintext.
 * @param string $encryptionKey The encryption key.
 * @return string Base64-encoded string containing IV and ciphertext.
 */
function encryptData($data, $encryptionKey)
{
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
function decryptData($encryptedData, $encryptionKey)
{
    $cipher = 'AES-256-CBC';
    $data = base64_decode($encryptedData);
    $ivlen = openssl_cipher_iv_length($cipher);
    $iv = substr($data, 0, $ivlen);
    $ciphertext = substr($data, $ivlen);
    return openssl_decrypt($ciphertext, $cipher, $encryptionKey, OPENSSL_RAW_DATA, $iv);
}

// Load encryption key from environment (override in production).
$envKey = getenv('PERSISTENT_TOKENS_KEY');
if ($envKey === false || $envKey === '') {
    $encryptionKey = 'default_please_change_this_key';
    error_log('WARNING: Using default encryption key. Please set PERSISTENT_TOKENS_KEY in your environment.');
} else {
    $encryptionKey = $envKey;
}

function loadUserPermissions($username)
{
    global $encryptionKey;
    $permissionsFile = USERS_DIR . 'userPermissions.json';

    if (file_exists($permissionsFile)) {
        $content = file_get_contents($permissionsFile);

        // Try to decrypt the content.
        $decryptedContent = decryptData($content, $encryptionKey);
        if ($decryptedContent !== false) {
            $permissions = json_decode($decryptedContent, true);
        } else {
            $permissions = json_decode($content, true);
        }

        if (is_array($permissions) && array_key_exists($username, $permissions)) {
            $result = $permissions[$username];
            return !empty($result) ? $result : false;
        }
    }
    // Removed error_log() to prevent flooding logs when file is not found.
    return false; // Return false if no permissions found.
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
// At the very beginning of config.php
/*ini_set('session.save_path', __DIR__ . '/../sessions');
if (!is_dir(__DIR__ . '/../sessions')) {
    mkdir(__DIR__ . '/../sessions', 0777, true);
}*/
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params($cookieParams);
    ini_set('session.gc_maxlifetime', 7200);
    session_start();
}

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
            // IMPORTANT: Set the folderOnly flag here for auto-login.
            $_SESSION["folderOnly"] = loadUserPermissions($tokenData["username"]);
        } else {
            unset($persistentTokens[$_COOKIE['remember_me_token']]);
            $newEncryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $encryptionKey);
            file_put_contents($persistentTokensFile, $newEncryptedContent, LOCK_EX);
            setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
        }
    }
}

define('BASE_URL', 'http://yourwebsite/uploads/');

if (strpos(BASE_URL, 'yourwebsite') !== false) {
    $defaultShareUrl = isset($_SERVER['HTTP_HOST'])
        ? "http://" . $_SERVER['HTTP_HOST'] . "/api/file/share.php"
        : "http://localhost/api/file/share.php";
} else {
    $defaultShareUrl = rtrim(BASE_URL, '/') . "/api/file/share.php";
}
define('SHARE_URL', getenv('SHARE_URL') ? getenv('SHARE_URL') : $defaultShareUrl);
