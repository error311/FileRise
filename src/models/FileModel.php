<?php
// src/models/FileModel.php

require_once PROJECT_ROOT . '/config/config.php';

class FileModel {

    /**
     * Copies files from a source folder to a destination folder, updating metadata if available.
     *
     * @param string $sourceFolder The source folder (e.g. "root" or a subfolder)
     * @param string $destinationFolder The destination folder.
     * @param array  $files Array of file names to copy.
     * @return array Result with either "success" or "error" key.
     */
    public static function copyFiles($sourceFolder, $destinationFolder, $files) {
        $errors = [];
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        
        // Build source and destination directories.
        $sourceDir = ($sourceFolder === 'root')
            ? $baseDir . DIRECTORY_SEPARATOR
            : $baseDir . DIRECTORY_SEPARATOR . trim($sourceFolder, "/\\ ") . DIRECTORY_SEPARATOR;
        $destDir = ($destinationFolder === 'root')
            ? $baseDir . DIRECTORY_SEPARATOR
            : $baseDir . DIRECTORY_SEPARATOR . trim($destinationFolder, "/\\ ") . DIRECTORY_SEPARATOR;
        
        // Get metadata file paths.
        $srcMetaFile = self::getMetadataFilePath($sourceFolder);
        $destMetaFile = self::getMetadataFilePath($destinationFolder);
        
        $srcMetadata = file_exists($srcMetaFile) ? json_decode(file_get_contents($srcMetaFile), true) : [];
        $destMetadata = file_exists($destMetaFile) ? json_decode(file_get_contents($destMetaFile), true) : [];
        
        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;
        
        foreach ($files as $fileName) {
            // Get the clean file name.
            $originalName = basename(trim($fileName));
            $basename = $originalName;
            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has an invalid name.";
                continue;
            }
            
            $srcPath = $sourceDir . $originalName;
            $destPath = $destDir . $basename;
            
            clearstatcache();
            if (!file_exists($srcPath)) {
                $errors[] = "$originalName does not exist in source.";
                continue;
            }
            
            // If a file with the same name exists at the destination, create a unique name.
            if (file_exists($destPath)) {
                $uniqueName = self::getUniqueFileName($destDir, $basename);
                $basename = $uniqueName;
                $destPath = $destDir . $uniqueName;
            }
            
            if (!copy($srcPath, $destPath)) {
                $errors[] = "Failed to copy $basename.";
                continue;
            }
            
            // Update destination metadata if metadata exists in source.
            if (isset($srcMetadata[$originalName])) {
                $destMetadata[$basename] = $srcMetadata[$originalName];
            }
        }
        
