<?php
// config.php

// Allow an environment variable to override HTTPS detection.
$envSecure = getenv('SECURE');
if ($envSecure !== false) {
    // Convert the environment variable value to a boolean.
    $secure = filter_var($envSecure, FILTER_VALIDATE_BOOLEAN);
} else {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
}

$cookieParams = [
    'lifetime' => 7200,
    'path'     => '/',
    'domain'   => '', // Specify your domain if needed
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

// Define BASE_URL (this should point to where index.html is, e.g. your uploads directory)
define('BASE_URL', 'http://yourwebsite/uploads/');

// If BASE_URL is still the default placeholder, use the server's HTTP_HOST.
// Otherwise, use BASE_URL and append share.php.
if (strpos(BASE_URL, 'yourwebsite') !== false) {
    $defaultShareUrl = isset($_SERVER['HTTP_HOST'])
        ? "http://" . $_SERVER['HTTP_HOST'] . "/share.php"
        : "http://localhost/share.php";
} else {
    $defaultShareUrl = rtrim(BASE_URL, '/') . "/share.php";
}

define('SHARE_URL', getenv('SHARE_URL') ? getenv('SHARE_URL') : $defaultShareUrl);

define('UPLOAD_DIR', '/var/www/uploads/');
define('TIMEZONE', 'America/New_York');
define('DATE_TIME_FORMAT', 'm/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE', '5G');
define('USERS_DIR', '/var/www/users/');
define('USERS_FILE', 'users.txt');
define('META_DIR','/var/www/metadata/');
define('META_FILE','file_metadata.json');
define('TRASH_DIR', UPLOAD_DIR . 'trash/');
date_default_timezone_set(TIMEZONE);
?>