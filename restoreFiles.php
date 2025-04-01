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

// Define the trash directory and trash metadata file.
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
// For "root", returns "root_metadata.json". Otherwise, replaces slashes, backslashes, and spaces with dashes and appends "_metadata.json".
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

// Read request body.
$data = json_decode(file_get_contents("php://input"), true);

// Validate request.
if (!isset($data['files']) || !is_array($data['files'])) {
    echo json_encode(["error" => "No file or folder identifiers provided"]);
    exit;
}

// Define a safe file name pattern.
$safeFileNamePattern = '/^[A-Za-z0-9_\-\.\(\) ]+$/';

$restoredItems = [];
$errors = [];

foreach ($data['files'] as $trashFileName) {
    $trashFileName = trim($trashFileName);
    if (!preg_match($safeFileNamePattern, $trashFileName)) {
        $errors[] = "$trashFileName has an invalid format.";
        continue;
    }
    
    // Find the matching trash record.
    $recordKey = null;
    foreach ($trashData as $key => $record) {
        if (isset($record['trashName']) && $record['trashName'] === $trashFileName) {
            $recordKey = $key;
            break;
        }
    }
    if ($recordKey === null) {
        $errors[] = "No trash record found for $trashFileName.";
        continue;
    }
    
    $record = $trashData[$recordKey];
    if (!isset($record['originalFolder']) || !isset($record['originalName'])) {
        $errors[] = "Incomplete trash record for $trashFileName.";
        continue;
    }
    $originalFolder = $record['originalFolder'];
    $originalName = $record['originalName'];

    // Convert the absolute original folder to a relative folder.
    $relativeFolder = 'root';
    if (strpos($originalFolder, UPLOAD_DIR) === 0) {
        $relativeFolder = trim(substr($originalFolder, strlen(UPLOAD_DIR)), '/\\');
        if ($relativeFolder === '') {
            $relativeFolder = 'root';
        }
    }
    
    // Build destination path.
    if ($relativeFolder !== 'root') {
        $destinationPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $relativeFolder . DIRECTORY_SEPARATOR . $originalName;
    } else {
        $destinationPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $originalName;
    }
    
    // If the record is for a folder, recreate the folder.
    if (isset($record['type']) && $record['type'] === 'folder') {
        if (!file_exists($destinationPath)) {
            if (mkdir($destinationPath, 0755, true)) {
                $restoredItems[] = $originalName . " (folder restored)";
            } else {
                $errors[] = "Failed to restore folder $originalName.";
                continue;
            }
        } else {
            $errors[] = "Folder already exists at destination: $originalName.";
            continue;
        }
        // Remove the trash record and continue.
        unset($trashData[$recordKey]);
        continue;
    }
    
    // For files: Ensure the destination directory exists.
    $destinationDir = dirname($destinationPath);
    if (!file_exists($destinationDir)) {
        if (!mkdir($destinationDir, 0755, true)) {
            $errors[] = "Failed to create destination folder for $originalName.";
            continue;
        }
    }
    
    if (file_exists($destinationPath)) {
        $errors[] = "File already exists at destination: $originalName.";
        continue;
    }
    
    // Move the file from trash to its original location.
    $sourcePath = $trashDir . $trashFileName;
    if (file_exists($sourcePath)) {
        if (rename($sourcePath, $destinationPath)) {
            $restoredItems[] = $originalName;
            // Update metadata for the restored file.
            $metadataFile = getMetadataFilePath($relativeFolder);
            $metadata = [];
            if (file_exists($metadataFile)) {
                $metadata = json_decode(file_get_contents($metadataFile), true);
                if (!is_array($metadata)) {
                    $metadata = [];
                }
            }
            $restoredMeta = [
                "uploaded" => isset($record['uploaded']) ? $record['uploaded'] : date(DATE_TIME_FORMAT),
                "uploader" => isset($record['uploader']) ? $record['uploader'] : "Unknown"
            ];
            $metadata[$originalName] = $restoredMeta;
            file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
            unset($trashData[$recordKey]);
        } else {
            $errors[] = "Failed to restore $originalName.";
        }
    } else {
        $errors[] = "Trash file not found: $trashFileName.";
    }
}

// Write back updated trash metadata.
file_put_contents($trashMetadataFile, json_encode(array_values($trashData), JSON_PRETTY_PRINT));

if (empty($errors)) {
    echo json_encode(["success" => "Items restored: " . implode(", ", $restoredItems)]);
} else {
    echo json_encode(["error" => implode("; ", $errors) . ". Items restored: " . implode(", ", $restoredItems)]);
}
exit;
?>