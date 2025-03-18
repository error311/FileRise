<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection for Uploads ---
// Use getallheaders() to read the token from the header.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Validate folder name input.
$folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';
if ($folder !== 'root' && !preg_match('/^[A-Za-z0-9_\- \/]+$/', $folder)) {
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

$safeFileNamePattern = '/^[A-Za-z0-9_\-\. ]+$/';

foreach ($_FILES["file"]["name"] as $index => $fileName) {
    $safeFileName = basename($fileName);
    if (!preg_match($safeFileNamePattern, $safeFileName)) {
        echo json_encode(["error" => "Invalid file name: " . $fileName]);
        exit;
    }
    
    // --- Minimal Folder/Subfolder Logic ---
    $relativePath = '';
    if (isset($_POST['relativePath'])) {
        if (is_array($_POST['relativePath'])) {
            $relativePath = $_POST['relativePath'][$index] ?? '';
        } else {
            $relativePath = $_POST['relativePath'];
        }
    }
    if (!empty($relativePath)) {
        $subDir = dirname($relativePath);
        if ($subDir !== '.' && $subDir !== '') {
            if ($folder === 'root') {
                $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $subDir . DIRECTORY_SEPARATOR;
            } else {
                $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR . $subDir . DIRECTORY_SEPARATOR;
            }
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0775, true);
            }
            $safeFileName = basename($relativePath);
        }
    }
    // --- End Minimal Folder/Subfolder Logic ---
    
    $targetPath = $uploadDir . $safeFileName;
    
    if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $targetPath)) {
        if (!empty($relativePath)) {
            $metaKey = ($folder !== 'root') ? $folder . "/" . $relativePath : $relativePath;
        } else {
            $metaKey = ($folder !== 'root') ? $folder . "/" . $safeFileName : $safeFileName;
        }
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