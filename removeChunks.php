<?php
require_once 'config.php';
header('Content-Type: application/json');

// Validate CSRF token from POST
$receivedToken = isset($_POST['csrf_token']) ? trim($_POST['csrf_token']) : '';
if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

// Ensure a folder parameter is provided
if (!isset($_POST['folder'])) {
    echo json_encode(["error" => "No folder specified"]);
    http_response_code(400);
    exit;
}

$folder = $_POST['folder'];
// Validate the folder name to allow only expected characters (adjust the regex as needed)
if (!preg_match('/^resumable_[A-Za-z0-9\-]+$/', $folder)) {
    echo json_encode(["error" => "Invalid folder name"]);
    http_response_code(400);
    exit;
}

$tempDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;

// If the folder doesn't exist, simply return success.
if (!is_dir($tempDir)) {
    echo json_encode(["success" => true, "message" => "Temporary folder already removed."]);
    exit;
}

// Recursively delete directory and its contents
function rrmdir($dir) {
    if (is_dir($dir)) {
        $objects = scandir($dir);
        foreach ($objects as $object) {
            if ($object != "." && $object != "..") {
                $path = $dir . DIRECTORY_SEPARATOR . $object;
                if (is_dir($path) && !is_link($path)) {
                    rrmdir($path);
                } else {
                    @unlink($path);
                }
            }
        }
        @rmdir($dir);
    }
}

rrmdir($tempDir);

// check if folder still exists
if (!is_dir($tempDir)) {
    echo json_encode(["success" => true, "message" => "Temporary folder removed."]);
} else {
    echo json_encode(["error" => "Failed to remove temporary folder."]);
    http_response_code(500);
}
?>