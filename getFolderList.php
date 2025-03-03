<?php
require 'config.php';
header('Content-Type: application/json');

$folderList = [];
$dir = rtrim(UPLOAD_DIR, '/\\');
if (is_dir($dir)) {
    foreach (scandir($dir) as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            $folderList[] = $item;
        }
    }
}

echo json_encode($folderList);
?>
