<?php
require_once 'config.php';
header('Content-Type: application/json');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

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
if (!$data || !isset($data['folder']) || !isset($data['oldName']) || !isset($data['newName'])) {
    echo json_encode(["error" => "Invalid input"]);
    exit;
}

$folder = trim($data['folder']) ?: 'root';
// For subfolders, allow letters, numbers, underscores, dashes, spaces, and forward slashes.
if ($folder !== 'root' && !preg_match('/^[A-Za-z0-9_\- \/]+$/', $folder)) {
    echo json_encode(["error" => "Invalid folder name"]);
    exit;
}

$oldName = basename(trim($data['oldName']));
$newName = basename(trim($data['newName']));

// Validate file names: allow letters, numbers, underscores, dashes, dots, and spaces.
if (!preg_match('/^[A-Za-z0-9_\-\. ]+$/', $oldName) || !preg_match('/^[A-Za-z0-9_\-\. ]+$/', $newName)) {
    echo json_encode(["error" => "Invalid file name."]);
    exit;
}

// Determine the directory path based on the folder.
if ($folder !== 'root') {
    $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $directory = UPLOAD_DIR;
}

$oldPath = $directory . $oldName;
$newPath = $directory . $newName;

if (!file_exists($oldPath)) {
    echo json_encode(["error" => "File does not exist"]);
    exit;
}

if (file_exists($newPath)) {
    echo json_encode(["error" => "A file with the new name already exists"]);
    exit;
}

$metadataFile = META_DIR . META_FILE;

if (rename($oldPath, $newPath)) {
    // Update metadata.
    if (file_exists($metadataFile)) {
        $metadata = json_decode(file_get_contents($metadataFile), true);
        // Build metadata keys using the folder (if not root).
        $oldKey = ($folder !== 'root') ? $folder . "/" . $oldName : $oldName;
        $newKey = ($folder !== 'root') ? $folder . "/" . $newName : $newName;
        if (isset($metadata[$oldKey])) {
            $metadata[$newKey] = $metadata[$oldKey];
            unset($metadata[$oldKey]);
            file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
        }
    }
    echo json_encode(["success" => "File renamed successfully"]);
} else {
    echo json_encode(["error" => "Error renaming file"]);
}
?>