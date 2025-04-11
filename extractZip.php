<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection ---
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
if ($receivedToken !== $_SESSION['csrf_token']) {
    http_response_code(403);
    echo json_encode(["error" => "Invalid CSRF token"]);
    exit;
}

// Ensure user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$username = $_SESSION['username'] ?? '';
$userPermissions = loadUserPermissions($username);
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to extract zip files"]);
        exit();
    }
}

// Read and decode the JSON input.
$rawData = file_get_contents("php://input");
$data = json_decode($rawData, true);
if (!is_array($data) || !isset($data['folder']) || !isset($data['files']) || !is_array($data['files'])) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid input."]);
    exit;
}

$folder = $data['folder'];
$files = $data['files'];

if (empty($files)) {
    http_response_code(400);
    echo json_encode(["error" => "No files specified."]);
    exit;
}

// Validate folder name (allow "root" or valid subfolder names).
if ($folder !== "root") {
    $parts = explode('/', $folder);
    foreach ($parts as $part) {
        if (empty($part) || $part === '.' || $part === '..' || !preg_match('/^[\p{L}\p{N}_\-\s\/\\\\]+$/u', $part)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }
    }
    $relativePath = implode(DIRECTORY_SEPARATOR, $parts) . DIRECTORY_SEPARATOR;
} else {
    $relativePath = "";
}

$baseDir = realpath(UPLOAD_DIR);
if ($baseDir === false) {
    http_response_code(500);
    echo json_encode(["error" => "Uploads directory not configured correctly."]);
    exit;
}

$folderPath = $baseDir . DIRECTORY_SEPARATOR . $relativePath;
$folderPathReal = realpath($folderPath);
if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
    http_response_code(404);
    echo json_encode(["error" => "Folder not found."]);
    exit;
}

// ---------- Metadata Setup ----------
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

$srcMetaFile = getMetadataFilePath($folder);
$destMetaFile = getMetadataFilePath($folder);
$srcMetadata = file_exists($srcMetaFile) ? json_decode(file_get_contents($srcMetaFile), true) : [];
$destMetadata = file_exists($destMetaFile) ? json_decode(file_get_contents($destMetaFile), true) : [];

$errors = [];
$allSuccess = true;
$extractedFiles = array(); // Array to collect names of extracted files
$safeFileNamePattern = '/^[\p{L}\p{N}\p{M}%\-\.\(\) _]+$/u';

// ---------- Process Each File ----------
foreach ($files as $zipFileName) {
    $originalName = basename(trim($zipFileName));
    // Process only .zip files.
    if (strtolower(substr($originalName, -4)) !== '.zip') {
        continue;
    }
    if (!preg_match($safeFileNamePattern, $originalName)) {
        $errors[] = "$originalName has an invalid name.";
        $allSuccess = false;
        continue;
    }
    
    $zipFilePath = $folderPathReal . DIRECTORY_SEPARATOR . $originalName;
    if (!file_exists($zipFilePath)) {
        $errors[] = "$originalName does not exist in folder.";
        $allSuccess = false;
        continue;
    }
    
    $zip = new ZipArchive();
    if ($zip->open($zipFilePath) !== TRUE) {
        $errors[] = "Could not open $originalName as a zip file.";
        $allSuccess = false;
        continue;
    }
    
    // Attempt extraction.
    if (!$zip->extractTo($folderPathReal)) {
        $errors[] = "Failed to extract $originalName.";
        $allSuccess = false;
    } else {
        // Collect extracted file names from this zip.
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);
            $extractedFileName = basename($entryName);
            if ($extractedFileName) {
                $extractedFiles[] = $extractedFileName;
            }
        }
        // Update metadata for each extracted file if the zip file has metadata.
        if (isset($srcMetadata[$originalName])) {
            $zipMeta = $srcMetadata[$originalName];
            // Iterate through all entries in the zip.
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $entryName = $zip->getNameIndex($i);
                $extractedFileName = basename($entryName);
                if ($extractedFileName) {
                    $destMetadata[$extractedFileName] = $zipMeta;
                }
            }
        }
    }
    $zip->close();
}

// Write updated metadata back to the destination metadata file.
if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT)) === false) {
    $errors[] = "Failed to update metadata.";
    $allSuccess = false;
}

if ($allSuccess) {
    echo json_encode(["success" => true, "extractedFiles" => $extractedFiles]);
} else {
    echo json_encode(["success" => false, "error" => implode(" ", $errors)]);
}
exit;
?>