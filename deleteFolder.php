<?php
require 'config.php';
header('Content-Type: application/json');

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

// Basic sanitation: allow only letters, numbers, underscores, dashes, and spaces
if (!preg_match('/^[A-Za-z0-9_\- ]+$/', $folderName)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name.']);
    exit;
}

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
