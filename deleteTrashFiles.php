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

// --- Setup Trash Folder & Metadata ---
$trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
if (!file_exists($trashDir)) {
    mkdir($trashDir, 0755, true);
}
$trashMetadataFile = $trashDir . "trash.json";

// Load trash metadata into an associative array keyed by trashName.
$trashData = [];
if (file_exists($trashMetadataFile)) {
    $json = file_get_contents($trashMetadataFile);
    $tempData = json_decode($json, true);
    if (is_array($tempData)) {
        foreach ($tempData as $item) {
            if (isset($item['trashName'])) {
                $trashData[$item['trashName']] = $item;
            }
        }
    }
}

// Read request body.
$data = json_decode(file_get_contents("php://input"), true);
if (!$data) {
    echo json_encode(["error" => "Invalid input"]);
    exit;
}

// Determine deletion mode: if "deleteAll" is true, delete all trash items; otherwise, use provided "files" array.
$filesToDelete = [];
if (isset($data['deleteAll']) && $data['deleteAll'] === true) {
    $filesToDelete = array_keys($trashData);
} elseif (isset($data['files']) && is_array($data['files'])) {
    $filesToDelete = $data['files'];
} else {
    echo json_encode(["error" => "No trash file identifiers provided"]);
    exit;
}

$deletedFiles = [];
$errors = [];

// Define a safe file name pattern.
$safeFileNamePattern = '/^[A-Za-z0-9_\-\.\(\) ]+$/';

foreach ($filesToDelete as $trashName) {
    $trashName = trim($trashName);
    if (!preg_match($safeFileNamePattern, $trashName)) {
        $errors[] = "$trashName has an invalid format.";
        continue;
    }
    
    if (!isset($trashData[$trashName])) {
        $errors[] = "Trash item $trashName not found.";
        continue;
    }
    
    $filePath = $trashDir . $trashName;
    
    if (file_exists($filePath)) {
        if (unlink($filePath)) {
            $deletedFiles[] = $trashName;
            unset($trashData[$trashName]);
        } else {
            $errors[] = "Failed to delete $trashName.";
        }
    } else {
        // If the file doesn't exist, remove its metadata entry.
        unset($trashData[$trashName]);
        $deletedFiles[] = $trashName;
    }
}

// Write the updated trash metadata back (as an indexed array).
file_put_contents($trashMetadataFile, json_encode(array_values($trashData), JSON_PRETTY_PRINT));

if (empty($errors)) {
    echo json_encode(["success" => "Trash items deleted: " . implode(", ", $deletedFiles)]);
} else {
    echo json_encode(["error" => implode("; ", $errors) . ". Trash items deleted: " . implode(", ", $deletedFiles)]);
}
exit;
?>