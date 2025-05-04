<?php
// public/api/admin/readMetadata.php

require_once __DIR__ . '/../../../config/config.php';

// Simple auth‐check: only admins may read these
if (empty($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true) {
    http_response_code(403);
    echo json_encode(['error'=>'Forbidden']);
    exit;
}

// Expect a ?file=share_links.json or share_folder_links.json
if (empty($_GET['file'])) {
    http_response_code(400);
    echo json_encode(['error'=>'Missing `file` parameter']);
    exit;
}

$file = basename($_GET['file']);
$allowed = ['share_links.json','share_folder_links.json'];
if (!in_array($file, $allowed, true)) {
    http_response_code(403);
    echo json_encode(['error'=>'Invalid file requested']);
    exit;
}

$path = META_DIR . $file;
if (!file_exists($path)) {
    http_response_code(404);
    echo json_encode((object)[]);  // return empty object
    exit;
}

$data = file_get_contents($path);
$json = json_decode($data, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    echo json_encode(['error'=>'Corrupted JSON']);
    exit;
}

header('Content-Type: application/json');
echo json_encode($json);