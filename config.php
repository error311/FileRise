<?php
// config.php
define('UPLOAD_DIR', '/var/www/uploads/');
define('BASE_URL', 'http://yourwebsite/uploads/');
define('TIMEZONE', 'America/New_York');
define('DATE_TIME_FORMAT', 'm/d/y  h:iA');
define('TOTAL_UPLOAD_SIZE', '5G');
define('USERS_FILE', '/var/www/uploads/users.txt');
date_default_timezone_set(TIMEZONE);
?>
