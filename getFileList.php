<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';
if ($folder !== 'root') {
    $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
} else {
    $directory = UPLOAD_DIR;
}

$metadataFile = META_DIR . META_FILE;
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];

if (!is_dir($directory)) {
    echo json_encode(["error" => "Directory not found."]);
    exit;
}

$files = array_values(array_diff(scandir($directory), array('.', '..')));
$fileList = [];

foreach ($files as $file) {
    $filePath = $directory . DIRECTORY_SEPARATOR . $file;
    // Only include files (skip directories)
    if (!is_file($filePath)) continue;

    // Build the metadata key.
    $metaKey = ($folder !== 'root') ? $folder . "/" . $file : $file;

    $fileDateModified = filemtime($filePath) ? date(DATE_TIME_FORMAT, filemtime($filePath)) : "Unknown";
    $fileUploadedDate = isset($metadata[$metaKey]["uploaded"]) ? $metadata[$metaKey]["uploaded"] : "Unknown";
    $fileUploader = isset($metadata[$metaKey]["uploader"]) ? $metadata[$metaKey]["uploader"] : "Unknown";

    $fileSizeBytes = filesize($filePath);
    if ($fileSizeBytes >= 1073741824) {
        $fileSizeFormatted = sprintf("%.1f GB", $fileSizeBytes / 1073741824);
    } elseif ($fileSizeBytes >= 1048576) {
        $fileSizeFormatted = sprintf("%.1f MB", $fileSizeBytes / 1048576);
    } elseif ($fileSizeBytes >= 1024) {
        $fileSizeFormatted = sprintf("%.1f KB", $fileSizeBytes / 1024);
    } else {
        $fileSizeFormatted = sprintf("%s bytes", number_format($fileSizeBytes));
    }

    $fileList[] = [
        'name' => $file,
        'modified' => $fileDateModified,
        'uploaded' => $fileUploadedDate,
        'size' => $fileSizeFormatted,
        'uploader' => $fileUploader
    ];
}

echo json_encode(["files" => $fileList]);
?>
