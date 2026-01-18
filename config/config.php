<?php
declare(strict_types=1);
// config.php

// Define constants
define('PROJECT_ROOT', dirname(__DIR__));
$testUploadDir = getenv('FR_TEST_UPLOAD_DIR');
$testUsersDir  = getenv('FR_TEST_USERS_DIR');
$testMetaDir   = getenv('FR_TEST_META_DIR');
define(
    'UPLOAD_DIR',
    ($testUploadDir !== false && $testUploadDir !== '')
        ? rtrim($testUploadDir, "/\\") . '/'
        : '/var/www/uploads/'
);
define(
    'USERS_DIR',
    ($testUsersDir !== false && $testUsersDir !== '')
        ? rtrim($testUsersDir, "/\\") . '/'
        : '/var/www/users/'
);
define('USERS_FILE',    'users.txt');
define(
    'META_DIR',
    ($testMetaDir !== false && $testMetaDir !== '')
        ? rtrim($testMetaDir, "/\\") . '/'
        : '/var/www/metadata/'
);
define('META_FILE',     'file_metadata.json');
define('TRASH_DIR',     UPLOAD_DIR . 'trash/');
define('TIMEZONE',      'America/New_York');
define('DATE_TIME_FORMAT','m/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE','5G');
define('REGEX_FOLDER_NAME','/^(?!^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$)(?!.*[. ]$)(?:[^<>:"\/\\\\|?*\x00-\x1F]{1,255})(?:[\/\\\\][^<>:"\/\\\\|?*\x00-\x1F]{1,255})*$/xu');
define('PATTERN_FOLDER_NAME','[\p{L}\p{N}_\-\s\/\\\\]+');
define('REGEX_FILE_NAME', '/^[^\x00-\x1F\/\\\\]{1,255}$/u');
define('REGEX_USER',       '/^[\p{L}\p{N}_\- ]+$/u');
define('FR_DEMO_MODE', false);

date_default_timezone_set(TIMEZONE);

if (!defined('DEFAULT_BYPASS_OWNERSHIP')) define('DEFAULT_BYPASS_OWNERSHIP', false);
if (!defined('DEFAULT_CAN_SHARE'))        define('DEFAULT_CAN_SHARE', true);
if (!defined('DEFAULT_CAN_ZIP'))          define('DEFAULT_CAN_ZIP', true);
if (!defined('DEFAULT_VIEW_OWN_ONLY'))    define('DEFAULT_VIEW_OWN_ONLY', false);
define('FOLDER_OWNERS_FILE', META_DIR . 'folder_owners.json');
define('ACL_INHERIT_ON_CREATE', true);
// Hidden file used to preserve empty remote folders (S3 prefixes, etc.).
if (!defined('FR_REMOTE_DIR_MARKER')) define('FR_REMOTE_DIR_MARKER', '.filerise_keep');
// ONLYOFFICE integration overrides (uncomment and set as needed)
/*
define('ONLYOFFICE_ENABLED', false);
define('ONLYOFFICE_JWT_SECRET', 'test123456');
define('ONLYOFFICE_DOCS_ORIGIN', 'http://192.168.1.61'); // your Document Server
define('ONLYOFFICE_DEBUG', true);
*/
if (!defined('OFFICE_SNIPPET_MAX_BYTES')) {
    define('OFFICE_SNIPPET_MAX_BYTES', 5 * 1024 * 1024); // 5 MiB
}

if (!defined('OIDC_TOKEN_ENDPOINT_AUTH_METHOD')) {
    define('OIDC_TOKEN_ENDPOINT_AUTH_METHOD', 'client_secret_basic'); // default
}
// --- Optional: OIDC → FileRise integration ----------------------------

// Auto-create users from OIDC when no users.txt match.
if (!defined('FR_OIDC_AUTO_CREATE')) {
    $envVal = getenv('FR_OIDC_AUTO_CREATE');
    if ($envVal !== false && $envVal !== '') {
        $val = strtolower(trim((string)$envVal));
        define('FR_OIDC_AUTO_CREATE', in_array($val, ['1', 'true', 'yes', 'on'], true));
    } else {
        define('FR_OIDC_AUTO_CREATE', true);
    }
}

