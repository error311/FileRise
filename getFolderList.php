<?php
require_once 'config.php';
header('Content-Type: application/json');

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

/**
 * Recursively scan a directory for subfolders.
 *
 * @param string $dir The full path to the directory.
 * @param string $relative The relative path from the base upload directory.
 * @return array An array of folder paths (relative to the base).
 */
function getSubfolders($dir, $relative = '') {
    $folders = [];
    $items = scandir($dir);
    // Allow letters, numbers, underscores, dashes, and spaces in folder names.
    $safeFolderNamePattern = '/^[A-Za-z0-9_\- ]+$/';
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        if (!preg_match($safeFolderNamePattern, $item)) {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            // Build the relative path.
            $folderPath = ($relative ? $relative . '/' : '') . $item;
            $folders[] = $folderPath;
            // Recursively get subfolders.
            $subFolders = getSubfolders($path, $folderPath);
            $folders = array_merge($folders, $subFolders);
        }
    }
    return $folders;
}

/**
 * Helper: Generate the metadata file path for a given folder.
 * For "root", it returns "root_metadata.json"; otherwise, it replaces
 * slashes, backslashes, and spaces with dashes and appends "_metadata.json".
 *
 * @param string $folder The folder's relative path.
 * @return string The full path to the folder's metadata file.
 */
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

$baseDir = rtrim(UPLOAD_DIR, '/\\');

// Build an array to hold folder information.
$folderInfoList = [];

// Include "root" as a folder.
$rootMetaFile = getMetadataFilePath('root');
$rootFileCount = 0;
if (file_exists($rootMetaFile)) {
    $rootMetadata = json_decode(file_get_contents($rootMetaFile), true);
    $rootFileCount = is_array($rootMetadata) ? count($rootMetadata) : 0;
}
$folderInfoList[] = [
    "folder" => "root",
    "fileCount" => $rootFileCount,
    "metadataFile" => basename($rootMetaFile)
];

// Scan for subfolders.
$subfolders = [];
if (is_dir($baseDir)) {
    $subfolders = getSubfolders($baseDir);
}

// For each subfolder, load its metadata and record file count.
foreach ($subfolders as $folder) {
    $metaFile = getMetadataFilePath($folder);
    $fileCount = 0;
    if (file_exists($metaFile)) {
        $metadata = json_decode(file_get_contents($metaFile), true);
        $fileCount = is_array($metadata) ? count($metadata) : 0;
    }
    $folderInfoList[] = [
        "folder" => $folder,
        "fileCount" => $fileCount,
        "metadataFile" => basename($metaFile)
    ];
}

echo json_encode($folderInfoList);
?>