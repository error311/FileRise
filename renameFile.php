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
        echo json_encode(["error" => "Read-only users are not allowed to rename files."]);
        exit();
    }
}

$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data['folder']) || !isset($data['oldName']) || !isset($data['newName'])) {
    echo json_encode(["error" => "Invalid input"]);
    exit;
}

$folder = trim($data['folder']) ?: 'root';
// For subfolders, allow letters, numbers, underscores, dashes, spaces, and forward slashes.
if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
    echo json_encode(["error" => "Invalid folder name"]);
    exit;
}

$oldName = basename(trim($data['oldName']));
$newName = basename(trim($data['newName']));

// Validate file names: allow letters, numbers, underscores, dashes, dots, parentheses, and spaces.
if (!preg_match(REGEX_FILE_NAME, $oldName) || !preg_match(REGEX_FILE_NAME, $newName)) {
    echo json_encode(["error" => "Invalid file name."]);
    exit;
}

// Determine the directory path based on the folder.
if ($folder !== 'root') {
    $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $directory = UPLOAD_DIR;
}

$oldPath = $directory . $oldName;
$newPath = $directory . $newName;

// Helper: Generate a unique file name if a file with the same name exists.
function getUniqueFileName($directory, $fileName) {
    $fullPath = $directory . $fileName;
    clearstatcache(true, $fullPath);
    if (!file_exists($fullPath)) {
        return $fileName;
    }
    $basename = pathinfo($fileName, PATHINFO_FILENAME);
    $extension = pathinfo($fileName, PATHINFO_EXTENSION);
    $counter = 1;
    do {
        $newName = $basename . " (" . $counter . ")" . ($extension ? "." . $extension : "");
        $newFullPath = $directory . $newName;
        clearstatcache(true, $newFullPath);
        $counter++;
    } while (file_exists($directory . $newName));
    return $newName;
}

if (!file_exists($oldPath)) {
    echo json_encode(["error" => "File does not exist"]);
    exit;
}

// If a file with the new name exists, generate a unique name.
if (file_exists($newPath)) {
    $newName = getUniqueFileName($directory, $newName);
    $newPath = $directory . $newName;
}

if (rename($oldPath, $newPath)) {
    // --- Update Metadata in the Folder-Specific JSON ---
    $metadataKey = ($folder === 'root') ? "root" : $folder;
    $metadataFile = META_DIR . str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
    
    if (file_exists($metadataFile)) {
        $metadata = json_decode(file_get_contents($metadataFile), true);
        if (isset($metadata[$oldName])) {
            $metadata[$newName] = $metadata[$oldName];
            unset($metadata[$oldName]);
            file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
        }
    }
    echo json_encode(["success" => "File renamed successfully", "newName" => $newName]);
} else {
    echo json_encode(["error" => "Error renaming file"]);
}
?>