// Claim that contains IdP groups/roles (typical: "groups" or "roles").
if (!defined('FR_OIDC_GROUP_CLAIM')) {
    $envVal = getenv('FR_OIDC_GROUP_CLAIM');
    define(
        'FR_OIDC_GROUP_CLAIM',
        ($envVal !== false && trim((string)$envVal) !== '') ? trim((string)$envVal) : 'groups'
    );
}

// Name of an IdP group that should be treated as "FileRise admin".
if (!defined('FR_OIDC_ADMIN_GROUP')) {
    $envVal = getenv('FR_OIDC_ADMIN_GROUP');
    if ($envVal !== false) {
        define('FR_OIDC_ADMIN_GROUP', trim((string)$envVal));
    } else {
        define('FR_OIDC_ADMIN_GROUP', 'filerise-admins');
    }
}

// Prefix for IdP groups that should map into FileRise Pro groups.
// Example: IdP group "frp_clients_acme" → Pro group "clients_acme".
if (!defined('FR_OIDC_PRO_GROUP_PREFIX')) {
    $envVal = getenv('FR_OIDC_PRO_GROUP_PREFIX');
    define('FR_OIDC_PRO_GROUP_PREFIX', ($envVal !== false) ? trim((string)$envVal) : '');
}
// Optional env/constant override: if set, it wins; if not set, UI setting is used.
if (!defined('FR_OIDC_ALLOW_DEMOTE')) {
    $envVal = getenv('FR_OIDC_ALLOW_DEMOTE');

    if ($envVal !== false && $envVal !== '') {
        $val = strtolower(trim((string)$envVal));
        define('FR_OIDC_ALLOW_DEMOTE', $val === '1' || $val === 'true');
    }
    // IMPORTANT: no "else" here ⇒ if env is not set, we do NOT define the constant,
    // so AuthModel::isOidcDemoteAllowed() will fall back to AdminModel::getConfig().
}
if (!defined('FR_OIDC_DEBUG')) {
    $envVal = getenv('FR_OIDC_DEBUG');
    if ($envVal !== false && $envVal !== '') {
        $val = strtolower(trim((string)$envVal));
        define('FR_OIDC_DEBUG', in_array($val, ['1', 'true', 'yes', 'on'], true));
    } else {
        define('FR_OIDC_DEBUG', false);
    }
}
// Optional: trusted proxy IP resolution for rate limiting/logging
// Set FR_TRUSTED_PROXIES to a comma-separated list of IPs/CIDRs (e.g. "127.0.0.1,10.0.0.0/8").
if (!defined('FR_TRUSTED_PROXIES')) {
    $envVal = getenv('FR_TRUSTED_PROXIES');
    define('FR_TRUSTED_PROXIES', ($envVal !== false && $envVal !== '') ? $envVal : '');
}
// Which header to trust when REMOTE_ADDR matches FR_TRUSTED_PROXIES.
if (!defined('FR_IP_HEADER')) {
    $envVal = getenv('FR_IP_HEADER');
    define('FR_IP_HEADER', ($envVal !== false && $envVal !== '') ? $envVal : 'X-Forwarded-For');
}
// Optional: WebDAV max upload size in bytes (0 = unlimited)
if (!defined('FR_WEBDAV_MAX_UPLOAD_BYTES')) {
    $envVal = getenv('FR_WEBDAV_MAX_UPLOAD_BYTES');
    if ($envVal !== false && $envVal !== '') {
        $val = (int)$envVal;
        define('FR_WEBDAV_MAX_UPLOAD_BYTES', $val > 0 ? $val : 0);
    } else {
        define('FR_WEBDAV_MAX_UPLOAD_BYTES', 0);
    }
}
// Antivirus / ClamAV (optional)
// If VIRUS_SCAN_ENABLED is set in the environment, it overrides the admin setting.
// If it is not set, we don't define the constant and the admin checkbox controls scanning.
$envScanRaw = getenv('VIRUS_SCAN_ENABLED');
if ($envScanRaw !== false && $envScanRaw !== '') {
    $val = strtolower(trim((string)$envScanRaw));
    $enabled = in_array($val, ['1', 'true', 'yes', 'on'], true);
    define('VIRUS_SCAN_ENABLED', $enabled);
}

// Which scanner command to run. Can be "clamscan" or "clamdscan" (faster with clamd).
define('VIRUS_SCAN_CMD', getenv('VIRUS_SCAN_CMD') ?: 'clamscan');

