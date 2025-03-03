<?php
require 'config.php';
header('Content-Type: application/json');

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

// Basic sanitation: allow only letters, numbers, underscores, dashes, and spaces
if (!preg_match('/^[A-Za-z0-9_\- ]+$/', $oldFolder) || !preg_match('/^[A-Za-z0-9_\- ]+$/', $newFolder)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name(s).']);
    exit;
}

$oldPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $oldFolder;
$newPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $newFolder;

// Check if the folder to rename exists
if (!file_exists($oldPath) || !is_dir($oldPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder to rename does not exist.']);
    exit;
}

// Check if the new folder name already exists
if (file_exists($newPath)) {
    echo json_encode(['success' => false, 'error' => 'New folder name already exists.']);
    exit;
}

// Attempt to rename the folder
if (rename($oldPath, $newPath)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to rename folder.']);
}
?>
