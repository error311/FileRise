<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection ---
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
if (
    !$data || 
    !isset($data['source']) || 
    !isset($data['destination']) || 
    !isset($data['files'])
) {
    echo json_encode(["error" => "Invalid request"]);
    exit;
}

$sourceFolder = trim($data['source']);
$destinationFolder = trim($data['destination']);
$files = $data['files'];

// Validate folder names: allow letters, numbers, underscores, dashes, spaces, and forward slashes.
$folderPattern = '/^[A-Za-z0-9_\- \/]+$/';
if ($sourceFolder !== 'root' && !preg_match($folderPattern, $sourceFolder)) {
    echo json_encode(["error" => "Invalid source folder name."]);
    exit;
}
if ($destinationFolder !== 'root' && !preg_match($folderPattern, $destinationFolder)) {
    echo json_encode(["error" => "Invalid destination folder name."]);
    exit;
}

// Trim any leading/trailing slashes and spaces.
$sourceFolder = trim($sourceFolder, "/\\ ");
$destinationFolder = trim($destinationFolder, "/\\ ");

// Build the source and destination directories.
$baseDir = rtrim(UPLOAD_DIR, '/\\');
$sourceDir = ($sourceFolder === 'root') 
    ? $baseDir . DIRECTORY_SEPARATOR 
    : $baseDir . DIRECTORY_SEPARATOR . $sourceFolder . DIRECTORY_SEPARATOR;
$destDir = ($destinationFolder === 'root') 
    ? $baseDir . DIRECTORY_SEPARATOR 
    : $baseDir . DIRECTORY_SEPARATOR . $destinationFolder . DIRECTORY_SEPARATOR;

// Load metadata.
$metadataFile = META_DIR . META_FILE;
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];

// Ensure destination directory exists.
if (!is_dir($destDir)) {
    if (!mkdir($destDir, 0775, true)) {
        echo json_encode(["error" => "Could not create destination folder"]);
        exit;
    }
}

$errors = [];

// Define a safe file name pattern: letters, numbers, underscores, dashes, dots, and spaces.
$safeFileNamePattern = '/^[A-Za-z0-9_\-\. ]+$/';

foreach ($files as $fileName) {
    $basename = basename(trim($fileName));
    // Validate the file name.
    if (!preg_match($safeFileNamePattern, $basename)) {
        $errors[] = "$basename has an invalid name.";
        continue;
    }
    
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