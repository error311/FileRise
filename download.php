<?php
require_once 'config.php';

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
if (!preg_match(REGEX_FILE_NAME, $file)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid file name."]);
    exit;
}

// Get the realpath of the upload directory.
$uploadDirReal = realpath(UPLOAD_DIR);
if ($uploadDirReal === false) {
    http_response_code(500);
    echo json_encode(["error" => "Server misconfiguration."]);
    exit;
}

// Determine the directory.
if ($folder === 'root') {
    $directory = $uploadDirReal;
} else {
    // Prevent path traversal in folder parameter.
    if (strpos($folder, '..') !== false) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid folder name."]);
        exit;
    }
    
    $directoryPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
    $directory = realpath($directoryPath);
    
    // Ensure that the resolved directory exists and is within the allowed UPLOAD_DIR.
    if ($directory === false || strpos($directory, $uploadDirReal) !== 0) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid folder path."]);
        exit;
    }
}

// Build the file path.
$filePath = $directory . DIRECTORY_SEPARATOR . $file;
$realFilePath = realpath($filePath);

// Validate that the real file path exists and is within the allowed directory.
if ($realFilePath === false || strpos($realFilePath, $uploadDirReal) !== 0) {
    http_response_code(403);
    echo json_encode(["error" => "Access forbidden."]);
    exit;
}

if (!file_exists($realFilePath)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found."]);
    exit;
}

// Serve the file.
$mimeType = mime_content_type($realFilePath);
header("Content-Type: " . $mimeType);

// For images, serve inline; for other types, force download.
$ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
    header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
} else {
    header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
}
header('Content-Length: ' . filesize($realFilePath));

readfile($realFilePath);
exit;
?>