<?php
require 'config.php';
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
        // Only process folder names that match the safe pattern.
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

$baseDir = rtrim(UPLOAD_DIR, '/\\');
$folderList = [];

if (is_dir($baseDir)) {
    $folderList = getSubfolders($baseDir);
}

echo json_encode($folderList);
?>