// Optional: max time you consider acceptable for a scan (for logging / future timeout logic)
define('VIRUS_SCAN_TIMEOUT', 60);

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
    if (!file_exists($permissionsFile)) {
        return false;
    }

    $content   = file_get_contents($permissionsFile);
    $decrypted = decryptData($content, $encryptionKey);
    $json      = ($decrypted !== false) ? $decrypted : $content;
    $permsAll  = json_decode($json, true);

    if (!is_array($permsAll)) {
        return false;
    }

    // Try exact match first, then lowercase (since we store keys lowercase elsewhere)
    $uExact = (string)$username;
    $uLower = strtolower($uExact);

    $row = $permsAll[$uExact] ?? $permsAll[$uLower] ?? null;

    // Normalize: always return an array when found, else false (to preserve current callers’ behavior)
    return is_array($row) ? $row : false;
}

// Determine HTTPS usage
$envSecure = getenv('SECURE');
$secure = ($envSecure !== false)
    ? filter_var($envSecure, FILTER_VALIDATE_BOOLEAN)
    : (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');


// PHP session lifetime (independent of "remember me")
// Keep this reasonably short; "remember me" uses its own token.
$defaultSession  = 7200;              // 2 hours
$sessionLifetime = $defaultSession;

// "Remember me" window (how long the persistent token itself is valid)
// This is used in persistent_tokens.json, *not* for PHP session lifetime.
$persistentDays  = 30 * 24 * 60 * 60; // 30 days

/**
 * Start session idempotently:
 * - If no session: set cookie params + gc_maxlifetime, then session_start().
 * - If session already active: DO NOT change ini/cookie params; optionally refresh cookie expiry.
 */
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => $sessionLifetime,
        'path'     => '/',
        'domain'   => '',      // adjust if you need a specific domain
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    ini_set('session.gc_maxlifetime', (string)$sessionLifetime);
    session_start();
} else {
    // Optionally refresh the session cookie expiry to keep the user alive
    $params = session_get_cookie_params();
    if ($sessionLifetime > 0) {
        setcookie(session_name(), session_id(), [
            'expires'  => time() + $sessionLifetime,
            'path'     => $params['path']     ?: '/',
            'domain'   => $params['domain']   ?? '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }
}

// CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Auto-login via persistent token
if (empty($_SESSION["authenticated"]) && !empty($_COOKIE['remember_me_token'])) {
    require_once PROJECT_ROOT . '/src/models/AuthModel.php';
    $payload = AuthModel::consumeRememberToken($_COOKIE['remember_me_token']);
    if ($payload) {
        // NEW: mitigate session fixation
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }

        $_SESSION["authenticated"] = true;
        $_SESSION["username"]      = $payload["username"];
        $perms = loadUserPermissions($payload["username"]);
        $_SESSION["folderOnly"]    = $perms['folderOnly']    ?? false;
        $_SESSION["readOnly"]      = $perms['readOnly']      ?? false;
        $_SESSION["disableUpload"] = $perms['disableUpload'] ?? false;
        $_SESSION["isAdmin"]       = !empty($payload["isAdmin"]);

        if (!empty($payload['token']) && !empty($payload['expiry'])) {
            setcookie('remember_me_token', $payload['token'], (int)$payload['expiry'], '/', '', $secure, true);
        }
    } else {
        setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
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

// Base path support (optional):
// - If FileRise is served under a subpath (e.g. https://example.com/fr),
//   set `FR_BASE_PATH=/fr` or send `X-Forwarded-Prefix: /fr` from the proxy.
// - When not set, defaults to "" (root install) to preserve existing behavior.
function fr_normalize_base_path($raw)
{
    $p = trim((string)$raw);
    if ($p === '' || $p === '/') return '';
    // Reject full URLs or scheme-relative prefixes to avoid open redirects.
    if (preg_match('~^[a-z][a-z0-9+.-]*://~i', $p)) return '';
    if (strpos($p, '//') === 0) return '';
    // Normalize slashes and strip query/fragment if provided.
    $p = str_replace('\\', '/', $p);
    $p = preg_replace('/[?#].*$/', '', $p);
    if ($p === '' || $p === '/') return '';
    if ($p[0] !== '/') $p = '/' . $p;
    $p = preg_replace('~/+~', '/', $p);
    // Disallow path traversal segments.
    if (preg_match('~(^|/)\.\.(?:/|$)~', $p)) return '';
    // strip trailing slashes
    return preg_replace('~/+$~', '', $p) ?: '';
}

function fr_detect_base_path()
{
    // 1) Explicit env override
    $env = getenv('FR_BASE_PATH');
    if ($env !== false && trim((string)$env) !== '') {
        return fr_normalize_base_path($env);
    }

    // 2) Reverse proxies often provide this
    $xfp = $_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? '';
    if (is_string($xfp) && trim($xfp) !== '') {
        return fr_normalize_base_path($xfp);
    }

    // 3) If deployed in a real subdirectory (not stripped by proxy),
    //    SCRIPT_NAME/REQUEST_URI will include the prefix (e.g. /fr/api/...).
    $candidates = [];
    if (!empty($_SERVER['SCRIPT_NAME']) && is_string($_SERVER['SCRIPT_NAME'])) $candidates[] = $_SERVER['SCRIPT_NAME'];
    if (!empty($_SERVER['REQUEST_URI']) && is_string($_SERVER['REQUEST_URI'])) {
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        if (is_string($path) && $path !== '') $candidates[] = $path;
    }

    foreach ($candidates as $p) {
        if (preg_match('~^(.*)/api(?:/|\\.php$)~i', $p, $m)) return fr_normalize_base_path($m[1]);
        if (preg_match('~^(.*)/webdav\\.php$~i', $p, $m)) return fr_normalize_base_path($m[1]);
        if (preg_match('~^(.*)/index\\.html$~i', $p, $m)) return fr_normalize_base_path($m[1]);
        if (preg_match('~^(.*)/portal-login\\.html$~i', $p, $m)) return fr_normalize_base_path($m[1]);
        if (preg_match('~^(.*)/portal\\.html$~i', $p, $m)) return fr_normalize_base_path($m[1]);
    }

    return '';
}

if (!defined('FR_BASE_PATH')) {
    define('FR_BASE_PATH', fr_detect_base_path());
}

function fr_with_base_path($path)
{
    $p = (string)$path;
    $bp = defined('FR_BASE_PATH') ? (string)FR_BASE_PATH : '';
    if ($bp === '' || $p === '' || $p[0] !== '/') return $p;
    if ($p === $bp || strpos($p, $bp . '/') === 0) return $p;
    return $bp . $p;
}

if (strpos(BASE_URL, 'yourwebsite') !== false) {
    $defaultShare = "{$proto}://{$host}" . fr_with_base_path("/api/file/share.php");
} else {
    $defaultShare = rtrim(BASE_URL, '/') . "/api/file/share.php";
}

// Final: env var wins, else fallback
// Optional: Published URL override (preferred: env, optional: admin config).
// This is the canonical URL FileRise should advertise (e.g. "https://example.com/fr").
function fr_sanitize_http_url($url)
{
    $u = trim((string)$url);
    if ($u === '') return '';
    if (!filter_var($u, FILTER_VALIDATE_URL)) return '';
    $scheme = strtolower(parse_url($u, PHP_URL_SCHEME) ?: '');
    if ($scheme !== 'http' && $scheme !== 'https') return '';
    return $u;
}

function fr_read_admin_config_raw(): array
{
    try {
        $configFile = USERS_DIR . 'adminConfig.json';
        if (!is_file($configFile)) return [];
        $encryptedContent = @file_get_contents($configFile);
        if (!is_string($encryptedContent) || $encryptedContent === '') return [];
        $dec = decryptData($encryptedContent, $GLOBALS['encryptionKey']);
        if ($dec === false) return [];
        $cfg = json_decode($dec, true);
        return is_array($cfg) ? $cfg : [];
    } catch (Throwable $e) {
        return [];
    }
}

$envPublished = getenv('FR_PUBLISHED_URL');
$published = '';
if ($envPublished !== false && trim((string)$envPublished) !== '') {
    $published = fr_sanitize_http_url($envPublished);
} else {
    $adminCfg = fr_read_admin_config_raw();
    $published = fr_sanitize_http_url($adminCfg['publishedUrl'] ?? '');
}

if (!defined('FR_PUBLISHED_URL_EFFECTIVE')) {
    define('FR_PUBLISHED_URL_EFFECTIVE', $published);
}

$envShare = getenv('SHARE_URL');
if ($envShare !== false && trim((string)$envShare) !== '') {
    define('SHARE_URL', (string)$envShare);
} elseif ($published !== '') {
    define('SHARE_URL', rtrim($published, '/') . '/api/file/share.php');
} else {
    define('SHARE_URL', $defaultShare);
}

// ------------------------------------------------------------
// FileRise Pro bootstrap wiring
// ------------------------------------------------------------

// Inline license (optional; usually set via Admin UI and PRO_LICENSE_FILE)
if (!defined('FR_PRO_LICENSE')) {
    $envLicense = getenv('FR_PRO_LICENSE');
    define('FR_PRO_LICENSE', $envLicense !== false ? trim((string)$envLicense) : '');
}

// JSON license file used by AdminController::setLicense()
if (!defined('PRO_LICENSE_FILE')) {
    define('PRO_LICENSE_FILE', rtrim(USERS_DIR, "/\\") . '/proLicense.json');
}

// Optional plain-text license file (used as fallback in bootstrap)
if (!defined('FR_PRO_LICENSE_FILE')) {
    $lf = getenv('FR_PRO_LICENSE_FILE');
    if ($lf === false || $lf === '') {
        $lf = rtrim(USERS_DIR, "/\\") . '/proLicense.txt';
    }
    define('FR_PRO_LICENSE_FILE', $lf);
}

// Where Pro code lives by default → inside users volume
$proDir = getenv('FR_PRO_BUNDLE_DIR');
if ($proDir === false || $proDir === '') {
    $proDir = rtrim(USERS_DIR, "/\\") . '/pro';
}
$proDir = rtrim($proDir, "/\\");
if (!defined('FR_PRO_BUNDLE_DIR')) {
    define('FR_PRO_BUNDLE_DIR', $proDir);
}

// Try to load Pro bootstrap if enabled + present
$proBootstrap = FR_PRO_BUNDLE_DIR . '/bootstrap_pro.php';
if (@is_file($proBootstrap)) {
    require_once $proBootstrap;
}

// If bootstrap didn’t define these, give safe defaults
if (!defined('FR_PRO_ACTIVE')) {
    define('FR_PRO_ACTIVE', false);
}
if (!defined('FR_PRO_INFO')) {
    define('FR_PRO_INFO', [
        'valid'   => false,
        'error'   => null,
        'payload' => null,
    ]);
}
if (!defined('FR_PRO_BUNDLE_VERSION')) {
    define('FR_PRO_BUNDLE_VERSION', null);
}

// ------------------------------------------------------------
// Pro / Core API-level compatibility helpers
// ------------------------------------------------------------

if (!defined('FR_CORE_API_LEVEL')) {
    define('FR_CORE_API_LEVEL', 1);
}

if (!function_exists('fr_pro_api_level_from_version')) {
    function fr_pro_api_level_from_version(?string $version): int
    {
        $v = trim((string)$version);
        if ($v === '') return 0;
        $v = ltrim($v, "vV");
        $parts = explode('.', $v);
        $major = (isset($parts[0]) && ctype_digit($parts[0])) ? (int)$parts[0] : 0;
        $minor = (isset($parts[1]) && ctype_digit($parts[1])) ? (int)$parts[1] : 0;
        if ($major <= 0) return 0;
        if ($major === 1) {
            return max(0, $minor);
        }
        return ($major * 100) + max(0, $minor);
    }
}

if (!defined('FR_PRO_API_LEVEL')) {
    define('FR_PRO_API_LEVEL', fr_pro_api_level_from_version(
        defined('FR_PRO_BUNDLE_VERSION') ? (string)FR_PRO_BUNDLE_VERSION : ''
    ));
}

if (!function_exists('fr_pro_api_level_at_least')) {
    function fr_pro_api_level_at_least(int $required): bool
    {
        $current = defined('FR_PRO_API_LEVEL') ? (int)FR_PRO_API_LEVEL : 0;
        return $current >= $required;
    }
}

if (!defined('FR_PRO_API_REQUIRE_DISK_USAGE')) {
    define('FR_PRO_API_REQUIRE_DISK_USAGE', 2);
}
if (!defined('FR_PRO_API_REQUIRE_SEARCH')) {
    define('FR_PRO_API_REQUIRE_SEARCH', 3);
}
if (!defined('FR_PRO_API_REQUIRE_AUDIT')) {
    define('FR_PRO_API_REQUIRE_AUDIT', 4);
}
if (!defined('FR_PRO_API_REQUIRE_SOURCES')) {
    define('FR_PRO_API_REQUIRE_SOURCES', 5);
}