        if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT)) === false) {
            $errors[] = "Failed to update destination metadata.";
        }
        
        if (empty($errors)) {
            return ["success" => "Files copied successfully"];
        } else {
            return ["error" => implode("; ", $errors)];
        }
    }

    /**
     * Generates the metadata file path for a given folder.
     *
     * @param string $folder
     * @return string
     */
    private static function getMetadataFilePath($folder) {
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            return META_DIR . "root_metadata.json";
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
    }

    /**
     * Generates a unique file name if a file with the same name exists in the destination directory.
     *
     * @param string $destDir
     * @param string $fileName
     * @return string
     */
    private static function getUniqueFileName($destDir, $fileName) {
        $fullPath = $destDir . $fileName;
        clearstatcache(true, $fullPath);
        if (!file_exists($fullPath)) {
            return $fileName;
        }
        $basename = pathinfo($fileName, PATHINFO_FILENAME);
        $extension = pathinfo($fileName, PATHINFO_EXTENSION);
        $counter = 1;
        do {
            $newName = $basename . " (" . $counter . ")" . ($extension ? "." . $extension : "");
            $newFullPath = $destDir . $newName;
            clearstatcache(true, $newFullPath);
            $counter++;
        } while (file_exists($destDir . $newName));
        return $newName;
    }

    /**
     * Deletes (i.e. moves to Trash) the specified files from a given folder
     * and updates metadata accordingly.
     *
     * @param string $folder The folder (or "root") from which files are deleted.
     * @param array $files The array of file names to delete.
     * @return array An associative array with a "success" or "error" message.
     */
    public static function deleteFiles($folder, $files) {
        $errors = [];
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        
        // Determine the upload directory.
        $uploadDir = ($folder === 'root')
            ? $baseDir . DIRECTORY_SEPARATOR
            : $baseDir . DIRECTORY_SEPARATOR . trim($folder, "/\\ ") . DIRECTORY_SEPARATOR;
        
        // Setup the Trash folder and metadata.
        $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!file_exists($trashDir)) {
            mkdir($trashDir, 0755, true);
        }
        $trashMetadataFile = $trashDir . "trash.json";
        $trashData = file_exists($trashMetadataFile)
                     ? json_decode(file_get_contents($trashMetadataFile), true)
                     : [];
        if (!is_array($trashData)) {
            $trashData = [];
        }
        
        // Load folder metadata if available.
        $metadataFile = self::getMetadataFilePath($folder);
        $folderMetadata = file_exists($metadataFile)
                          ? json_decode(file_get_contents($metadataFile), true)
                          : [];
        if (!is_array($folderMetadata)) {
            $folderMetadata = [];
        }
        
        $movedFiles = [];
        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;
        
        foreach ($files as $fileName) {
            $basename = basename(trim($fileName));
            
            // Validate the file name.
            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has an invalid name.";
                continue;
            }
            
            $filePath = $uploadDir . $basename;
            
            // Check if file exists.
            if (file_exists($filePath)) {
                // Append a timestamp to create a unique trash file name.
                $timestamp = time();
                $trashFileName = $basename . "_" . $timestamp;
                if (rename($filePath, $trashDir . $trashFileName)) {
                    $movedFiles[] = $basename;
                    // Record trash metadata for possible restoration.
                    $trashData[] = [
                        'type'           => 'file',
                        'originalFolder' => $uploadDir,
                        'originalName'   => $basename,
                        'trashName'      => $trashFileName,
                        'trashedAt'      => $timestamp,
                        'uploaded'       => isset($folderMetadata[$basename]['uploaded'])
                                              ? $folderMetadata[$basename]['uploaded'] : "Unknown",
                        'uploader'       => isset($folderMetadata[$basename]['uploader'])
                                              ? $folderMetadata[$basename]['uploader'] : "Unknown",
                        'deletedBy'      => $_SESSION['username'] ?? "Unknown"
                    ];
                } else {
                    $errors[] = "Failed to move $basename to Trash.";
                    continue;
                }
            } else {
                // If file does not exist, consider it already removed.
                $movedFiles[] = $basename;
            }
        }
        
        // Save updated trash metadata.
        file_put_contents($trashMetadataFile, json_encode($trashData, JSON_PRETTY_PRINT));
        
        // Remove deleted file entries from folder metadata.
        if (file_exists($metadataFile)) {
            $metadata = json_decode(file_get_contents($metadataFile), true);
            if (is_array($metadata)) {
                foreach ($movedFiles as $delFile) {
                    if (isset($metadata[$delFile])) {
                        unset($metadata[$delFile]);
                    }
                }
                file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
            }
        }
        
        if (empty($errors)) {
            return ["success" => "Files moved to Trash: " . implode(", ", $movedFiles)];
        } else {
            return ["error" => implode("; ", $errors) . ". Files moved to Trash: " . implode(", ", $movedFiles)];
        }
    }

        /**
     * Moves files from a source folder to a destination folder and updates metadata.
     *
     * @param string $sourceFolder The source folder (e.g., "root" or a subfolder).
     * @param string $destinationFolder The destination folder.
     * @param array  $files An array of file names to move.
     * @return array An associative array with either a "success" key or an "error" key.
     */
    public static function moveFiles($sourceFolder, $destinationFolder, $files) {
        $errors = [];
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        
        // Build source and destination directories.
        $sourceDir = ($sourceFolder === 'root')
            ? $baseDir . DIRECTORY_SEPARATOR
            : $baseDir . DIRECTORY_SEPARATOR . trim($sourceFolder, "/\\ ") . DIRECTORY_SEPARATOR;
        $destDir = ($destinationFolder === 'root')
            ? $baseDir . DIRECTORY_SEPARATOR
            : $baseDir . DIRECTORY_SEPARATOR . trim($destinationFolder, "/\\ ") . DIRECTORY_SEPARATOR;
        
        // Ensure destination directory exists.
        if (!is_dir($destDir)) {
            if (!mkdir($destDir, 0775, true)) {
                return ["error" => "Could not create destination folder"];
            }
        }
        
        // Get metadata file paths.
        $srcMetaFile = self::getMetadataFilePath($sourceFolder);
        $destMetaFile = self::getMetadataFilePath($destinationFolder);
        
        $srcMetadata = file_exists($srcMetaFile) ? json_decode(file_get_contents($srcMetaFile), true) : [];
        $destMetadata = file_exists($destMetaFile) ? json_decode(file_get_contents($destMetaFile), true) : [];
        if (!is_array($srcMetadata)) {
            $srcMetadata = [];
        }
        if (!is_array($destMetadata)) {
            $destMetadata = [];
        }
        
        $movedFiles = [];
        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;
        
        foreach ($files as $fileName) {
            // Save the original file name for metadata lookup.
            $originalName = basename(trim($fileName));
            $basename = $originalName;
            
            // Validate the file name.
            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has invalid characters.";
                continue;
            }
            
            $srcPath = $sourceDir . $originalName;
            $destPath = $destDir . $basename;
            
            clearstatcache();
            if (!file_exists($srcPath)) {
                $errors[] = "$originalName does not exist in source.";
                continue;
            }
            
            // If a file with the same name exists in destination, generate a unique name.
            if (file_exists($destPath)) {
                $uniqueName = self::getUniqueFileName($destDir, $basename);
                $basename = $uniqueName;
                $destPath = $destDir . $uniqueName;
            }
            
            if (!rename($srcPath, $destPath)) {
                $errors[] = "Failed to move $basename.";
                continue;
            }
            
            $movedFiles[] = $originalName;
            // Update destination metadata: if metadata for the original file exists in source, move it under the new name.
            if (isset($srcMetadata[$originalName])) {
                $destMetadata[$basename] = $srcMetadata[$originalName];
                unset($srcMetadata[$originalName]);
            }
        }
        
        // Write back updated metadata.
        if (file_put_contents($srcMetaFile, json_encode($srcMetadata, JSON_PRETTY_PRINT)) === false) {
            $errors[] = "Failed to update source metadata.";
        }
        if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT)) === false) {
            $errors[] = "Failed to update destination metadata.";
        }
        
        if (empty($errors)) {
            return ["success" => "Files moved successfully"];
        } else {
            return ["error" => implode("; ", $errors)];
        }
    }

        /**
     * Renames a file within a given folder and updates folder metadata.
     *
     * @param string $folder The folder where the file is located (or "root" for the base directory).
     * @param string $oldName The current name of the file.
     * @param string $newName The new name for the file.
     * @return array An associative array with either "success" (and newName) or "error" message.
     */
    public static function renameFile($folder, $oldName, $newName) {
        // Determine the directory path.
        $directory = ($folder !== 'root')
            ? rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . trim($folder, "/\\ ") . DIRECTORY_SEPARATOR
            : UPLOAD_DIR;
        
        // Sanitize file names.
        $oldName = basename(trim($oldName));
        $newName = basename(trim($newName));
        
        // Validate file names using REGEX_FILE_NAME.
        if (!preg_match(REGEX_FILE_NAME, $oldName) || !preg_match(REGEX_FILE_NAME, $newName)) {
            return ["error" => "Invalid file name."];
        }
        
        $oldPath = $directory . $oldName;
        $newPath = $directory . $newName;
        
        // Helper: Generate a unique file name if the new name already exists.
        if (file_exists($newPath)) {
            $newName = self::getUniqueFileName($directory, $newName);
            $newPath = $directory . $newName;
        }
        
        // Check that the old file exists.
        if (!file_exists($oldPath)) {
            return ["error" => "File does not exist"];
        }
        
        // Perform the rename.
        if (rename($oldPath, $newPath)) {
            // Update the metadata file.
            $metadataKey = ($folder === 'root') ? "root" : $folder;
            $metadataFile = META_DIR . str_replace(['/', '\\', ' '], '-', trim($metadataKey)) . '_metadata.json';
    
            if (file_exists($metadataFile)) {
                $metadata = json_decode(file_get_contents($metadataFile), true);
                if (isset($metadata[$oldName])) {
                    $metadata[$newName] = $metadata[$oldName];
                    unset($metadata[$oldName]);
                    file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
                }
            }
            return ["success" => "File renamed successfully", "newName" => $newName];
        } else {
            return ["error" => "Error renaming file"];
        }
    }

