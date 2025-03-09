<?php
require 'config.php';
header('Content-Type: application/json');

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Ensure the request is a POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method.']);
    exit;
}

// Get the JSON input and decode it
$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['folder'])) {
    echo json_encode(['success' => false, 'error' => 'Folder name not provided.']);
    exit;
}

$folderName = trim($input['folder']);

// Prevent deletion of root.
if ($folderName === 'root') {
    echo json_encode(['success' => false, 'error' => 'Cannot delete root folder.']);
    exit;
}

// Allow letters, numbers, underscores, dashes, spaces, and forward slashes.
if (!preg_match('/^[A-Za-z0-9_\- \/]+$/', $folderName)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name.']);
    exit;
}

// Build the folder path (supports subfolder paths like "FolderTest/FolderTestSub")
$folderPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folderName;

// Check if the folder exists and is a directory
if (!file_exists($folderPath) || !is_dir($folderPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder does not exist.']);
    exit;
}

// Prevent deletion if the folder is not empty
if (count(scandir($folderPath)) > 2) {
    echo json_encode(['success' => false, 'error' => 'Folder is not empty.']);
    exit;
}

// Attempt to delete the folder
if (rmdir($folderPath)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to delete folder.']);
}
?>