<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

// Check authentication.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data['source']) || !isset($data['destination']) || !isset($data['files'])) {
    echo json_encode(["error" => "Invalid request"]);
    exit;
}

$sourceFolder = trim($data['source']);
$destinationFolder = trim($data['destination']);
$files = $data['files'];

// Build the source and destination directories.
$sourceDir = ($sourceFolder === 'root') ? UPLOAD_DIR : rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $sourceFolder . DIRECTORY_SEPARATOR;
$destDir = ($destinationFolder === 'root') ? UPLOAD_DIR : rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $destinationFolder . DIRECTORY_SEPARATOR;

// Load metadata.
$metadataFile = "file_metadata.json";
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];

// Ensure destination directory exists.
if (!is_dir($destDir)) {
    if (!mkdir($destDir, 0775, true)) {
        echo json_encode(["error" => "Could not create destination folder"]);
        exit;
    }
}

$errors = [];
foreach ($files as $fileName) {
    $basename = basename($fileName);
    $srcPath = $sourceDir . $basename;
    $destPath = $destDir . $basename;
    // Build metadata keys.
    $srcKey = ($sourceFolder === 'root') ? $basename : $sourceFolder . "/" . $basename;
    $destKey = ($destinationFolder === 'root') ? $basename : $destinationFolder . "/" . $basename;
    
    if (!file_exists($srcPath)) {
        $errors[] = "$basename does not exist in source.";
        continue;
    }
    if (!copy($srcPath, $destPath)) {
        $errors[] = "Failed to copy $basename";
        continue;
    }
    // Update metadata: if source key exists, duplicate it to destination key.
    if (isset($metadata[$srcKey])) {
        $metadata[$destKey] = $metadata[$srcKey];
    }
}

if (!file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT))) {
    $errors[] = "Failed to update metadata.";
}

if (empty($errors)) {
    echo json_encode(["success" => "Files copied successfully"]);
} else {
    echo json_encode(["error" => implode("; ", $errors)]);
}
?>
