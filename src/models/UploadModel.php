<?php
// src/models/UploadModel.php

require_once PROJECT_ROOT . '/config/config.php';

class UploadModel {
    /**
     * Handles file uploads – supports both chunked uploads and full (non-chunked) uploads.
     *
     * @param array $post The $_POST array.
     * @param array $files The $_FILES array.
     * @return array Returns an associative array with "success" on success or "error" on failure.
     */
    public static function handleUpload(array $post, array $files): array {
        // If this is a GET request for testing chunk existence.
        if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($post['resumableTest'])) {
            $chunkNumber = intval($post['resumableChunkNumber']);
            $resumableIdentifier = $post['resumableIdentifier'] ?? '';
            $folder = isset($post['folder']) ? trim($post['folder']) : 'root';
            $baseUploadDir = UPLOAD_DIR;
            if ($folder !== 'root') {
                $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
            }
            $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
            $chunkFile = $tempDir . $chunkNumber;
            return ["status" => file_exists($chunkFile) ? "found" : "not found"];
        }
        
        // Handle chunked uploads.
        if (isset($post['resumableChunkNumber'])) {
            $chunkNumber         = intval($post['resumableChunkNumber']);
            $totalChunks         = intval($post['resumableTotalChunks']);
            $resumableIdentifier = $post['resumableIdentifier'] ?? '';
            $resumableFilename   = urldecode(basename($post['resumableFilename']));
            
            // Validate file name.
            if (!preg_match(REGEX_FILE_NAME, $resumableFilename)) {
                return ["error" => "Invalid file name: $resumableFilename"];
            }
            
            $folder = isset($post['folder']) ? trim($post['folder']) : 'root';
            if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
                return ["error" => "Invalid folder name"];
            }
            
            $baseUploadDir = UPLOAD_DIR;
            if ($folder !== 'root') {
                $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
            }
            if (!is_dir($baseUploadDir) && !mkdir($baseUploadDir, 0775, true)) {
                return ["error" => "Failed to create upload directory"];
            }
            
            $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
            if (!is_dir($tempDir) && !mkdir($tempDir, 0775, true)) {
                return ["error" => "Failed to create temporary chunk directory"];
            }
            
            if (!isset($files["file"]) || $files["file"]["error"] !== UPLOAD_ERR_OK) {
                return ["error" => "Upload error on chunk $chunkNumber"];
            }
            
            $chunkFile = $tempDir . $chunkNumber;
            if (!move_uploaded_file($files["file"]["tmp_name"], $chunkFile)) {
                return ["error" => "Failed to move uploaded chunk $chunkNumber"];
            }
            
            // Check if all chunks are present.
            $allChunksPresent = true;
            for ($i = 1; $i <= $totalChunks; $i++) {
                if (!file_exists($tempDir . $i)) {
                    $allChunksPresent = false;
                    break;
                }
            }
            if (!$allChunksPresent) {
                return ["status" => "chunk uploaded"];
            }
            
            // Merge chunks.
            $targetPath = $baseUploadDir . $resumableFilename;
            if (!$out = fopen($targetPath, "wb")) {
                return ["error" => "Failed to open target file for writing"];
            }
            for ($i = 1; $i <= $totalChunks; $i++) {
                $chunkPath = $tempDir . $i;
                if (!file_exists($chunkPath)) {
                    fclose($out);
                    return ["error" => "Chunk $i missing during merge"];
                }
                if (!$in = fopen($chunkPath, "rb")) {
                    fclose($out);
                    return ["error" => "Failed to open chunk $i"];
                }
                while ($buff = fread($in, 4096)) {
                    fwrite($out, $buff);
                }
                fclose($in);
            }
            fclose($out);
            
            // Update metadata.
            $relativeFolder = $folder;
            $metadataKey = ($relativeFolder === '' || strtolower($relativeFolder) === 'root') ? "root" : $relativeFolder;
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
            $metadataFile = META_DIR . $metadataFileName;
            $uploadedDate = date(DATE_TIME_FORMAT);
            $uploader = $_SESSION['username'] ?? "Unknown";
            $metadataCollection = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
            if (!is_array($metadataCollection)) {
                $metadataCollection = [];
            }
            if (!isset($metadataCollection[$resumableFilename])) {
                $metadataCollection[$resumableFilename] = [
                    "uploaded" => $uploadedDate,
                    "uploader" => $uploader
                ];
                file_put_contents($metadataFile, json_encode($metadataCollection, JSON_PRETTY_PRINT));
            }
            
            // Cleanup temporary directory.
            $rrmdir = function($dir) use (&$rrmdir) {
                if (!is_dir($dir)) return;
                $iterator = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($iterator as $item) {
                    $item->isDir() ? rmdir($item->getRealPath()) : unlink($item->getRealPath());
                }
                rmdir($dir);
            };
            $rrmdir($tempDir);
            
