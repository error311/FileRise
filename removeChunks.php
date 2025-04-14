<?php
require_once 'config.php';
header('Content-Type: application/json');

$receivedToken = isset($_POST['csrf_token']) ? trim($_POST['csrf_token']) : '';
if ($receivedToken !== $_SESSION['csrf_token']) {
    http_response_code(403);
    echo json_encode(["error" => "Invalid CSRF token"]);
    exit;
}

if (!isset($_POST['folder'])) {
    http_response_code(400);
    echo json_encode(["error" => "No folder specified"]);
    exit;
}

$folder = urldecode($_POST['folder']);
// The folder name should match the "resumable_" pattern exactly.
$regex = "/^resumable_" . PATTERN_FOLDER_NAME . "$/u";
if (!preg_match($regex, $folder)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid folder name"]);
    exit;
}

$tempDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
if (!is_dir($tempDir)) {
    echo json_encode(["success" => true, "message" => "Temporary folder already removed."]);
    exit;
}

function rrmdir($dir) {
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $file) {
        $file->isDir() ? rmdir($file->getRealPath()) : unlink($file->getRealPath());
    }
    rmdir($dir);
}

rrmdir($tempDir);

if (!is_dir($tempDir)) {
    echo json_encode(["success" => true, "message" => "Temporary folder removed."]);
} else {
    http_response_code(500);
    echo json_encode(["error" => "Failed to remove temporary folder."]);
}
?>