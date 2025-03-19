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

$data = json_decode(file_get_contents("php://input"), true);
if (
    !$data || 
    !isset($data['source']) || 
    !isset($data['destination']) || 
    !isset($data['files'])
) {
    echo json_encode(["error" => "Invalid request"]);
    exit;
}

$sourceFolder = trim($data['source']);
$destinationFolder = trim($data['destination']);
$files = $data['files'];

// Validate folder names: allow letters, numbers, underscores, dashes, spaces, and forward slashes.
$folderPattern = '/^[A-Za-z0-9_\- \/]+$/';
if ($sourceFolder !== 'root' && !preg_match($folderPattern, $sourceFolder)) {
    echo json_encode(["error" => "Invalid source folder name."]);
    exit;
}
if ($destinationFolder !== 'root' && !preg_match($folderPattern, $destinationFolder)) {
    echo json_encode(["error" => "Invalid destination folder name."]);
    exit;
}

// Trim any leading/trailing slashes and spaces.
$sourceFolder = trim($sourceFolder, "/\\ ");
$destinationFolder = trim($destinationFolder, "/\\ ");

// Build the source and destination directories.
$baseDir = rtrim(UPLOAD_DIR, '/\\');
$sourceDir = ($sourceFolder === 'root') 
    ? $baseDir . DIRECTORY_SEPARATOR 
    : $baseDir . DIRECTORY_SEPARATOR . $sourceFolder . DIRECTORY_SEPARATOR;
$destDir = ($destinationFolder === 'root') 
    ? $baseDir . DIRECTORY_SEPARATOR 
    : $baseDir . DIRECTORY_SEPARATOR . $destinationFolder . DIRECTORY_SEPARATOR;

// Helper: Generate the metadata file path for a given folder.
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

// Helper: Generate a unique file name if a file with the same name exists.
function getUniqueFileName($destDir, $fileName) {
    $fullPath = $destDir . $fileName;
    clearstatcache(true, $fullPath);
    if (!file_exists($fullPath)) {
        return $fileName;
    }
    $basename = pathinfo($fileName, PATHINFO_FILENAME);
    $extension = pathinfo($fileName, PATHINFO_EXTENSION);
    $counter = 1;
    do {
        $newName = $basename . " (" . $counter . ")" . ($extension ? "." . $extension : "");
        $newFullPath = $destDir . $newName;
        clearstatcache(true, $newFullPath);
        $counter++;
    } while (file_exists($destDir . $newName));
    return $newName;
}

// Load source and destination metadata.
$srcMetaFile = getMetadataFilePath($sourceFolder);
$destMetaFile = getMetadataFilePath($destinationFolder);

$srcMetadata = file_exists($srcMetaFile) ? json_decode(file_get_contents($srcMetaFile), true) : [];
$destMetadata = file_exists($destMetaFile) ? json_decode(file_get_contents($destMetaFile), true) : [];

$errors = [];

// Define a safe file name pattern: letters, numbers, underscores, dashes, dots, parentheses, and spaces.
$safeFileNamePattern = '/^[A-Za-z0-9_\-\.\(\) ]+$/';

foreach ($files as $fileName) {
    // Save the original name for metadata lookup.
    $originalName = basename(trim($fileName));
    $basename = $originalName;
    if (!preg_match($safeFileNamePattern, $basename)) {
        $errors[] = "$basename has an invalid name.";
        continue;
    }
    
    $srcPath = $sourceDir . $originalName;
    $destPath = $destDir . $basename;
    
    clearstatcache();
    if (!file_exists($srcPath)) {
        $errors[] = "$originalName does not exist in source.";
        continue;
    }
    
    if (file_exists($destPath)) {
        $uniqueName = getUniqueFileName($destDir, $basename);
        $basename = $uniqueName; // update the file name for metadata and destination path
        $destPath = $destDir . $uniqueName;
    }
    
    if (!copy($srcPath, $destPath)) {
        $errors[] = "Failed to copy $basename";
        continue;
    }
    
    // Update destination metadata: if there's metadata for the original file in source, add it under the new name.
    if (isset($srcMetadata[$originalName])) {
        $destMetadata[$basename] = $srcMetadata[$originalName];
    }
}

if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT)) === false) {
    $errors[] = "Failed to update destination metadata.";
}

if (empty($errors)) {
    echo json_encode(["success" => "Files copied successfully"]);
} else {
    echo json_encode(["error" => implode("; ", $errors)]);
}
?>