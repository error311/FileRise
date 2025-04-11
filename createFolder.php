<?php
require_once 'config.php';
header('Content-Type: application/json');

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Ensure the request is a POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method.']);
    exit;
}

$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(['success' => false, 'error' => 'Invalid CSRF token.']);
    http_response_code(403);
    exit;
}

$username = $_SESSION['username'] ?? '';
$userPermissions = loadUserPermissions($username);
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to create folders."]);
        exit();
    }
}

// Get the JSON input and decode it
$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['folderName'])) {
    echo json_encode(['success' => false, 'error' => 'Folder name not provided.']);
    exit;
}

$folderName = trim($input['folderName']);
$parent = isset($input['parent']) ? trim($input['parent']) : "";

// Basic sanitation: allow only letters, numbers, underscores, dashes, and spaces in folderName
if (!preg_match('/^[\p{L}\p{N}_\-\s\/\\\\]+$/u', $folderName)) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder name.']);
    exit;
}

// Optionally, sanitize the parent folder if needed.
if ($parent && !preg_match('/^[\p{L}\p{N}_\-\s\/\\\\]+$/u', $parent)) {
    echo json_encode(['success' => false, 'error' => 'Invalid parent folder name.']);
    exit;
}

// Build the full folder path.
$baseDir = rtrim(UPLOAD_DIR, '/\\');
if ($parent && strtolower($parent) !== "root") {
    $fullPath = $baseDir . DIRECTORY_SEPARATOR . $parent . DIRECTORY_SEPARATOR . $folderName;
    $relativePath = $parent . "/" . $folderName;
} else {
    $fullPath = $baseDir . DIRECTORY_SEPARATOR . $folderName;
    $relativePath = $folderName;
}

// Check if the folder already exists.
if (file_exists($fullPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder already exists.']);
    exit;
}

// Attempt to create the folder.
if (mkdir($fullPath, 0755, true)) {

    // --- Create an empty metadata file for the new folder ---
    // Helper: Generate the metadata file path for a given folder.
    // For "root", returns "root_metadata.json". Otherwise, replaces slashes, backslashes, and spaces with dashes and appends "_metadata.json".
    function getMetadataFilePath($folder) {
        if (strtolower($folder) === 'root' || $folder === '') {
            return META_DIR . "root_metadata.json";
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
    }
    
    $metadataFile = getMetadataFilePath($relativePath);
    // Create an empty associative array (i.e. empty metadata) and write to the metadata file.
    file_put_contents($metadataFile, json_encode([], JSON_PRETTY_PRINT));

    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to create folder.']);
}
?>