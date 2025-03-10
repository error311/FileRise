<?php
// downloadZip.php

require_once 'config.php';
session_start();

// Check if the user is authenticated.
// Using the "authenticated" flag as set in auth.php.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Read and decode the JSON input.
$rawData = file_get_contents("php://input");
$data = json_decode($rawData, true);

if (!is_array($data) || !isset($data['folder']) || !isset($data['files']) || !is_array($data['files'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Invalid input."]);
    exit;
}

$folder = $data['folder'];
$files = $data['files'];

// Validate folder name to allow subfolders.
// "root" is allowed; otherwise, split by "/" and validate each segment.
if ($folder !== "root") {
    $parts = explode('/', $folder);
    foreach ($parts as $part) {
        // Reject empty segments or segments with "." or ".."
        if (empty($part) || $part === '.' || $part === '..' || !preg_match('/^[A-Za-z0-9_\-. ]+$/', $part)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }
    }
    // Rebuild the relative folder path (using DIRECTORY_SEPARATOR).
    $relativePath = implode(DIRECTORY_SEPARATOR, $parts) . DIRECTORY_SEPARATOR;
} else {
    $relativePath = "";
}

// Use the absolute UPLOAD_DIR from config.php.
$baseDir = realpath(UPLOAD_DIR);
if ($baseDir === false) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Uploads directory not configured correctly."]);
    exit;
}

// Build the full folder path.
$folderPath = $baseDir . DIRECTORY_SEPARATOR . $relativePath;

// Normalize the folder path.
$folderPathReal = realpath($folderPath);

// Ensure the folder exists and is within the base uploads directory.
if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Folder not found."]);
    exit;
}

// Validate that at least one file is specified.
if (empty($files)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(["error" => "No files specified."]);
    exit;
}

// Validate each file name.
foreach ($files as $fileName) {
    if (!preg_match('/^[A-Za-z0-9_\-. ]+$/', $fileName)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(["error" => "Invalid file name: " . $fileName]);
        exit;
    }
}

// Create a temporary file for the ZIP archive.
$tempZip = tempnam(sys_get_temp_dir(), 'zip');
$zip = new ZipArchive();
if ($zip->open($tempZip, ZipArchive::OVERWRITE) !== TRUE) {
    error_log("ZipArchive open failed: " . $zip->lastErrorString());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Could not create zip archive."]);
    exit;
}

// Add each requested file to the zip archive.
foreach ($files as $fileName) {
    $filePath = $folderPathReal . DIRECTORY_SEPARATOR . $fileName;
    if (file_exists($filePath)) {
        // Add the file using just the file name as its internal path.
        $zip->addFile($filePath, $fileName);
    }
}
$zip->close();

// Serve the ZIP file.
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="files.zip"');
header('Content-Length: ' . filesize($tempZip));
readfile($tempZip);

// Remove the temporary ZIP file.
unlink($tempZip);
exit;
?>