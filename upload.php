<?php
require_once 'config.php';
header('Content-Type: application/json');

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Validate folder name input. Only allow letters, numbers, underscores, dashes, and spaces.
$folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';
if ($folder !== 'root' && !preg_match('/^[A-Za-z0-9_\- ]+$/', $folder)) {
    echo json_encode(["error" => "Invalid folder name"]);
    exit;
}

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

// Load metadata for uploaded files.
$metadataFile = META_DIR . META_FILE;
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
$metadataChanged = false;

// Define a safe pattern for file names: letters, numbers, underscores, dashes, dots, and spaces.
$safeFileNamePattern = '/^[A-Za-z0-9_\-\. ]+$/';

foreach ($_FILES["file"]["name"] as $index => $fileName) {
    // Use basename to strip any directory components.
    $safeFileName = basename($fileName);
    
    // Validate that the sanitized file name contains only allowed characters.
    if (!preg_match($safeFileNamePattern, $safeFileName)) {
        echo json_encode(["error" => "Invalid file name: " . $fileName]);
        exit;
    }
    
    $targetPath = $uploadDir . $safeFileName;
    if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $targetPath)) {
        // Build the metadata key, including the folder if not in root.
        $metaKey = ($folder !== 'root') ? $folder . "/" . $safeFileName : $safeFileName;
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
