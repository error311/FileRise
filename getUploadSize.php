<?php
session_start();
require_once 'config.php';

function getDirectorySize($dir) {
    $size = 0;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir)) as $file) {
        if ($file->isFile()) {
            $size += $file->getSize();
        }
    }
    return $size;
}

echo getDirectorySize(UPLOAD_DIR);
?>
