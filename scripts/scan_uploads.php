<?php
/**
 * scan_uploads.php
 * Scans the uploads directory and creates metadata entries for new files/folders.
 */

require_once __DIR__ . '/../config/config.php';

// Resolve directories from CLI opts, env, or config.php constants (in that order).
$opt = getopt('', ['upload-dir::','metadata-dir::']) ?: [];
$uploadDir   = $opt['upload-dir']   ?? getenv('upload_dir')   ?? getenv('UPLOAD_DIR')   ?? (defined('UPLOAD_DIR') ? UPLOAD_DIR : null);
$metadataDir = $opt['metadata-dir'] ?? getenv('metadata_dir') ?? getenv('META_DIR')     ?? (defined('META_DIR')   ? META_DIR   : null);

if (!$uploadDir || !$metadataDir) {
    fwrite(STDERR, "Missing configuration for upload_dir or metadata_dir\n");
    exit(1);
}

// Normalize with exactly one trailing slash
$uploadDir   = rtrim($uploadDir, '/\\') . '/';
$metadataDir = rtrim($metadataDir, '/\\') . '/';

// Respect the app-wide timezone already set in config.php (do NOT force UTC here)

/**
 * Recursively list files and folders under $dir.
 * Skips symlinks and internal folders we don't want to index.
 */
function scanDirectory(string $dir): array {
    $entries = @scandir($dir);
    if ($entries === false) return [];

    $results = [];
    foreach ($entries as $name) {
        if ($name === '.' || $name === '..') continue;
        $path = $dir . $name;

        // Skip symlinks to avoid loops
        if (is_link($path)) continue;

        // Recurse into directories
        if (is_dir($path)) {
            $results[] = $path . '/';
            $results = array_merge($results, scanDirectory($path . '/'));
        } else {
            $results[] = $path;
        }
    }
    return $results;
}

/**
 * Build the metadata JSON path parallel to uploads/ for a given item.
 */
function metadataPath(string $itemPath, string $uploadDir, string $metadataDir): string {
    $relative = ltrim(str_replace($uploadDir, '', $itemPath), '/\\');
    return $metadataDir . $relative . '.json';
}

$allItems = scanDirectory($uploadDir);

foreach ($allItems as $item) {
    // Derive a relative path (used in metadata and for skip rules)
    $relative = ltrim(str_replace($uploadDir, '', $item), '/\\');

    // Skip some internal areas under uploads/
    if (strpos($relative, 'trash/') === 0 || strpos($relative, 'profile_pics/') === 0) {
        continue;
    }

    $metaPath = metadataPath($item, $uploadDir, $metadataDir);

    if (!file_exists($metaPath)) {
        $isDir = is_dir($item);
        $metadata = [
            'path'       => rtrim($relative, '/'),
            'type'       => $isDir ? 'folder' : 'file',
            'size'       => (!$isDir && is_file($item)) ? (int)filesize($item) : 0,
            'user'       => 'Imported',
            'uploadDate' => date('c'),
        ];

        // Ensure parent directory exists with sane perms (umask from start.sh handles final modes)
        $parent = dirname($metaPath);
        if (!is_dir($parent)) {
            @mkdir($parent, 0775, true);
        }

        if (@file_put_contents($metaPath, json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
            fwrite(STDERR, "Failed to write metadata: {$metaPath}\n");
        } else {
            echo "Created metadata for: {$relative}\n";
        }
    }
}
