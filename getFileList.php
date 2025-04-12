<?php
require_once 'config.php';
header('Content-Type: application/json');

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

$folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';
// Allow only safe characters in the folder parameter (letters, numbers, underscores, dashes, spaces, and forward slashes).
if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
    echo json_encode(["error" => "Invalid folder name."]);
    exit;
}

// Determine the directory based on the folder parameter.
if ($folder !== 'root') {
    $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
} else {
    $directory = UPLOAD_DIR;
}

/**
 * Helper: Generate the metadata file path for a given folder.
 */
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

$metadataFile = getMetadataFilePath($folder);
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];

if (!is_dir($directory)) {
    echo json_encode(["error" => "Directory not found."]);
    exit;
}

$files = array_values(array_diff(scandir($directory), array('.', '..')));
$fileList = [];

// Define a safe file name pattern: letters, numbers, underscores, dashes, dots, parentheses, and spaces.
$safeFileNamePattern = REGEX_FILE_NAME;

foreach ($files as $file) {
    // Skip hidden files (those that begin with a dot)
    if (substr($file, 0, 1) === '.') {
        continue;
    }
    
    $filePath = $directory . DIRECTORY_SEPARATOR . $file;
    // Only include files (skip directories)
    if (!is_file($filePath)) continue;
    
    // Optionally, skip files with unsafe names.
    if (!preg_match($safeFileNamePattern, $file)) {
        continue;
    }
    
    // Since metadata is stored per folder, the key is simply the file name.
    $metaKey = $file;
    $fileDateModified = filemtime($filePath) ? date(DATE_TIME_FORMAT, filemtime($filePath)) : "Unknown";
    $fileUploadedDate = isset($metadata[$metaKey]["uploaded"]) ? $metadata[$metaKey]["uploaded"] : "Unknown";
    $fileUploader = isset($metadata[$metaKey]["uploader"]) ? $metadata[$metaKey]["uploader"] : "Unknown";

    $fileSizeBytes = filesize($filePath);
    if ($fileSizeBytes >= 1073741824) {
        $fileSizeFormatted = sprintf("%.1f GB", $fileSizeBytes / 1073741824);
    } elseif ($fileSizeBytes >= 1048576) {
        $fileSizeFormatted = sprintf("%.1f MB", $fileSizeBytes / 1048576);
    } elseif ($fileSizeBytes >= 1024) {
        $fileSizeFormatted = sprintf("%.1f KB", $fileSizeBytes / 1024);
    } else {
        $fileSizeFormatted = sprintf("%s bytes", number_format($fileSizeBytes));
    }

    // Build the basic file entry.
    $fileEntry = [
        'name' => $file,
        'modified' => $fileDateModified,
        'uploaded' => $fileUploadedDate,
        'size' => $fileSizeFormatted,
        'uploader' => $fileUploader,
        'tags' => isset($metadata[$metaKey]['tags']) ? $metadata[$metaKey]['tags'] : []
    ];

    // Add file content for text-based files.
    if (preg_match('/\.(txt|html|htm|md|js|css|json|xml|php|py|ini|conf|log)$/i', $file)) {
        $content = file_get_contents($filePath);
        $fileEntry['content'] = $content;
    }
    
    $fileList[] = $fileEntry;
}

// Load global tags from createdTags.json.
$globalTagsFile = META_DIR . "createdTags.json";
$globalTags = file_exists($globalTagsFile) ? json_decode(file_get_contents($globalTagsFile), true) : [];

echo json_encode(["files" => $fileList, "globalTags" => $globalTags]);
?>