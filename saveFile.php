<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

$data = json_decode(file_get_contents("php://input"), true);

// Debugging: Check what data is received
if (!$data) {
    echo json_encode(["error" => "No data received"]);
    exit;
}

if (!isset($data["fileName"]) || !isset($data["content"])) {
    echo json_encode(["error" => "Invalid request data", "received" => $data]);
    exit;
}

$fileName = basename($data["fileName"]);
$filePath = UPLOAD_DIR . $fileName;

// Ensure only .txt and .json files are allowed
if (!preg_match("/\\.txt$|\\.json$/", $fileName)) {
    echo json_encode(["error" => "Invalid file type"]);
    exit;
}

// Try to save the file
if (file_put_contents($filePath, $data["content"]) !== false) {
    echo json_encode(["success" => "File saved successfully"]);
} else {
    echo json_encode(["error" => "Error saving file"]);
}
?>
