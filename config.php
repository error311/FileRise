<?php
session_set_cookie_params(7200); // 2 hours in seconds
ini_set('session.gc_maxlifetime', 7200);
session_start();
// config.php
define('UPLOAD_DIR', '/var/www/uploads/');
define('BASE_URL', 'http://yourwebsite/uploads/');
define('TIMEZONE', 'America/New_York');
define('DATE_TIME_FORMAT', 'm/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE', '5G');
define('USERS_DIR', '/var/www/users/');
define('USERS_FILE', 'users.txt');
define('META_DIR','/var/www/metadata/');
define('META_FILE','file_metadata.json');
date_default_timezone_set(TIMEZONE);
?>