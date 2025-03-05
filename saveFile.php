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

$data = json_decode(file_get_contents("php://input"), true);

// Debugging: Check what data is received.
if (!$data) {
    echo json_encode(["error" => "No data received"]);
    exit;
}

if (!isset($data["fileName"]) || !isset($data["content"])) {
    echo json_encode(["error" => "Invalid request data", "received" => $data]);
    exit;
}

$fileName = basename($data["fileName"]);

// Determine the folder. Default to "root" if not provided.
$folder = isset($data["folder"]) ? trim($data["folder"]) : "root";
if ($folder !== "root") {
    $targetDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $targetDir = UPLOAD_DIR;
}

$filePath = $targetDir . $fileName;

// Try to save the file.
if (file_put_contents($filePath, $data["content"]) !== false) {
    echo json_encode(["success" => "File saved successfully"]);
} else {
    echo json_encode(["error" => "Error saving file"]);
}
?>
