<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

$response = ["files" => []];

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$directory = UPLOAD_DIR;
$metadataFile = "file_metadata.json";

// Load stored metadata
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];

if (!is_dir($directory)) {
    echo json_encode(["error" => "Uploads directory not found."]);
    exit;
}

$files = array_values(array_diff(scandir($directory), array('.', '..')));
$fileList = [];

foreach ($files as $file) {
    $filePath = $directory . DIRECTORY_SEPARATOR . $file;
    if (!file_exists($filePath)) {
        continue;
    }

    // Get "Date Modified" using filemtime()
    $fileDateModified = filemtime($filePath) ? date(DATE_TIME_FORMAT, filemtime($filePath)) : "Unknown";

    // Get "Uploaded Date" from metadata (set during upload)
    $fileUploadedDate = isset($metadata[$file]["uploaded"]) ? $metadata[$file]["uploaded"] : "Unknown";

    // Get the uploader from metadata
    $fileUploader = isset($metadata[$file]["uploader"]) ? $metadata[$file]["uploader"] : "Unknown";

    // Calculate File Size
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
