<?php
require 'config.php';
header('Content-Type: application/json');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Ensure the request method is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method.']);
    exit;
}

// CSRF Protection: Read token from the custom header "X-CSRF-Token"
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(['success' => false, 'error' => 'Invalid CSRF token.']);
    http_response_code(403);
    exit;
}

// Get the JSON input and decode it
$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
    echo json_encode(['success' => false, 'error' => 'Required folder names not provided.']);
    exit;
}

$oldFolder = trim($input['oldFolder']);
$newFolder = trim($input['newFolder']);

// Validate folder names
if (!preg_match('/^[A-Za-z0-9_\- \/]+$/', $oldFolder) || !preg_match('/^[A-Za-z0-9_\- \/]+$/', $newFolder)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name(s).']);
    exit;
}

$oldFolder = trim($oldFolder, "/\\ ");
$newFolder = trim($newFolder, "/\\ ");

$baseDir = rtrim(UPLOAD_DIR, '/\\');
$oldPath = $baseDir . DIRECTORY_SEPARATOR . $oldFolder;
$newPath = $baseDir . DIRECTORY_SEPARATOR . $newFolder;

if ((realpath($oldPath) === false) || (realpath(dirname($newPath)) === false) ||
    strpos(realpath($oldPath), realpath($baseDir)) !== 0 ||
    strpos(realpath(dirname($newPath)), realpath($baseDir)) !== 0) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder path.']);
    exit;
}

if (!file_exists($oldPath) || !is_dir($oldPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder to rename does not exist.']);
    exit;
}

if (file_exists($newPath)) {
    echo json_encode(['success' => false, 'error' => 'New folder name already exists.']);
    exit;
}

// Attempt to rename the folder.
if (rename($oldPath, $newPath)) {
    // Update metadata.
    $metadataFile = META_DIR . META_FILE;
    if (file_exists($metadataFile)) {
        $metadata = json_decode(file_get_contents($metadataFile), true);
        $updated = false;
        // Loop through each key in the metadata.
        foreach ($metadata as $key => $value) {
            // Check if the key is the folder itself or is inside the folder.
            if ($key === $oldFolder || strpos($key, $oldFolder . "/") === 0) {
                // Construct the new key by replacing the $oldFolder prefix with $newFolder.
                $newKey = $newFolder . substr($key, strlen($oldFolder));
                // Optional: remove a leading slash if it appears.
                $newKey = ltrim($newKey, "/");
                $metadata[$newKey] = $value;
                unset($metadata[$key]);
                $updated = true;
            }
        }
        if ($updated) {
            file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
        }
    }
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to rename folder.']);
}
?>