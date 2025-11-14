<?php
// src/models/UploadModel.php

require_once PROJECT_ROOT . '/config/config.php';

class UploadModel
{
    private static function sanitizeFolder(string $folder): string
    {
        // decode "%20", normalise slashes & trim via ACL helper
        $f = ACL::normalizeFolder(rawurldecode($folder));

        // model uses '' to represent root
        if ($f === 'root') {
            return '';
        }

        // forbid dot segments / empty parts
        foreach (explode('/', $f) as $seg) {
            if ($seg === '' || $seg === '.' || $seg === '..') {
                return '';
            }
        }

        // allow spaces & unicode via your global regex
        // (REGEX_FOLDER_NAME validates a path "seg(/seg)*")
        if (!preg_match(REGEX_FOLDER_NAME, $f)) {
            return '';
        }

        return $f; // safe, normalised, with spaces allowed
    }

    public static function handleUpload(array $post, array $files): array
    {
        // --- GET resumable test (make folder handling consistent) ---
        if (
            (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET')
            && isset($post['resumableChunkNumber'], $post['resumableIdentifier'])
        ) {
            $chunkNumber         = (int)($post['resumableChunkNumber'] ?? 0);
            $resumableIdentifier = $post['resumableIdentifier'] ?? '';
            $folderSan           = self::sanitizeFolder((string)($post['folder'] ?? 'root'));

            $baseUploadDir = UPLOAD_DIR;
            if ($folderSan !== '') {
                $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR
                    . str_replace('/', DIRECTORY_SEPARATOR, $folderSan) . DIRECTORY_SEPARATOR;
            }

            $tempDir   = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
            $chunkFile = $tempDir . $chunkNumber;

            return ['status' => file_exists($chunkFile) ? 'found' : 'not found'];
        }

        // --- CHUNKED (Resumable.js POST uploads) ---
        if (isset($post['resumableChunkNumber'])) {
            $chunkNumber         = (int)$post['resumableChunkNumber'];
            $totalChunks         = (int)$post['resumableTotalChunks'];
            $resumableIdentifier = $post['resumableIdentifier'] ?? '';
            $resumableFilename   = urldecode(basename($post['resumableFilename'] ?? ''));

            if (!preg_match(REGEX_FILE_NAME, $resumableFilename)) {
                return ['error' => "Invalid file name: $resumableFilename"];
            }

            $folderSan = self::sanitizeFolder((string)($post['folder'] ?? 'root'));

            if (empty($files['file']) || !isset($files['file']['name'])) {
                return ['error' => 'No files received'];
            }

            $baseUploadDir = UPLOAD_DIR;
            if ($folderSan !== '') {
                $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR
                    . str_replace('/', DIRECTORY_SEPARATOR, $folderSan) . DIRECTORY_SEPARATOR;
            }
            if (!is_dir($baseUploadDir) && !mkdir($baseUploadDir, 0775, true)) {
                return ['error' => 'Failed to create upload directory'];
            }

            $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
            if (!is_dir($tempDir) && !mkdir($tempDir, 0775, true)) {
                return ['error' => 'Failed to create temporary chunk directory'];
            }

            $chunkErr = $files['file']['error'] ?? UPLOAD_ERR_NO_FILE;
            if ($chunkErr !== UPLOAD_ERR_OK) {
                return ['error' => "Upload error on chunk $chunkNumber"];
            }

            $chunkFile = $tempDir . $chunkNumber;
            $tmpName   = $files['file']['tmp_name'] ?? null;
            if (!$tmpName || !move_uploaded_file($tmpName, $chunkFile)) {
                return ['error' => "Failed to move uploaded chunk $chunkNumber"];
            }

            // All chunks present?
            for ($i = 1; $i <= $totalChunks; $i++) {
                if (!file_exists($tempDir . $i)) {
                    return ['status' => 'chunk uploaded'];
                }
            }

            // Merge
            $targetPath = $baseUploadDir . $resumableFilename;
            if (!$out = fopen($targetPath, 'wb')) {
                return ['error' => 'Failed to open target file for writing'];
            }
            for ($i = 1; $i <= $totalChunks; $i++) {
                $chunkPath = $tempDir . $i;
                if (!file_exists($chunkPath)) {
                    fclose($out);
                    return ['error' => "Chunk $i missing during merge"];
                }
                if (!$in = fopen($chunkPath, 'rb')) {
                    fclose($out);
                    return ['error' => "Failed to open chunk $i"];
                }
                while ($buff = fread($in, 4096)) {
                    fwrite($out, $buff);
                }
                fclose($in);
            }
            fclose($out);

            // Metadata
            $metadataKey      = ($folderSan === '') ? 'root' : $folderSan;
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
            $metadataFile     = META_DIR . $metadataFileName;
            $uploadedDate     = date(DATE_TIME_FORMAT);
            $uploader         = $_SESSION['username'] ?? 'Unknown';
            $collection       = file_exists($metadataFile)
                ? json_decode(file_get_contents($metadataFile), true)
                : [];
            if (!is_array($collection)) {
                $collection = [];
            }
            if (!isset($collection[$resumableFilename])) {
                $collection[$resumableFilename] = [
                    'uploaded' => $uploadedDate,
                    'uploader' => $uploader,
                ];
                file_put_contents($metadataFile, json_encode($collection, JSON_PRETTY_PRINT));
            }

            // Cleanup temp
            self::rrmdir($tempDir);

            return ['success' => 'File uploaded successfully'];
        }

        // --- NON-CHUNKED (drag-and-drop / folder uploads) ---
        $folderSan = self::sanitizeFolder((string)($post['folder'] ?? 'root'));

        $baseUploadDir = UPLOAD_DIR;
        if ($folderSan !== '') {
            $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR
                . str_replace('/', DIRECTORY_SEPARATOR, $folderSan) . DIRECTORY_SEPARATOR;
        }
        if (!is_dir($baseUploadDir) && !mkdir($baseUploadDir, 0775, true)) {
            return ['error' => 'Failed to create upload directory'];
        }

        $safeFileNamePattern = REGEX_FILE_NAME;
        $metadataCollection  = [];
        $metadataChanged     = [];

        foreach ($files['file']['name'] as $index => $fileName) {
            if (($files['file']['error'][$index] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
                return ['error' => 'Error uploading file'];
            }

            $safeFileName = trim(urldecode(basename($fileName)));
            if (!preg_match($safeFileNamePattern, $safeFileName)) {
                return ['error' => 'Invalid file name: ' . $fileName];
            }

            $relativePath = '';
            if (isset($post['relativePath'])) {
                $relativePath = is_array($post['relativePath'])
                    ? ($post['relativePath'][$index] ?? '')
                    : $post['relativePath'];
            }

            $uploadDir = rtrim($baseUploadDir, '/\\') . DIRECTORY_SEPARATOR;
            if (!empty($relativePath)) {
                $subDir = dirname($relativePath);
                if ($subDir !== '.' && $subDir !== '') {
                    $uploadDir = rtrim($baseUploadDir, '/\\') . DIRECTORY_SEPARATOR
                        . str_replace('/', DIRECTORY_SEPARATOR, $subDir) . DIRECTORY_SEPARATOR;
                }
                $safeFileName = basename($relativePath);
            }

            if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0775, true)) {
                return ['error' => 'Failed to create subfolder: ' . $uploadDir];
            }

            $targetPath = $uploadDir . $safeFileName;
            if (!move_uploaded_file($files['file']['tmp_name'][$index], $targetPath)) {
                return ['error' => 'Error uploading file'];
            }

            $metadataKey      = ($folderSan === '') ? 'root' : $folderSan;
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
            $metadataFile     = META_DIR . $metadataFileName;

            if (!isset($metadataCollection[$metadataKey])) {
                $metadataCollection[$metadataKey] = file_exists($metadataFile)
                    ? json_decode(file_get_contents($metadataFile), true)
                    : [];
                if (!is_array($metadataCollection[$metadataKey])) {
                    $metadataCollection[$metadataKey] = [];
                }
                $metadataChanged[$metadataKey] = false;
            }

            if (!isset($metadataCollection[$metadataKey][$safeFileName])) {
                $uploadedDate = date(DATE_TIME_FORMAT);
                $uploader     = $_SESSION['username'] ?? 'Unknown';
                $metadataCollection[$metadataKey][$safeFileName] = [
                    'uploaded' => $uploadedDate,
                    'uploader' => $uploader,
                ];
                $metadataChanged[$metadataKey] = true;
            }
        }

        foreach ($metadataCollection as $folderKey => $data) {
            if (!empty($metadataChanged[$folderKey])) {
                $metadataFileName = str_replace(['/', '\\', ' '], '-', $folderKey) . '_metadata.json';
                $metadataFile     = META_DIR . $metadataFileName;
                file_put_contents($metadataFile, json_encode($data, JSON_PRETTY_PRINT));
            }
        }

        return ['success' => 'Files uploaded successfully'];
    }

    /**
     * Recursively removes a directory and its contents.
     *
     * @param string $dir The directory to remove.
     * @return void
     */
    private static function rrmdir(string $dir): void
    {
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
    public static function removeChunks(string $folder): array
    {
        $folder = urldecode($folder);
        // The folder name should exactly match the "resumable_" pattern.
        $regex = "/^resumable_" . PATTERN_FOLDER_NAME . "$/u";
        if (!preg_match($regex, $folder)) {
            return ['error' => 'Invalid folder name'];
        }

        $tempDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
        if (!is_dir($tempDir)) {
            return ['success' => true, 'message' => 'Temporary folder already removed.'];
        }

        self::rrmdir($tempDir);

        if (!is_dir($tempDir)) {
            return ['success' => true, 'message' => 'Temporary folder removed.'];
        }

        return ['error' => 'Failed to remove temporary folder.'];
    }
}