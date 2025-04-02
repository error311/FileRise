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

// Define $username first.
$username = $_SESSION['username'] ?? '';

// Now load the user's permissions.
$userPermissions = loadUserPermissions($username);

// Check if the user is read-only.
if ($username) {
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to delete files."]);
        exit();
    }
}

// --- Setup Trash Folder & Metadata ---
$trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
if (!file_exists($trashDir)) {
    mkdir($trashDir, 0755, true);
}
$trashMetadataFile = $trashDir . "trash.json";
$trashData = [];
if (file_exists($trashMetadataFile)) {
    $json = file_get_contents($trashMetadataFile);
    $trashData = json_decode($json, true);
    if (!is_array($trashData)) {
        $trashData = [];
    }
}

// Helper: Generate the metadata file path for a given folder.
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
$folder = trim($folder, "/\\ ");

// Build the upload directory.
if ($folder !== 'root') {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
}

// Load folder metadata (if exists) to retrieve uploader and upload date.
$metadataFile = getMetadataFilePath($folder);
$folderMetadata = [];
if (file_exists($metadataFile)) {
    $folderMetadata = json_decode(file_get_contents($metadataFile), true);
    if (!is_array($folderMetadata)) {
        $folderMetadata = [];
    }
}

$movedFiles = [];
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
        // Append a timestamp to the file name in trash to avoid collisions.
        $timestamp = time();
        $trashFileName = $basename . "_" . $timestamp;
        if (rename($filePath, $trashDir . $trashFileName)) {
            $movedFiles[] = $basename;
            // Record trash metadata for possible restoration.
            $trashData[] = [
                'type'           => 'file',
                'originalFolder' => $uploadDir,  // You could also store a relative path here.
                'originalName'   => $basename,
                'trashName'      => $trashFileName,
                'trashedAt'      => $timestamp,
                // Enrich trash record with uploader and upload date from folder metadata (if available)
                'uploaded'       => isset($folderMetadata[$basename]['uploaded']) ? $folderMetadata[$basename]['uploaded'] : "Unknown",
                'uploader'       => isset($folderMetadata[$basename]['uploader']) ? $folderMetadata[$basename]['uploader'] : "Unknown",
                // NEW: Record the username of the user who deleted the file.
                'deletedBy'      => isset($_SESSION['username']) ? $_SESSION['username'] : "Unknown"
            ];
        } else {
            $errors[] = "Failed to move $basename to Trash.";
        }
    } else {
        // Consider file already deleted.
        $movedFiles[] = $basename;
    }
}

// Write back the updated trash metadata.
file_put_contents($trashMetadataFile, json_encode($trashData, JSON_PRETTY_PRINT));

// Update folder-specific metadata file by removing deleted files.
if (file_exists($metadataFile)) {
    $metadata = json_decode(file_get_contents($metadataFile), true);
    if (is_array($metadata)) {
        foreach ($movedFiles as $delFile) {
            if (isset($metadata[$delFile])) {
                unset($metadata[$delFile]);
            }
        }
        file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
    }
}

if (empty($errors)) {
    echo json_encode(["success" => "Files moved to Trash: " . implode(", ", $movedFiles)]);
} else {
    echo json_encode(["error" => implode("; ", $errors) . ". Files moved to Trash: " . implode(", ", $movedFiles)]);
}
?>