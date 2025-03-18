<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection ---
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

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

// If a subfolder is provided, validate it.
// Allow letters, numbers, underscores, dashes, spaces, and forward slashes.
if ($folder !== "root" && !preg_match('/^[A-Za-z0-9_\- \/]+$/', $folder)) {
    echo json_encode(["error" => "Invalid folder name"]);
    exit;
}

// Trim any leading/trailing slashes or spaces.
$folder = trim($folder, "/\\ ");

// Determine the target upload directory.
$baseDir = rtrim(UPLOAD_DIR, '/\\');
if ($folder && strtolower($folder) !== "root") {
    $targetDir = $baseDir . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $targetDir = $baseDir . DIRECTORY_SEPARATOR;
}

// (Optional security check: Ensure $targetDir starts with $baseDir)
if (strpos(realpath($targetDir), realpath($baseDir)) !== 0) {
    echo json_encode(["error" => "Invalid folder path"]);
    exit;
}

if (!is_dir($targetDir)) {
    mkdir($targetDir, 0775, true);
}

$filePath = $targetDir . $fileName;

// Attempt to save the file.
if (file_put_contents($filePath, $data["content"]) !== false) {
    echo json_encode(["success" => "File saved successfully"]);
} else {
    echo json_encode(["error" => "Error saving file"]);
}
?>