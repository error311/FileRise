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

// Get the JSON input and decode it
$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
    echo json_encode(['success' => false, 'error' => 'Required folder names not provided.']);
    exit;
}

$oldFolder = trim($input['oldFolder']);
$newFolder = trim($input['newFolder']);

// Allow letters, numbers, underscores, dashes, spaces, and forward slashes
if (!preg_match('/^[A-Za-z0-9_\- \/]+$/', $oldFolder) || !preg_match('/^[A-Za-z0-9_\- \/]+$/', $newFolder)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name(s).']);
    exit;
}

// Trim any leading/trailing slashes and spaces.
$oldFolder = trim($oldFolder, "/\\ ");
$newFolder = trim($newFolder, "/\\ ");

// Build full paths relative to UPLOAD_DIR.
$baseDir = rtrim(UPLOAD_DIR, '/\\');
$oldPath = $baseDir . DIRECTORY_SEPARATOR . $oldFolder;
$newPath = $baseDir . DIRECTORY_SEPARATOR . $newFolder;

// Security check: ensure both paths are within the base directory.
if ((realpath($oldPath) === false) || (realpath(dirname($newPath)) === false) ||
    strpos(realpath($oldPath), realpath($baseDir)) !== 0 ||
    strpos(realpath(dirname($newPath)), realpath($baseDir)) !== 0) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder path.']);
    exit;
}

// Check if the folder to rename exists.
if (!file_exists($oldPath) || !is_dir($oldPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder to rename does not exist.']);
    exit;
}

// Check if the new folder name already exists.
if (file_exists($newPath)) {
    echo json_encode(['success' => false, 'error' => 'New folder name already exists.']);
    exit;
}

// Attempt to rename the folder.
if (rename($oldPath, $newPath)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to rename folder.']);
}
?>