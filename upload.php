<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection for Uploads ---
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

// Determine the base upload directory.
$baseUploadDir = UPLOAD_DIR;
if ($folder !== 'root') {
    $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    if (!is_dir($baseUploadDir)) {
        mkdir($baseUploadDir, 0775, true);
    }
} else {
    if (!is_dir($baseUploadDir)) {
        mkdir($baseUploadDir, 0775, true);
    }
}

// Prepare a collection to hold metadata for each folder.
$metadataCollection = []; // key: folder path, value: metadata array
$metadataChanged = [];    // key: folder path, value: boolean

$safeFileNamePattern = '/^[A-Za-z0-9_\-\.\(\) ]+$/';

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
    
    // Determine the complete folder path for upload and for metadata.
    $folderPath = $folder; // Base folder as provided ("root" or a subfolder)
    $uploadDir = $baseUploadDir; // Start with the base upload directory
    if (!empty($relativePath)) {
        $subDir = dirname($relativePath);
        if ($subDir !== '.' && $subDir !== '') {
            // If base folder is 'root', then folderPath is just the subDir
            // Otherwise, append the subdirectory to the base folder
            $folderPath = ($folder === 'root') ? $subDir : $folder . "/" . $subDir;
            // Update the upload directory accordingly.
            $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR 
                        . str_replace('/', DIRECTORY_SEPARATOR, $folderPath) . DIRECTORY_SEPARATOR;
        }
        // Ensure the file name is taken from the relative path.
        $safeFileName = basename($relativePath);
    }
    // --- End Minimal Folder/Subfolder Logic ---

    // Make sure the final upload directory exists.
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0775, true);
    }
    
    $targetPath = $uploadDir . $safeFileName;
    
    if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $targetPath)) {
        // Generate a unique metadata file name based on the folder path.
        // Replace slashes, backslashes, and spaces with dashes.
        $metadataKey = ($folderPath === '' || $folderPath === 'root') ? "root" : $folderPath;
        $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
        $metadataFile = META_DIR . $metadataFileName;
        
        // Load metadata for this folder if not already loaded.
        if (!isset($metadataCollection[$metadataKey])) {
            if (file_exists($metadataFile)) {
                $metadataCollection[$metadataKey] = json_decode(file_get_contents($metadataFile), true);
            } else {
                $metadataCollection[$metadataKey] = [];
            }
            $metadataChanged[$metadataKey] = false;
        }
        
        // Add metadata for this file if not already present.
        if (!isset($metadataCollection[$metadataKey][$safeFileName])) {
            $uploadedDate = date(DATE_TIME_FORMAT);
            $uploader = $_SESSION['username'] ?? "Unknown";
            $metadataCollection[$metadataKey][$safeFileName] = [
                "uploaded" => $uploadedDate,
                "uploader" => $uploader
            ];
            $metadataChanged[$metadataKey] = true;
        }
    } else {
        echo json_encode(["error" => "Error uploading file"]);
        exit;
    }
}

// After processing all files, write out metadata files for folders that changed.
foreach ($metadataCollection as $folderKey => $data) {
    if ($metadataChanged[$folderKey]) {
        $metadataFileName = str_replace(['/', '\\', ' '], '-', $folderKey) . '_metadata.json';
        $metadataFile = META_DIR . $metadataFileName;
        file_put_contents($metadataFile, json_encode($data, JSON_PRETTY_PRINT));
    }
}

echo json_encode(["success" => "Files uploaded successfully"]);
?>