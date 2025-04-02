<?php
require_once 'config.php';
header('Content-Type: application/json');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Ensure the request method is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method.']);
    exit;
}

// CSRF Protection: Read token from the custom header "X-CSRF-Token"
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(['success' => false, 'error' => 'Invalid CSRF token.']);
    http_response_code(403);
    exit;
}
$userPermissions = loadUserPermissions($username);
// Check if the user is read-only. (Assuming that if readOnly is true, deletion is disallowed.)
$username = $_SESSION['username'] ?? '';
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to rename folders."]);
        exit();
    }
}

// Get the JSON input and decode it
$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
    echo json_encode(['success' => false, 'error' => 'Required folder names not provided.']);
    exit;
}

$oldFolder = trim($input['oldFolder']);
$newFolder = trim($input['newFolder']);

// Validate folder names
if (!preg_match('/^[A-Za-z0-9_\- \/]+$/', $oldFolder) || !preg_match('/^[A-Za-z0-9_\- \/]+$/', $newFolder)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name(s).']);
    exit;
}

$oldFolder = trim($oldFolder, "/\\ ");
$newFolder = trim($newFolder, "/\\ ");

$baseDir = rtrim(UPLOAD_DIR, '/\\');
$oldPath = $baseDir . DIRECTORY_SEPARATOR . $oldFolder;
$newPath = $baseDir . DIRECTORY_SEPARATOR . $newFolder;

if ((realpath($oldPath) === false) || (realpath(dirname($newPath)) === false) ||
    strpos(realpath($oldPath), realpath($baseDir)) !== 0 ||
    strpos(realpath(dirname($newPath)), realpath($baseDir)) !== 0) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder path.']);
    exit;
}

if (!file_exists($oldPath) || !is_dir($oldPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder to rename does not exist.']);
    exit;
}

if (file_exists($newPath)) {
    echo json_encode(['success' => false, 'error' => 'New folder name already exists.']);
    exit;
}

// Attempt to rename the folder.
if (rename($oldPath, $newPath)) {
    // --- Update Metadata Files ---
    // Generate a metadata prefix for the old folder path and new folder path.
    $oldPrefix = str_replace(['/', '\\', ' '], '-', $oldFolder);
    $newPrefix = str_replace(['/', '\\', ' '], '-', $newFolder);
    
    // Find all metadata files whose names start with the old prefix.
    $metadataFiles = glob(META_DIR . $oldPrefix . '*_metadata.json');
    foreach ($metadataFiles as $oldMetaFile) {
        $baseName = basename($oldMetaFile);
        // Replace the old prefix with the new prefix in the filename.
        $newBaseName = preg_replace('/^' . preg_quote($oldPrefix, '/') . '/', $newPrefix, $baseName);
        $newMetaFile = META_DIR . $newBaseName;
        rename($oldMetaFile, $newMetaFile);
    }
    
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to rename folder.']);
}
?>