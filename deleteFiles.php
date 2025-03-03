<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Read request body
$data = json_decode(file_get_contents("php://input"), true);

// Validate request
if (!isset($data['files']) || !is_array($data['files'])) {
    echo json_encode(["error" => "No file names provided"]);
    exit;
}

// Determine folder – default to 'root'
$folder = isset($data['folder']) ? trim($data['folder']) : 'root';
if ($folder !== 'root') {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
}

$deletedFiles = [];
$errors = [];

foreach ($data['files'] as $fileName) {
    $filePath = $uploadDir . basename($fileName);
    
    if (file_exists($filePath)) {
        if (unlink($filePath)) {
            $deletedFiles[] = $fileName;
        } else {
            $errors[] = "Failed to delete $fileName";
        }
    } else {
        // If file not found, consider it already deleted.
        $deletedFiles[] = $fileName;
    }
}

if (empty($errors)) {
    echo json_encode(["success" => "Files deleted: " . implode(", ", $deletedFiles)]);
} else {
    echo json_encode(["error" => implode("; ", $errors) . ". Files deleted: " . implode(", ", $deletedFiles)]);
}
?>
