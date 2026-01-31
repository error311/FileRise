<?php
// public/api/public/profilePic.php

require_once __DIR__ . '/../../../config/config.php';

$raw = $_GET['file'] ?? '';
$name = trim((string)$raw);
if ($name === '') {
    http_response_code(400);
    exit('Missing file');
}

// Normalize and lock to a bare filename.
$name = str_replace('\\', '/', $name);
$name = basename($name);
if ($name === '' || $name === '.' || $name === '..') {
    http_response_code(400);
    exit('Invalid file');
}
if (preg_match('~[\\/\\x00]~', $name)) {
    http_response_code(400);
    exit('Invalid file');
}

$baseDir = rtrim(UPLOAD_DIR, '/\\') . '/profile_pics';
$baseReal = realpath($baseDir);
if ($baseReal === false || !is_dir($baseReal)) {
    http_response_code(404);
    exit('Not found');
}

$path = $baseReal . DIRECTORY_SEPARATOR . $name;
$real = realpath($path);
if ($real === false || strpos($real, $baseReal . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
    http_response_code(404);
    exit('Not found');
}

// Only serve known safe image types (uploads are already constrained).
$allowed = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? finfo_file($finfo, $real) : '';
if ($finfo) finfo_close($finfo);
if (!isset($allowed[$mime])) {
    http_response_code(404);
    exit('Not found');
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$size = @filesize($real);
$mtime = @filemtime($real);

header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=86400');
header('Content-Disposition: inline; filename="' . rawurlencode($name) . '"');
if ($size !== false) {
    header('Content-Length: ' . $size);
}
if ($mtime !== false) {
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
}

readfile($real);
exit;
