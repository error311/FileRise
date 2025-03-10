<?php
session_start();
require_once 'config.php';

// Check if the user is authenticated.
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
        if (empty($part) || $part === '.' || $part === '..' || !preg_match('/^[A-Za-z0-9_\-. ]+$/', $part)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }
    }
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

$folderPath = $baseDir . DIRECTORY_SEPARATOR . $relativePath;
$folderPathReal = realpath($folderPath);
if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Folder not found."]);
    exit;
}

if (empty($files)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(["error" => "No files specified."]);
    exit;
}

foreach ($files as $fileName) {
    if (!preg_match('/^[A-Za-z0-9_\-. ]+$/', $fileName)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(["error" => "Invalid file name: " . $fileName]);
        exit;
    }
}

// Build an array of files to include in the ZIP.
$filesToZip = [];
foreach ($files as $fileName) {
    $filePath = $folderPathReal . DIRECTORY_SEPARATOR . $fileName;
    if (file_exists($filePath)) {
        $filesToZip[] = $filePath;
    }
}

if (empty($filesToZip)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(["error" => "No valid files found to zip."]);
    exit;
}

// Create a temporary file for the ZIP archive.
$tempZip = tempnam(sys_get_temp_dir(), 'zip');
unlink($tempZip); // Remove the temporary file so ZipArchive can create a new one.
$tempZip .= '.zip';

$zip = new ZipArchive();
if ($zip->open($tempZip, ZipArchive::CREATE) !== TRUE) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Could not create zip archive."]);
    exit;
}

// Add each file to the archive using its base name.
foreach ($filesToZip as $filePath) {
    $zip->addFile($filePath, basename($filePath));
}
$zip->close();

// Serve the ZIP file.
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="files.zip"');
header('Content-Length: ' . filesize($tempZip));
readfile($tempZip);
unlink($tempZip);
exit;
?>