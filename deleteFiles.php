<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection ---
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

// Helper: Generate the metadata file path for a given folder.
// For "root", returns "root_metadata.json". Otherwise, replaces slashes, backslashes, and spaces with dashes and appends "_metadata.json".
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

// Read request body
$data = json_decode(file_get_contents("php://input"), true);

// Validate request
if (!isset($data['files']) || !is_array($data['files'])) {
    echo json_encode(["error" => "No file names provided"]);
    exit;
}

// Determine folder – default to 'root'
$folder = isset($data['folder']) ? trim($data['folder']) : 'root';

// Validate folder: allow letters, numbers, underscores, dashes, spaces, and forward slashes
if ($folder !== 'root' && !preg_match('/^[A-Za-z0-9_\- \/]+$/', $folder)) {
    echo json_encode(["error" => "Invalid folder name."]);
    exit;
}
// Trim any leading/trailing slashes and spaces.
$folder = trim($folder, "/\\ ");

// Build the upload directory.
if ($folder !== 'root') {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
}

$deletedFiles = [];
$errors = [];

// Define a safe file name pattern: allow letters, numbers, underscores, dashes, dots, and spaces.
$safeFileNamePattern = '/^[A-Za-z0-9_\-\.\(\) ]+$/';

foreach ($data['files'] as $fileName) {
    $basename = basename(trim($fileName));
    
    // Validate the file name.
    if (!preg_match($safeFileNamePattern, $basename)) {
        $errors[] = "$basename has an invalid name.";
        continue;
    }
    
    $filePath = $uploadDir . $basename;
    
    if (file_exists($filePath)) {
        if (unlink($filePath)) {
            $deletedFiles[] = $basename;
        } else {
            $errors[] = "Failed to delete $basename";
        }
    } else {
        // Consider file already deleted.
        $deletedFiles[] = $basename;
    }
}

// Update folder-specific metadata file by removing deleted files.
$metadataFile = getMetadataFilePath($folder);
if (file_exists($metadataFile)) {
    $metadata = json_decode(file_get_contents($metadataFile), true);
    if (is_array($metadata)) {
        foreach ($deletedFiles as $delFile) {
            if (isset($metadata[$delFile])) {
                unset($metadata[$delFile]);
            }
        }
        file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
    }
}

if (empty($errors)) {
    echo json_encode(["success" => "Files deleted: " . implode(", ", $deletedFiles)]);
} else {
    echo json_encode(["error" => implode("; ", $errors) . ". Files deleted: " . implode(", ", $deletedFiles)]);
}
?>