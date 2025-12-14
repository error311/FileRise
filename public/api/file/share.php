<?php
declare(strict_types=1);

// Buffer any accidental output so headers still work
if (ob_get_level() === 0) {
    ob_start();
}

// Never leak notices/warnings into the response (breaks headers + can leak paths)
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');

// Avoid deprecated notices being emitted at all (Termux/PHP 8.4+)
error_reporting(E_ALL & ~E_DEPRECATED);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

(new FileController())->shareFile();