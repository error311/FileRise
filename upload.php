<?php
require_once 'config.php';
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';

// Determine the target upload directory.
$uploadDir = UPLOAD_DIR;
if ($folder !== 'root') {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0775, true);
    }
} else {
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0775, true);
    }
}

$metadataFile = "file_metadata.json";
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
$metadataChanged = false;

foreach ($_FILES["file"]["name"] as $index => $fileName) {
    $targetPath = $uploadDir . basename($fileName);
    if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $targetPath)) {
        // Use a metadata key that includes the folder if not in root.
        $metaKey = ($folder !== 'root') ? $folder . "/" . $fileName : $fileName;
        if (!isset($metadata[$metaKey])) {
            $uploadedDate = date(DATE_TIME_FORMAT);
            $uploader = $_SESSION['username'] ?? "Unknown";
            $metadata[$metaKey] = [
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

if ($metadataChanged) {
    file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
}

echo json_encode(["success" => "Files uploaded successfully"]);
?>
