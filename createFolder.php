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
if (!isset($input['folderName'])) {
    echo json_encode(['success' => false, 'error' => 'Folder name not provided.']);
    exit;
}

$folderName = trim($input['folderName']);
$parent = isset($input['parent']) ? trim($input['parent']) : "";

// Basic sanitation: allow only letters, numbers, underscores, dashes, and spaces in folderName
if (!preg_match('/^[A-Za-z0-9_\- ]+$/', $folderName)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name.']);
    exit;
}

// Optionally, sanitize the parent folder if needed.
if ($parent && !preg_match('/^[A-Za-z0-9_\- \/]+$/', $parent)) {
    echo json_encode(['success' => false, 'error' => 'Invalid parent folder name.']);
    exit;
}

// Build the full folder path.
$baseDir = rtrim(UPLOAD_DIR, '/\\');
if ($parent && strtolower($parent) !== "root") {
    $fullPath = $baseDir . DIRECTORY_SEPARATOR . $parent . DIRECTORY_SEPARATOR . $folderName;
} else {
    $fullPath = $baseDir . DIRECTORY_SEPARATOR . $folderName;
}

// Check if the folder already exists.
if (file_exists($fullPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder already exists.']);
    exit;
}

// Attempt to create the folder.
if (mkdir($fullPath, 0755, true)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to create folder.']);
}
?>