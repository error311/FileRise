<?php
// downloadSharedFile.php

require_once 'config.php';

// Retrieve and sanitize token and file name from GET.
$token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
$file = filter_input(INPUT_GET, 'file', FILTER_SANITIZE_STRING);

if (empty($token) || empty($file)) {
    http_response_code(400);
    echo "Missing token or file parameter.";
    exit;
}

// Load the share folder records.
$shareFile = META_DIR . "share_folder_links.json";
if (!file_exists($shareFile)) {
    http_response_code(404);
    echo "Share link not found.";
    exit;
}

$shareLinks = json_decode(file_get_contents($shareFile), true);
if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
    http_response_code(404);
    echo "Share link not found.";
    exit;
}

$record = $shareLinks[$token];

// Check if the link has expired.
if (time() > $record['expires']) {
    http_response_code(403);
    echo "This share link has expired.";
    exit;
}

// Get the shared folder from the record.
$folder = trim($record['folder'], "/\\ ");
$folderPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
$realFolderPath = realpath($folderPath);
$uploadDirReal = realpath(UPLOAD_DIR);

if ($realFolderPath === false || strpos($realFolderPath, $uploadDirReal) !== 0 || !is_dir($realFolderPath)) {
    http_response_code(404);
    echo "Shared folder not found.";
    exit;
}

// Sanitize the filename to prevent directory traversal.
if (strpos($file, "/") !== false || strpos($file, "\\") !== false) {
    http_response_code(400);
    echo "Invalid file name.";
    exit;
}
$file = basename($file);

// Build the full file path and verify it is inside the shared folder.
$filePath = $realFolderPath . DIRECTORY_SEPARATOR . $file;
$realFilePath = realpath($filePath);
if ($realFilePath === false || strpos($realFilePath, $realFolderPath) !== 0 || !is_file($realFilePath)) {
    http_response_code(404);
    echo "File not found.";
    exit;
}

// Determine MIME type.
$mimeType = mime_content_type($realFilePath);
header("Content-Type: " . $mimeType);

// Set Content-Disposition header.
// Inline if the file is an image; attachment for others.
$ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
    header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
} else {
    header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
}

// Read and output the file.
readfile($realFilePath);
exit;
?>