<?php
/**
 * scan_uploads.php
 * Scans the uploads directory and creates metadata entries for new files/folders using config settings.
 */

require_once __DIR__ . '/../config/config.php';

if (!isset($config['upload_dir']) || !isset($config['metadata_dir'])) {
    die("Missing configuration for upload_dir or metadata_dir\n");
}

$uploadDir = $config['upload_dir'];
$metadataDir = $config['metadata_dir'];
date_default_timezone_set('UTC');

function scanDirectory($dir) {
    $items = array_diff(scandir($dir), ['.', '..']);
    $results = [];

    foreach ($items as $item) {
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        $results[] = $path;

        if (is_dir($path)) {
            $results = array_merge($results, scanDirectory($path));
        }
    }

    return $results;
}

function metadataPath($filePath, $uploadDir, $metadataDir) {
    $relativePath = ltrim(str_replace($uploadDir, '', $filePath), '/');
    return $metadataDir . '/' . $relativePath . '.json';
}

$allItems = scanDirectory($uploadDir);

foreach ($allItems as $item) {
    $metaPath = metadataPath($item, $uploadDir, $metadataDir);

    if (!file_exists($metaPath)) {
        $type = is_dir($item) ? 'folder' : 'file';
        $size = is_file($item) ? filesize($item) : 0;

        $metadata = [
            'path' => str_replace($uploadDir, '', $item),
            'type' => $type,
            'size' => $size,
            'user' => 'Imported',
            'uploadDate' => date('c')
        ];

        if (!is_dir(dirname($metaPath))) {
            mkdir(dirname($metaPath), 0775, true);
        }

        file_put_contents($metaPath, json_encode($metadata, JSON_PRETTY_PRINT));
        echo "Created metadata for: {$item}\n";
    }
}
?>
