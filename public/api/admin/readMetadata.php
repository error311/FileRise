<?php
// public/api/admin/readMetadata.php

require_once __DIR__ . '/../../../config/config.php';

// Only admins may read these
if (empty($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

// Must supply ?file=share_links.json or share_folder_links.json
if (empty($_GET['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing `file` parameter']);
    exit;
}

$file = basename($_GET['file']);
$allowed = ['share_links.json', 'share_folder_links.json'];
if (!in_array($file, $allowed, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid file requested']);
    exit;
}

$path = META_DIR . $file;
if (!file_exists($path)) {
    // Return empty object so JS sees `{}` not an error
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode((object)[]);
    exit;
}

$jsonData = file_get_contents($path);
$data = json_decode($jsonData, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
    http_response_code(500);
    echo json_encode(['error' => 'Corrupted JSON']);
    exit;
}

// ——— Clean up expired entries ———
$now = time();
$changed = false;
foreach ($data as $token => $entry) {
    if (!empty($entry['expires']) && $entry['expires'] < $now) {
        unset($data[$token]);
        $changed = true;
    }
}
if ($changed) {
    // overwrite file with cleaned data
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
}

// ——— Send cleaned data back ———
http_response_code(200);
header('Content-Type: application/json');
echo json_encode($data);
exit;