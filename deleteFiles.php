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

$uploadDir = UPLOAD_DIR;
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
        $errors[] = "$fileName not found";
    }
}

// Return response
if (empty($errors)) {
    echo json_encode(["success" => "Files deleted: " . implode(", ", $deletedFiles)]);
} else {
    echo json_encode(["error" => implode("; ", $errors)]);
}
?>
