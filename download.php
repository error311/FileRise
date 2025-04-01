<?php
require_once 'config.php';

// For GET requests (which download.php will use), we assume session authentication is enough.

// Check if the user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Get file parameters from the GET request.
$file = isset($_GET['file']) ? basename($_GET['file']) : '';
$folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';

// Validate file name (allowing letters, numbers, underscores, dashes, dots, and parentheses)
if (!preg_match('/^[A-Za-z0-9_\-\.\(\) ]+$/', $file)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid file name."]);
    exit;
}

// Determine the directory.
if ($folder !== 'root') {
    $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $directory = UPLOAD_DIR;
}

$filePath = $directory . $file;

if (!file_exists($filePath)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found."]);
    exit;
}

// Serve the file.
$mimeType = mime_content_type($filePath);
header("Content-Type: " . $mimeType);

// For images, serve inline; for other types, force download.
$ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
    header('Content-Disposition: inline; filename="' . basename($filePath) . '"');
} else {
    header('Content-Disposition: attachment; filename="' . basename($filePath) . '"');
}
header('Content-Length: ' . filesize($filePath));

// Disable caching.
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

readfile($filePath);
exit;
?>