/*
 * Save a file’s contents *and* record its metadata, including who uploaded it.
 *
 * @param string                $folder    Folder key (e.g. "root" or "invoices/2025")
 * @param string                $fileName  Basename of the file
 * @param resource|string       $content   File contents (stream or string)
 * @param string|null           $uploader  Username of uploader (if null, falls back to session)
 * @return array                          ["success"=>"…"] or ["error"=>"…"]
 */
public static function saveFile(string $folder, string $fileName, $content, ?string $uploader = null): array {
    // Sanitize inputs
    $folder   = trim($folder) ?: 'root';
    $fileName = basename(trim($fileName));

    // Validate folder name
    if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        return ["error" => "Invalid folder name"];
    }

    // Determine target directory
    $baseDir = rtrim(UPLOAD_DIR, '/\\');
    $targetDir = strtolower($folder) === 'root'
        ? $baseDir . DIRECTORY_SEPARATOR
        : $baseDir . DIRECTORY_SEPARATOR . trim($folder, "/\\ ") . DIRECTORY_SEPARATOR;

    // Security check
    if (strpos(realpath($targetDir), realpath($baseDir)) !== 0) {
        return ["error" => "Invalid folder path"];
    }

    // Ensure directory exists
    if (!is_dir($targetDir) && !mkdir($targetDir, 0775, true)) {
        return ["error" => "Failed to create destination folder"];
    }

    $filePath = $targetDir . $fileName;

    // ——— STREAM TO DISK ———
    if (is_resource($content)) {
        $out = fopen($filePath, 'wb');
        if ($out === false) {
            return ["error" => "Unable to open file for writing"];
        }
        stream_copy_to_stream($content, $out);
        fclose($out);
    } else {
        if (file_put_contents($filePath, (string)$content) === false) {
            return ["error" => "Error saving file"];
        }
    }

    // ——— UPDATE METADATA ———
    $metadataKey      = strtolower($folder) === "root" ? "root" : $folder;
    $metadataFileName = str_replace(['/', '\\', ' '], '-', trim($metadataKey)) . '_metadata.json';
    $metadataFilePath = META_DIR . $metadataFileName;

    // Load existing metadata
    $metadata = [];
    if (file_exists($metadataFilePath)) {
        $existing = @json_decode(file_get_contents($metadataFilePath), true);
        if (is_array($existing)) {
            $metadata = $existing;
        }
    }

    $currentTime = date(DATE_TIME_FORMAT);
    // Use passed-in uploader, or fall back to session
    if ($uploader === null) {
        $uploader = $_SESSION['username'] ?? "Unknown";
    }

    if (isset($metadata[$fileName])) {
        $metadata[$fileName]['modified'] = $currentTime;
        $metadata[$fileName]['uploader'] = $uploader;
    } else {
        $metadata[$fileName] = [
            "uploaded" => $currentTime,
            "modified" => $currentTime,
            "uploader" => $uploader
        ];
    }

    if (file_put_contents($metadataFilePath, json_encode($metadata, JSON_PRETTY_PRINT)) === false) {
        return ["error" => "Failed to update metadata"];
    }

    return ["success" => "File saved successfully"];
}

        /**
     * Validates and retrieves information needed to download a file.
     *
     * @param string $folder The folder from which to download (e.g., "root" or a subfolder).
     * @param string $file The file name.
     * @return array An associative array with "error" key on failure,
     *               or "filePath" and "mimeType" keys on success.
     */
    public static function getDownloadInfo($folder, $file) {
        // Validate file name using REGEX_FILE_NAME.
        $file = basename(trim($file));
        if (!preg_match(REGEX_FILE_NAME, $file)) {
            return ["error" => "Invalid file name."];
        }
        
        // Determine the real upload directory.
        $uploadDirReal = realpath(UPLOAD_DIR);
        if ($uploadDirReal === false) {
            return ["error" => "Server misconfiguration."];
        }
        
        // Determine directory based on folder.
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            $directory = $uploadDirReal;
        } else {
            // Prevent path traversal.
            if (strpos($folder, '..') !== false) {
                return ["error" => "Invalid folder name."];
            }
            $directoryPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . trim($folder, "/\\ ");
            $directory = realpath($directoryPath);
            if ($directory === false || strpos($directory, $uploadDirReal) !== 0) {
                return ["error" => "Invalid folder path."];
            }
        }
        
        // Build the file path.
        $filePath = $directory . DIRECTORY_SEPARATOR . $file;
        $realFilePath = realpath($filePath);
        
        // Ensure the file exists and is within the allowed directory.
        if ($realFilePath === false || strpos($realFilePath, $uploadDirReal) !== 0) {
            return ["error" => "Access forbidden."];
        }
        if (!file_exists($realFilePath)) {
            return ["error" => "File not found."];
        }
        
        // Get the MIME type.
        $mimeType = mime_content_type($realFilePath);
        return [
            "filePath" => $realFilePath,
            "mimeType" => $mimeType
        ];
    }

        /**
     * Creates a ZIP archive of the specified files from a given folder.
     *
     * @param string $folder The folder from which to zip the files (e.g., "root" or a subfolder).
     * @param array $files An array of file names to include in the ZIP.
     * @return array An associative array with either an "error" key or a "zipPath" key.
     */
    public static function createZipArchive($folder, $files) {
        // Validate and build folder path.
        $folder = trim($folder) ?: 'root';
        $baseDir = realpath(UPLOAD_DIR);
        if ($baseDir === false) {
            return ["error" => "Uploads directory not configured correctly."];
        }
        if (strtolower($folder) === 'root' || $folder === "") {
            $folderPathReal = $baseDir;
        } else {
            // Prevent path traversal.
            if (strpos($folder, '..') !== false) {
                return ["error" => "Invalid folder name."];
            }
            $folderPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . trim($folder, "/\\ ");
            $folderPathReal = realpath($folderPath);
            if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
                return ["error" => "Folder not found."];
            }
        }
        
        // Validate each file and build an array of files to zip.
        $filesToZip = [];
        foreach ($files as $fileName) {
            // Validate file name using REGEX_FILE_NAME.
            $fileName = basename(trim($fileName));
            if (!preg_match(REGEX_FILE_NAME, $fileName)) {
                continue;
            }
            $fullPath = $folderPathReal . DIRECTORY_SEPARATOR . $fileName;
            if (file_exists($fullPath)) {
                $filesToZip[] = $fullPath;
            }
        }
        if (empty($filesToZip)) {
            return ["error" => "No valid files found to zip."];
        }
        
        // Create a temporary ZIP file.
        $tempZip = tempnam(sys_get_temp_dir(), 'zip');
        unlink($tempZip); // Remove the temp file so that ZipArchive can create a new file.
        $tempZip .= '.zip';
        
        $zip = new ZipArchive();
        if ($zip->open($tempZip, ZipArchive::CREATE) !== TRUE) {
            return ["error" => "Could not create zip archive."];
        }
        // Add each file using its base name.
        foreach ($filesToZip as $filePath) {
            $zip->addFile($filePath, basename($filePath));
        }
        $zip->close();
        
        return ["zipPath" => $tempZip];
    }

        /**
     * Extracts ZIP archives from the specified folder.
     *
     * @param string $folder The folder from which ZIP files will be extracted (e.g., "root" or a subfolder).
     * @param array $files An array of ZIP file names to extract.
     * @return array An associative array with keys "success" (boolean), and either "extractedFiles" (array) on success or "error" (string) on failure.
     */
    public static function extractZipArchive($folder, $files) {
        $errors = [];
        $allSuccess = true;
        $extractedFiles = [];
        
        // Determine the base upload directory and build the folder path.
        $baseDir = realpath(UPLOAD_DIR);
        if ($baseDir === false) {
            return ["error" => "Uploads directory not configured correctly."];
        }
        
        if (strtolower($folder) === "root" || trim($folder) === "") {
            $relativePath = "";
        } else {
            $parts = explode('/', trim($folder, "/\\"));
            foreach ($parts as $part) {
                if (empty($part) || $part === '.' || $part === '..' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                    return ["error" => "Invalid folder name."];
                }
            }
            $relativePath = implode(DIRECTORY_SEPARATOR, $parts) . DIRECTORY_SEPARATOR;
        }
        
        $folderPath = $baseDir . DIRECTORY_SEPARATOR . $relativePath;
        $folderPathReal = realpath($folderPath);
        if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
            return ["error" => "Folder not found."];
        }
        
        // Prepare metadata.
        // Reuse our helper method if available; otherwise, re-create the logic.
        $metadataFile = self::getMetadataFilePath($folder);
        $srcMetadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
        if (!is_array($srcMetadata)) {
            $srcMetadata = [];
        }
        // For simplicity, we update the same metadata file after extraction.
        $destMetadata = $srcMetadata;
        
        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;
        
        // Process each ZIP file.
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
                // Collect extracted file names from this archive.
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $entryName = $zip->getNameIndex($i);
                    $extractedFileName = basename($entryName);
                    if ($extractedFileName) {
                        $extractedFiles[] = $extractedFileName;
                    }
                }
                // Update metadata for each extracted file if the ZIP has metadata.
                if (isset($srcMetadata[$originalName])) {
                    $zipMeta = $srcMetadata[$originalName];
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
        
        // Save updated metadata.
        if (file_put_contents($metadataFile, json_encode($destMetadata, JSON_PRETTY_PRINT)) === false) {
            $errors[] = "Failed to update metadata.";
            $allSuccess = false;
        }
        
        if ($allSuccess) {
            return ["success" => true, "extractedFiles" => $extractedFiles];
        } else {
            return ["success" => false, "error" => implode(" ", $errors)];
        }
    }

    /**
     * Retrieves the share record for a given token.
     *
     * @param string $token The share token.
     * @return array|null Returns the share record as an associative array, or null if not found.
     */
    public static function getShareRecord($token) {
        $shareFile = META_DIR . "share_links.json";
        if (!file_exists($shareFile)) {
            return null;
        }
        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return null;
        }
        return $shareLinks[$token];
    }

        /**
     * Creates a share link for a file.
     *
     * @param string $folder The folder containing the shared file (or "root").
     * @param string $file The name of the file being shared.
     * @param int $expirationMinutes The number of minutes until expiration.
     * @param string $password Optional password protecting the share.
     * @return array Returns an associative array with keys "token" and "expires" on success,
     *               or "error" on failure.
     */
    public static function createShareLink($folder, $file, $expirationSeconds = 3600, $password = "") {
        // Validate folder if necessary (this can also be done in the controller).
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }
        
        // Generate a secure token (32 hex characters).
        $token = bin2hex(random_bytes(16));
        
        // Calculate expiration (Unix timestamp).
        $expires = time() + $expirationSeconds;
        
        // Hash the password if provided.
        $hashedPassword = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : "";
        
        // File to store share links.
        $shareFile = META_DIR . "share_links.json";
        $shareLinks = [];
        if (file_exists($shareFile)) {
            $data = file_get_contents($shareFile);
            $shareLinks = json_decode($data, true);
            if (!is_array($shareLinks)) {
                $shareLinks = [];
            }
        }
        
        // Clean up expired share links.
        $currentTime = time();
        foreach ($shareLinks as $key => $link) {
            if ($link["expires"] < $currentTime) {
                unset($shareLinks[$key]);
            }
        }
        
        // Add new share record.
        $shareLinks[$token] = [
            "folder"   => $folder,
            "file"     => $file,
            "expires"  => $expires,
            "password" => $hashedPassword
        ];
        
        // Save the updated share links.
        if (file_put_contents($shareFile, json_encode($shareLinks, JSON_PRETTY_PRINT))) {
            return ["token" => $token, "expires" => $expires];
        } else {
            return ["error" => "Could not save share link."];
        }
    }

        /**
     * Retrieves and enriches trash records from the trash metadata file.
     *
     * @return array An array of trash items.
     */
    public static function getTrashItems() {
        $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $trashMetadataFile = $trashDir . "trash.json";
        $trashItems = [];
        if (file_exists($trashMetadataFile)) {
            $json = file_get_contents($trashMetadataFile);
            $trashItems = json_decode($json, true);
            if (!is_array($trashItems)) {
                $trashItems = [];
            }
        }
        
        // Enrich each trash record.
        foreach ($trashItems as &$item) {
            if (empty($item['deletedBy'])) {
                $item['deletedBy'] = "Unknown";
            }
            if (empty($item['uploaded']) || empty($item['uploader'])) {
                if (isset($item['originalFolder']) && isset($item['originalName'])) {
                    $metadataFile = self::getMetadataFilePath($item['originalFolder']);
                    if (file_exists($metadataFile)) {
                        $metadata = json_decode(file_get_contents($metadataFile), true);
                        if (is_array($metadata) && isset($metadata[$item['originalName']])) {
                            $item['uploaded'] = !empty($metadata[$item['originalName']]['uploaded']) ? $metadata[$item['originalName']]['uploaded'] : "Unknown";
                            $item['uploader'] = !empty($metadata[$item['originalName']]['uploader']) ? $metadata[$item['originalName']]['uploader'] : "Unknown";
                        } else {
                            $item['uploaded'] = "Unknown";
                            $item['uploader'] = "Unknown";
                        }
                    } else {
                        $item['uploaded'] = "Unknown";
                        $item['uploader'] = "Unknown";
                    }
                } else {
                    $item['uploaded'] = "Unknown";
                    $item['uploader'] = "Unknown";
                }
            }
        }
        unset($item);
        return $trashItems;
    }

        /**
     * Restores files from Trash based on an array of trash file identifiers.
     *
     * @param array $trashFiles An array of trash file names (i.e. the 'trashName' fields).
     * @return array An associative array with keys "restored" (an array of successfully restored items)
     *               and optionally an "error" message if any issues occurred.
     */
    public static function restoreFiles(array $trashFiles) {
        $errors = [];
        $restoredItems = [];
        
        // Setup Trash directory and trash metadata file.
        $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!file_exists($trashDir)) {
            mkdir($trashDir, 0755, true);
        }
        $trashMetadataFile = $trashDir . "trash.json";
        $trashData = [];
        if (file_exists($trashMetadataFile)) {
            $json = file_get_contents($trashMetadataFile);
            $trashData = json_decode($json, true);
            if (!is_array($trashData)) {
                $trashData = [];
            }
        }
        
        // Helper to get metadata file path for a folder.
        $getMetadataFilePath = function($folder) {
            if (strtolower($folder) === 'root' || trim($folder) === '') {
                return META_DIR . "root_metadata.json";
            }
            return META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
        };
        
        // Process each provided trash file name.
        foreach ($trashFiles as $trashFileName) {
            $trashFileName = trim($trashFileName);
            // Validate file name with REGEX_FILE_NAME.
            if (!preg_match(REGEX_FILE_NAME, $trashFileName)) {
                $errors[] = "$trashFileName has an invalid format.";
                continue;
            }
            
            // Locate the matching trash record.
            $recordKey = null;
            foreach ($trashData as $key => $record) {
                if (isset($record['trashName']) && $record['trashName'] === $trashFileName) {
                    $recordKey = $key;
                    break;
                }
            }
            if ($recordKey === null) {
                $errors[] = "No trash record found for $trashFileName.";
                continue;
            }
            
            $record = $trashData[$recordKey];
            if (!isset($record['originalFolder']) || !isset($record['originalName'])) {
                $errors[] = "Incomplete trash record for $trashFileName.";
                continue;
            }
            $originalFolder = $record['originalFolder'];
            $originalName = $record['originalName'];
            
            // Convert absolute original folder to relative folder.
            $relativeFolder = 'root';
            if (strpos($originalFolder, UPLOAD_DIR) === 0) {
                $relativeFolder = trim(substr($originalFolder, strlen(UPLOAD_DIR)), '/\\');
                if ($relativeFolder === '') {
                    $relativeFolder = 'root';
                }
            }
            
            // Build destination path.
            $destinationPath = (strtolower($relativeFolder) !== 'root')
                ? rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $relativeFolder . DIRECTORY_SEPARATOR . $originalName
                : rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $originalName;
            
            // Handle folder-type records if necessary.
            if (isset($record['type']) && $record['type'] === 'folder') {
                if (!file_exists($destinationPath)) {
                    if (mkdir($destinationPath, 0755, true)) {
                        $restoredItems[] = $originalName . " (folder restored)";
                    } else {
                        $errors[] = "Failed to restore folder $originalName.";
                        continue;
                    }
                } else {
                    $errors[] = "Folder already exists at destination: $originalName.";
                    continue;
                }
                unset($trashData[$recordKey]);
                continue;
            }
            
            // For files: Ensure destination directory exists.
            $destinationDir = dirname($destinationPath);
            if (!file_exists($destinationDir)) {
                if (!mkdir($destinationDir, 0755, true)) {
                    $errors[] = "Failed to create destination folder for $originalName.";
                    continue;
                }
            }
            
            if (file_exists($destinationPath)) {
                $errors[] = "File already exists at destination: $originalName.";
                continue;
            }
            
            // Move the file from trash to its original location.
            $sourcePath = $trashDir . $trashFileName;
            if (file_exists($sourcePath)) {
                if (rename($sourcePath, $destinationPath)) {
                    $restoredItems[] = $originalName;
                    
                    // Update metadata: Restore metadata for this file.
                    $metadataFile = $getMetadataFilePath($relativeFolder);
                    $metadata = [];
                    if (file_exists($metadataFile)) {
                        $metadata = json_decode(file_get_contents($metadataFile), true);
                        if (!is_array($metadata)) {
                            $metadata = [];
                        }
                    }
                    $restoredMeta = [
                        "uploaded" => isset($record['uploaded']) ? $record['uploaded'] : date(DATE_TIME_FORMAT),
                        "uploader" => isset($record['uploader']) ? $record['uploader'] : "Unknown"
                    ];
                    $metadata[$originalName] = $restoredMeta;
                    file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
                    unset($trashData[$recordKey]);
                } else {
                    $errors[] = "Failed to restore $originalName.";
                }
            } else {
                $errors[] = "Trash file not found: $trashFileName.";
            }
        }
        
        // Write back updated trash metadata.
        file_put_contents($trashMetadataFile, json_encode(array_values($trashData), JSON_PRETTY_PRINT));
        
        if (empty($errors)) {
            return ["success" => "Items restored: " . implode(", ", $restoredItems), "restored" => $restoredItems];
        } else {
            return ["success" => false, "error" => implode("; ", $errors), "restored" => $restoredItems];
        }
    }

        /**
     * Deletes trash items based on an array of trash file identifiers.
     *
     * @param array $filesToDelete An array of trash file names (identifiers).
     * @return array An associative array containing "deleted" (array of deleted items) and optionally "error" (error message).
     */
    public static function deleteTrashFiles(array $filesToDelete) {
        // Setup trash directory and metadata file.
        $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!file_exists($trashDir)) {
            mkdir($trashDir, 0755, true);
        }
        $trashMetadataFile = $trashDir . "trash.json";

        // Load trash metadata into an associative array keyed by trashName.
        $trashData = [];
        if (file_exists($trashMetadataFile)) {
            $json = file_get_contents($trashMetadataFile);
            $tempData = json_decode($json, true);
            if (is_array($tempData)) {
                foreach ($tempData as $item) {
                    if (isset($item['trashName'])) {
                        $trashData[$item['trashName']] = $item;
                    }
                }
            }
        }

        $deletedFiles = [];
        $errors = [];

        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;

        // Process each file identifier in the $filesToDelete array.
        foreach ($filesToDelete as $trashName) {
            $trashName = trim($trashName);
            if (!preg_match($safeFileNamePattern, $trashName)) {
                $errors[] = "$trashName has an invalid format.";
                continue;
            }
            if (!isset($trashData[$trashName])) {
                $errors[] = "Trash item $trashName not found.";
                continue;
            }
            // Build the full path to the trash file.
            $filePath = $trashDir . $trashName;
            if (file_exists($filePath)) {
                if (unlink($filePath)) {
                    $deletedFiles[] = $trashName;
                    unset($trashData[$trashName]);
                } else {
                    $errors[] = "Failed to delete $trashName.";
                }
            } else {
                // If the file doesn't exist, remove its metadata.
                unset($trashData[$trashName]);
                $deletedFiles[] = $trashName;
            }
        }

        // Save the updated trash metadata back as an indexed array.
        file_put_contents($trashMetadataFile, json_encode(array_values($trashData), JSON_PRETTY_PRINT));

        if (empty($errors)) {
            return ["deleted" => $deletedFiles];
        } else {
            return ["deleted" => $deletedFiles, "error" => implode("; ", $errors)];
        }
    }

        /**
     * Retrieves file tags from the createdTags.json metadata file.
     *
     * @return array An array of tags. Returns an empty array if the file doesn't exist or is not readable.
     */
    public static function getFileTags(): array {
        $metadataPath = META_DIR . 'createdTags.json';
        
        // Check if the metadata file exists and is readable.
        if (!file_exists($metadataPath) || !is_readable($metadataPath)) {
            error_log('Metadata file does not exist or is not readable: ' . $metadataPath);
            return [];
        }
        
        $data = file_get_contents($metadataPath);
        if ($data === false) {
            error_log('Failed to read metadata file: ' . $metadataPath);
            // Return an empty array for a graceful fallback.
            return [];
        }
        
        $jsonData = json_decode($data, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('Invalid JSON in metadata file: ' . $metadataPath . ' Error: ' . json_last_error_msg());
            return [];
        }
        
        return $jsonData;
    }

        /**
     * Saves tag data for a specified file and updates the global tags.
     *
     * @param string $folder The folder where the file is located (e.g., "root" or a subfolder).
     * @param string $file The name of the file for which tags are being saved.
     * @param array  $tags An array of tag definitions, each being an associative array (e.g. ['name' => 'Tag1', 'color' => '#FF0000']).
     * @param bool   $deleteGlobal Optional flag; if true and 'tagToDelete' is provided, remove that tag from the global tags.
     * @param string|null $tagToDelete Optional tag name to delete from global tags when $deleteGlobal is true.
     * @return array Returns an associative array with a "success" key and updated "globalTags", or an "error" key on failure.
     */
    public static function saveFileTag(string $folder, string $file, array $tags, bool $deleteGlobal = false, ?string $tagToDelete = null): array {
        // Determine the folder metadata file.
        $folder = trim($folder) ?: 'root';
        $metadataFile = "";
        if (strtolower($folder) === "root") {
            $metadataFile = META_DIR . "root_metadata.json";
        } else {
            $metadataFile = META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
        }
        
        // Load existing metadata for this folder.
        $metadata = [];
        if (file_exists($metadataFile)) {
            $metadata = json_decode(file_get_contents($metadataFile), true) ?? [];
        }
        
        // Update the metadata for the specified file.
        if (!isset($metadata[$file])) {
            $metadata[$file] = [];
        }
        $metadata[$file]['tags'] = $tags;
        
        if (file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT)) === false) {
            return ["error" => "Failed to save tag data for file metadata."];
        }
        
        // Now update the global tags file.
        $globalTagsFile = META_DIR . "createdTags.json";
        $globalTags = [];
        if (file_exists($globalTagsFile)) {
            $globalTags = json_decode(file_get_contents($globalTagsFile), true) ?? [];
            if (!is_array($globalTags)) {
                $globalTags = [];
            }
        }
        
        // If deleteGlobal is true and tagToDelete is provided, remove that tag.
        if ($deleteGlobal && !empty($tagToDelete)) {
            $tagToDeleteLower = strtolower($tagToDelete);
            $globalTags = array_values(array_filter($globalTags, function($globalTag) use ($tagToDeleteLower) {
                return strtolower($globalTag['name']) !== $tagToDeleteLower;
            }));
        } else {
            // Otherwise, merge (update or add) new tags into the global tags.
            foreach ($tags as $tag) {
                $found = false;
                foreach ($globalTags as &$globalTag) {
                    if (strtolower($globalTag['name']) === strtolower($tag['name'])) {
                        $globalTag['color'] = $tag['color'];
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $globalTags[] = $tag;
                }
            }
        }
        
        if (file_put_contents($globalTagsFile, json_encode($globalTags, JSON_PRETTY_PRINT)) === false) {
            return ["error" => "Failed to save global tags."];
        }
        
        return ["success" => "Tag data saved successfully.", "globalTags" => $globalTags];
    }

        /**
     * Retrieves the list of files in a given folder, enriched with metadata, along with global tags.
     *
     * @param string $folder The folder name (e.g., "root" or a subfolder).
     * @return array Returns an associative array with keys "files" and "globalTags".
     */
    public static function getFileList(string $folder): array {
        // --- caps for safe inlining ---
        if (!defined('LISTING_CONTENT_BYTES_MAX')) define('LISTING_CONTENT_BYTES_MAX', 8192);          // 8 KB snippet
        if (!defined('INDEX_TEXT_BYTES_MAX'))    define('INDEX_TEXT_BYTES_MAX', 5 * 1024 * 1024);     // only sample files ≤ 5 MB
    
        $folder = trim($folder) ?: 'root';
    
        // Determine the target directory.
        if (strtolower($folder) !== 'root') {
            $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
        } else {
            $directory = UPLOAD_DIR;
        }
    
        // Validate folder.
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }
    
        // Helper: Build the metadata file path.
        $getMetadataFilePath = function(string $folder): string {
            if (strtolower($folder) === 'root' || trim($folder) === '') {
                return META_DIR . "root_metadata.json";
            }
            return META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
        };
        $metadataFile = $getMetadataFilePath($folder);
        $metadata = file_exists($metadataFile) ? (json_decode(file_get_contents($metadataFile), true) ?: []) : [];
    
        if (!is_dir($directory)) {
            return ["error" => "Directory not found."];
        }
    
        $allFiles = array_values(array_diff(scandir($directory), array('.', '..')));
        $fileList = [];
    
        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;
    
        // Prepare finfo (if available) for MIME sniffing.
        $finfo = function_exists('finfo_open') ? @finfo_open(FILEINFO_MIME_TYPE) : false;
    
        foreach ($allFiles as $file) {
            if ($file === '' || $file[0] === '.') {
                continue; // Skip hidden/invalid entries.
            }
    
            $filePath = $directory . DIRECTORY_SEPARATOR . $file;
            if (!is_file($filePath)) {
                continue; // Only process files.
            }
            if (!preg_match($safeFileNamePattern, $file)) {
                continue;
            }
    
            // Meta
            $mtime = @filemtime($filePath);
            $fileDateModified = $mtime ? date(DATE_TIME_FORMAT, $mtime) : "Unknown";
            $metaKey = $file;
            $fileUploadedDate = isset($metadata[$metaKey]["uploaded"]) ? $metadata[$metaKey]["uploaded"] : "Unknown";
            $fileUploader = isset($metadata[$metaKey]["uploader"]) ? $metadata[$metaKey]["uploader"] : "Unknown";
    
            // Size
            $fileSizeBytes = @filesize($filePath);
            if (!is_int($fileSizeBytes)) $fileSizeBytes = 0;
            if ($fileSizeBytes >= 1073741824) {
                $fileSizeFormatted = sprintf("%.1f GB", $fileSizeBytes / 1073741824);
            } elseif ($fileSizeBytes >= 1048576) {
                $fileSizeFormatted = sprintf("%.1f MB", $fileSizeBytes / 1048576);
            } elseif ($fileSizeBytes >= 1024) {
                $fileSizeFormatted = sprintf("%.1f KB", $fileSizeBytes / 1024);
            } else {
                $fileSizeFormatted = sprintf("%s bytes", number_format($fileSizeBytes));
            }
    
            // MIME + text detection (fallback to extension)
            $mime = 'application/octet-stream';
            if ($finfo) {
                $det = @finfo_file($finfo, $filePath);
                if (is_string($det) && $det !== '') $mime = $det;
            }
            $isTextByMime = (strpos((string)$mime, 'text/') === 0) || $mime === 'application/json' || $mime === 'application/xml';
            $isTextByExt  = (bool)preg_match('/\.(txt|md|csv|json|xml|html?|css|js|log|ini|conf|config|yml|yaml|php|py|rb|sh|bat|ps1|ts|tsx|c|cpp|h|hpp|java|go|rs)$/i', $file);
            $isText = $isTextByMime || $isTextByExt;
    
            // Build entry
            $fileEntry = [
                'name'      => $file,
                'modified'  => $fileDateModified,
                'uploaded'  => $fileUploadedDate,
                'size'      => $fileSizeFormatted,
                'sizeBytes' => $fileSizeBytes,            // ← numeric size for frontend logic
                'uploader'  => $fileUploader,
                'tags'      => isset($metadata[$metaKey]['tags']) ? $metadata[$metaKey]['tags'] : [],
                'mime'      => $mime,
            ];
    
            // Small, safe snippet for text files only (never full content)
            $fileEntry['content']          = '';
            $fileEntry['contentTruncated'] = false;
    
            if ($isText && $fileSizeBytes > 0) {
                if ($fileSizeBytes <= INDEX_TEXT_BYTES_MAX) {
                    $fh = @fopen($filePath, 'rb');
                    if ($fh) {
                        $snippet = @fread($fh, LISTING_CONTENT_BYTES_MAX);
                        @fclose($fh);
                        if ($snippet !== false) {
                            // ensure UTF-8 for JSON
                            if (function_exists('mb_check_encoding') && !mb_check_encoding($snippet, 'UTF-8')) {
                                if (function_exists('mb_convert_encoding')) {
                                    $snippet = @mb_convert_encoding($snippet, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1252');
                                }
                            }
                            $fileEntry['content'] = $snippet;
                            $fileEntry['contentTruncated'] = ($fileSizeBytes > LISTING_CONTENT_BYTES_MAX);
                        }
                    }
                } else {
                    // too large to sample: mark truncated so UI/search knows
                    $fileEntry['contentTruncated'] = true;
                }
            }
    
            $fileList[] = $fileEntry;
        }
    
        if ($finfo) { @finfo_close($finfo); }
    
        // Load global tags.
        $globalTagsFile = META_DIR . "createdTags.json";
        $globalTags = file_exists($globalTagsFile) ? (json_decode(file_get_contents($globalTagsFile), true) ?: []) : [];
    
        return ["files" => $fileList, "globalTags" => $globalTags];
    }

    public static function getAllShareLinks(): array
    {
        $shareFile = META_DIR . "share_links.json";
        if (!file_exists($shareFile)) {
            return [];
        }
        $links = json_decode(file_get_contents($shareFile), true);
        return is_array($links) ? $links : [];
    }

    public static function deleteShareLink(string $token): bool
    {
        $shareFile = META_DIR . "share_links.json";
        if (!file_exists($shareFile)) {
            return false;
        }
        $links = json_decode(file_get_contents($shareFile), true);
        if (!is_array($links) || !isset($links[$token])) {
            return false;
        }
        unset($links[$token]);
        file_put_contents($shareFile, json_encode($links, JSON_PRETTY_PRINT));
        return true;
    }

    /**
     * Create an empty file plus metadata entry.
     *
     * @param string $folder
     * @param string $filename
     * @param string $uploader
     * @return array ['success'=>bool, 'error'=>string, 'code'=>int]
     */
    public static function createFile(string $folder, string $filename, string $uploader): array
    {
        // 1) basic validation
        if (!preg_match('/^[\w\-. ]+$/', $filename)) {
            return ['success'=>false,'error'=>'Invalid filename','code'=>400];
        }

        // 2) build target path
        $base = UPLOAD_DIR;
        if ($folder !== 'root') {
            $base = rtrim(UPLOAD_DIR, '/\\')
                  . DIRECTORY_SEPARATOR . $folder
                  . DIRECTORY_SEPARATOR;
        }
        if (!is_dir($base) && !mkdir($base, 0775, true)) {
            return ['success'=>false,'error'=>'Cannot create folder','code'=>500];
        }
        $path = $base . $filename;

        // 3) no overwrite
        if (file_exists($path)) {
            return ['success'=>false,'error'=>'File already exists','code'=>400];
        }

        // 4) touch the file
        if (false === @file_put_contents($path, '')) {
            return ['success'=>false,'error'=>'Could not create file','code'=>500];
        }

        // 5) write metadata
        $metaKey  = ($folder === 'root') ? 'root' : $folder;
        $metaName = str_replace(['/', '\\', ' '], '-', $metaKey) . '_metadata.json';
        $metaPath = META_DIR . $metaName;

        $collection = [];
        if (file_exists($metaPath)) {
            $json = file_get_contents($metaPath);
            $collection = json_decode($json, true) ?: [];
        }

        $collection[$filename] = [
          'uploaded' => date(DATE_TIME_FORMAT),
          'uploader' => $uploader
        ];

        if (false === file_put_contents($metaPath, json_encode($collection, JSON_PRETTY_PRINT))) {
            return ['success'=>false,'error'=>'Failed to update metadata','code'=>500];
        }

        return ['success'=>true];
    }
}