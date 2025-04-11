<?php
require_once 'config.php';
header('Content-Type: application/json');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

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
$username = $_SESSION['username'] ?? '';
$userPermissions = loadUserPermissions($username);
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to move files."]);
        exit();
    }
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

$sourceFolder = trim($data['source']) ?: 'root';
$destinationFolder = trim($data['destination']) ?: 'root';

// Allow only letters, numbers, underscores, dashes, spaces, and forward slashes in folder names.
$folderPattern = '/^[\p{L}\p{N}_\-\s\/\\\\]+$/u';
if ($sourceFolder !== 'root' && !preg_match($folderPattern, $sourceFolder)) {
    echo json_encode(["error" => "Invalid source folder name."]);
    exit;
}
if ($destinationFolder !== 'root' && !preg_match($folderPattern, $destinationFolder)) {
    echo json_encode(["error" => "Invalid destination folder name."]);
    exit;
}

// Remove any leading/trailing slashes.
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

// Ensure destination directory exists.
if (!is_dir($destDir)) {
    if (!mkdir($destDir, 0775, true)) {
        echo json_encode(["error" => "Could not create destination folder"]);
        exit;
    }
}

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

// Prepare metadata files.
$srcMetaFile = getMetadataFilePath($sourceFolder);
$destMetaFile = getMetadataFilePath($destinationFolder);

$srcMetadata = file_exists($srcMetaFile) ? json_decode(file_get_contents($srcMetaFile), true) : [];
$destMetadata = file_exists($destMetaFile) ? json_decode(file_get_contents($destMetaFile), true) : [];

$errors = [];
$safeFileNamePattern = '/^[\p{L}\p{N}\p{M}%\-\.\(\) _]+$/u';

foreach ($data['files'] as $fileName) {
    // Save the original name for metadata lookup.
    $originalName = basename(trim($fileName));
    $basename = $originalName; // Start with the original name.
    
    // Validate the file name.
    if (!preg_match($safeFileNamePattern, $basename)) {
        $errors[] = "$basename has invalid characters.";
        continue;
    }
    
    $srcPath = $sourceDir . $originalName;
    $destPath = $destDir . $basename;
    
    clearstatcache();
    if (!file_exists($srcPath)) {
        $errors[] = "$originalName does not exist in source.";
        continue;
    }
    
    // If a file with the same name exists in destination, generate a unique name.
    if (file_exists($destPath)) {
        $uniqueName = getUniqueFileName($destDir, $basename);
        $basename = $uniqueName;
        $destPath = $destDir . $uniqueName;
    }
    
    if (!rename($srcPath, $destPath)) {
        $errors[] = "Failed to move $basename";
        continue;
    }
    
    // Update metadata: if there is metadata for the original file, move it under the new name.
    if (isset($srcMetadata[$originalName])) {
        $destMetadata[$basename] = $srcMetadata[$originalName];
        unset($srcMetadata[$originalName]);
    }
}

if (file_put_contents($srcMetaFile, json_encode($srcMetadata, JSON_PRETTY_PRINT)) === false) {
    $errors[] = "Failed to update source metadata.";
}
if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT)) === false) {
    $errors[] = "Failed to update destination metadata.";
}

if (empty($errors)) {
    echo json_encode(["success" => "Files moved successfully"]);
} else {
    echo json_encode(["error" => implode("; ", $errors)]);
}
?>