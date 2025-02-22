<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$uploadDir = UPLOAD_DIR;
$metadataFile = "file_metadata.json";

if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0775, true);
}

// Load existing metadata
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
$metadataChanged = false;

foreach ($_FILES["file"]["name"] as $index => $fileName) {
    $filePath = $uploadDir . basename($fileName);

    if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $filePath)) {
        // Store "Uploaded Date" and "Uploader" only if not already stored
        if (!isset($metadata[$fileName])) {
            $uploadedDate = date(DATE_TIME_FORMAT); // Store only the first upload time
            $uploader = $_SESSION['username'] ?? "Unknown";
            $metadata[$fileName] = [
                "uploaded" => $uploadedDate,
                "uploader" => $uploader
            ];
            $metadataChanged = true;
        }
    } else {
        echo json_encode(["error" => "Error uploading file"]);
        exit;
    }
}

// Save metadata only if modified
if ($metadataChanged) {
    file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
}

echo json_encode(["success" => "Files uploaded successfully"]);
?>