            return ["success" => "File uploaded successfully"];
        } else {
            // Handle full upload (non-chunked).
            $folder = isset($post['folder']) ? trim($post['folder']) : 'root';
            if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
                return ["error" => "Invalid folder name"];
            }
            
            $baseUploadDir = UPLOAD_DIR;
            if ($folder !== 'root') {
                $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
            }
            if (!is_dir($baseUploadDir) && !mkdir($baseUploadDir, 0775, true)) {
                return ["error" => "Failed to create upload directory"];
            }
            
            $safeFileNamePattern = REGEX_FILE_NAME;
            $metadataCollection = [];
            $metadataChanged = [];
            
            foreach ($files["file"]["name"] as $index => $fileName) {
                $safeFileName = trim(urldecode(basename($fileName)));
                if (!preg_match($safeFileNamePattern, $safeFileName)) {
                    return ["error" => "Invalid file name: " . $fileName];
                }
                $relativePath = '';
                if (isset($post['relativePath'])) {
                    $relativePath = is_array($post['relativePath']) ? $post['relativePath'][$index] ?? '' : $post['relativePath'];
                }
                $uploadDir = $baseUploadDir;
                if (!empty($relativePath)) {
                    $subDir = dirname($relativePath);
                    if ($subDir !== '.' && $subDir !== '') {
                        $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $subDir) . DIRECTORY_SEPARATOR;
                    }
                    $safeFileName = basename($relativePath);
                }
                if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true)) {
                    return ["error" => "Failed to create subfolder"];
                }
                $targetPath = $uploadDir . $safeFileName;
                if (move_uploaded_file($files["file"]["tmp_name"][$index], $targetPath)) {
                    $folderPath = $folder;
                    $metadataKey = ($folderPath === '' || strtolower($folderPath) === 'root') ? "root" : $folderPath;
                    $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
                    $metadataFile = META_DIR . $metadataFileName;
                    if (!isset($metadataCollection[$metadataKey])) {
                        $metadataCollection[$metadataKey] = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
                        if (!is_array($metadataCollection[$metadataKey])) {
                            $metadataCollection[$metadataKey] = [];
                        }
                        $metadataChanged[$metadataKey] = false;
                    }
                    if (!isset($metadataCollection[$metadataKey][$safeFileName])) {
                        $uploadedDate = date(DATE_TIME_FORMAT);
                        $uploader = $_SESSION['username'] ?? "Unknown";
                        $metadataCollection[$metadataKey][$safeFileName] = [
                            "uploaded" => $uploadedDate,
                            "uploader" => $uploader
                        ];
                        $metadataChanged[$metadataKey] = true;
                    }
                } else {
                    return ["error" => "Error uploading file"];
                }
            }
            
            foreach ($metadataCollection as $folderKey => $data) {
                if ($metadataChanged[$folderKey]) {
                    $metadataFileName = str_replace(['/', '\\', ' '], '-', $folderKey) . '_metadata.json';
                    $metadataFile = META_DIR . $metadataFileName;
                    file_put_contents($metadataFile, json_encode($data, JSON_PRETTY_PRINT));
                }
            }
            return ["success" => "Files uploaded successfully"];
        }
    }

        /**
     * Recursively removes a directory and its contents.
     *
     * @param string $dir The directory to remove.
     * @return void
     */
    private static function rrmdir(string $dir): void {
        if (!is_dir($dir)) {
            return;
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $file) {
            if ($file->isDir()) {
                rmdir($file->getRealPath());
            } else {
                unlink($file->getRealPath());
            }
        }
        rmdir($dir);
    }
    
    /**
     * Removes the temporary chunk directory for resumable uploads.
     *
     * The folder name is expected to exactly match the "resumable_" pattern.
     *
     * @param string $folder The folder name provided (URL-decoded).
     * @return array Returns a status array indicating success or error.
     */
    public static function removeChunks(string $folder): array {
        $folder = urldecode($folder);
        // The folder name should exactly match the "resumable_" pattern.
        $regex = "/^resumable_" . PATTERN_FOLDER_NAME . "$/u";
        if (!preg_match($regex, $folder)) {
            return ["error" => "Invalid folder name"];
        }
        
        $tempDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
        if (!is_dir($tempDir)) {
            return ["success" => true, "message" => "Temporary folder already removed."];
        }
        
        self::rrmdir($tempDir);
        
        if (!is_dir($tempDir)) {
            return ["success" => true, "message" => "Temporary folder removed."];
        } else {
            return ["error" => "Failed to remove temporary folder."];
        }
    }
}