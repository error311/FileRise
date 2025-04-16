<?php
// src/models/FolderModel.php

require_once PROJECT_ROOT . '/config/config.php';

class FolderModel {
    /**
     * Creates a folder under the specified parent (or in root) and creates an empty metadata file.
     *
     * @param string $folderName The name of the folder to create.
     * @param string $parent (Optional) The parent folder name. Defaults to empty.
     * @return array Returns an array with a "success" key if the folder was created,
     *               or an "error" key if an error occurred.
     */
    public static function createFolder(string $folderName, string $parent = ""): array {
        $folderName = trim($folderName);
        $parent = trim($parent);
        
        // Validate folder name (only letters, numbers, underscores, dashes, and spaces allowed).
        if (!preg_match(REGEX_FOLDER_NAME, $folderName)) {
            return ["error" => "Invalid folder name."];
        }
        if ($parent !== "" && !preg_match(REGEX_FOLDER_NAME, $parent)) {
            return ["error" => "Invalid parent folder name."];
        }
        
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        if ($parent !== "" && strtolower($parent) !== "root") {
            $fullPath = $baseDir . DIRECTORY_SEPARATOR . $parent . DIRECTORY_SEPARATOR . $folderName;
            $relativePath = $parent . "/" . $folderName;
        } else {
            $fullPath = $baseDir . DIRECTORY_SEPARATOR . $folderName;
            $relativePath = $folderName;
        }
        
        // Check if the folder already exists.
        if (file_exists($fullPath)) {
            return ["error" => "Folder already exists."];
        }
        
        // Attempt to create the folder.
        if (mkdir($fullPath, 0755, true)) {
            // Create an empty metadata file for the new folder.
            $metadataFile = self::getMetadataFilePath($relativePath);
            if (file_put_contents($metadataFile, json_encode([], JSON_PRETTY_PRINT)) === false) {
                return ["error" => "Folder created but failed to create metadata file."];
            }
            return ["success" => true];
        } else {
            return ["error" => "Failed to create folder."];
        }
    }
    
    /**
     * Generates the metadata file path for a given folder.
     *
     * @param string $folder The relative folder path.
     * @return string The metadata file path.
     */
    private static function getMetadataFilePath(string $folder): string {
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            return META_DIR . "root_metadata.json";
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
    }

        /**
     * Deletes a folder if it is empty and removes its corresponding metadata.
     *
     * @param string $folder The folder name (relative to the upload directory).
     * @return array An associative array with "success" on success or "error" on failure.
     */
    public static function deleteFolder(string $folder): array {
        // Prevent deletion of "root".
        if (strtolower($folder) === 'root') {
            return ["error" => "Cannot delete root folder."];
        }
        
        // Validate folder name.
        if (!preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }
        
        // Build the full folder path.
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        $folderPath = $baseDir . DIRECTORY_SEPARATOR . $folder;
        
        // Check if the folder exists and is a directory.
        if (!file_exists($folderPath) || !is_dir($folderPath)) {
            return ["error" => "Folder does not exist."];
        }
        
        // Prevent deletion if the folder is not empty.
        $items = array_diff(scandir($folderPath), array('.', '..'));
        if (count($items) > 0) {
            return ["error" => "Folder is not empty."];
        }
        
        // Attempt to delete the folder.
        if (rmdir($folderPath)) {
            // Remove corresponding metadata file.
            $metadataFile = self::getMetadataFilePath($folder);
            if (file_exists($metadataFile)) {
                unlink($metadataFile);
            }
            return ["success" => true];
        } else {
            return ["error" => "Failed to delete folder."];
        }
    }

        /**
     * Renames a folder and updates related metadata files.
     *
     * @param string $oldFolder The current folder name (relative to UPLOAD_DIR).
     * @param string $newFolder The new folder name.
     * @return array Returns an associative array with "success" on success or "error" on failure.
     */
    public static function renameFolder(string $oldFolder, string $newFolder): array {
        // Sanitize and trim folder names.
        $oldFolder = trim($oldFolder, "/\\ ");
        $newFolder = trim($newFolder, "/\\ ");
        
        // Validate folder names.
        if (!preg_match(REGEX_FOLDER_NAME, $oldFolder) || !preg_match(REGEX_FOLDER_NAME, $newFolder)) {
            return ["error" => "Invalid folder name(s)."];
        }
        
        // Build the full folder paths.
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        $oldPath = $baseDir . DIRECTORY_SEPARATOR . $oldFolder;
        $newPath = $baseDir . DIRECTORY_SEPARATOR . $newFolder;
        
        // Validate that the old folder exists and new folder does not.
        if ((realpath($oldPath) === false) || (realpath(dirname($newPath)) === false) ||
            strpos(realpath($oldPath), realpath($baseDir)) !== 0 ||
            strpos(realpath(dirname($newPath)), realpath($baseDir)) !== 0) {
            return ["error" => "Invalid folder path."];
        }
        
        if (!file_exists($oldPath) || !is_dir($oldPath)) {
            return ["error" => "Folder to rename does not exist."];
        }
        
        if (file_exists($newPath)) {
            return ["error" => "New folder name already exists."];
        }
        
        // Attempt to rename the folder.
        if (rename($oldPath, $newPath)) {
            // Update metadata: Rename all metadata files that have the old folder prefix.
            $oldPrefix = str_replace(['/', '\\', ' '], '-', $oldFolder);
            $newPrefix = str_replace(['/', '\\', ' '], '-', $newFolder);
            $metadataFiles = glob(META_DIR . $oldPrefix . '*_metadata.json');
            foreach ($metadataFiles as $oldMetaFile) {
                $baseName = basename($oldMetaFile);
                $newBaseName = preg_replace('/^' . preg_quote($oldPrefix, '/') . '/', $newPrefix, $baseName);
                $newMetaFile = META_DIR . $newBaseName;
                rename($oldMetaFile, $newMetaFile);
            }
            return ["success" => true];
        } else {
            return ["error" => "Failed to rename folder."];
        }
    }

    /**
     * Recursively scans a directory for subfolders.
     *
     * @param string $dir The full path to the directory.
     * @param string $relative The relative path from the base directory.
     * @return array An array of folder paths (relative to the base).
     */
    private static function getSubfolders(string $dir, string $relative = ''): array {
        $folders = [];
        $items = scandir($dir);
        $safeFolderNamePattern = REGEX_FOLDER_NAME;
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            if (!preg_match($safeFolderNamePattern, $item)) {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path)) {
                $folderPath = ($relative ? $relative . '/' : '') . $item;
                $folders[] = $folderPath;
                $subFolders = self::getSubfolders($path, $folderPath);
                $folders = array_merge($folders, $subFolders);
            }
        }
        return $folders;
    }

    /**
     * Retrieves the list of folders (including "root") along with file count metadata.
     *
     * @return array An array of folder information arrays.
     */
    public static function getFolderList(): array {
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        $folderInfoList = [];

        // Process the "root" folder.
        $rootMetaFile = self::getMetadataFilePath('root');
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

        // Recursively scan for subfolders.
        if (is_dir($baseDir)) {
            $subfolders = self::getSubfolders($baseDir);
        } else {
            $subfolders = [];
        }

        // For each subfolder, load metadata to get file counts.
        foreach ($subfolders as $folder) {
            $metaFile = self::getMetadataFilePath($folder);
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

        return $folderInfoList;
    }

        /**
     * Retrieves the share folder record for a given token.
     *
     * @param string $token The share folder token.
     * @return array|null The share folder record, or null if not found.
     */
    public static function getShareFolderRecord(string $token): ?array {
        $shareFile = META_DIR . "share_folder_links.json";
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
     * Retrieves shared folder data based on a share token.
     *
     * @param string $token The share folder token.
     * @param string|null $providedPass The provided password (if any).
     * @param int $page The page number for pagination.
     * @param int $itemsPerPage The number of files to display per page.
     * @return array Associative array with keys:
     *         - 'record': the share record,
     *         - 'folder': the shared folder (relative),
     *         - 'realFolderPath': absolute folder path,
     *         - 'files': array of filenames for the current page,
     *         - 'currentPage': current page number,
     *         - 'totalPages': total pages,
     *         or an 'error' key on failure.
     */
    public static function getSharedFolderData(string $token, ?string $providedPass, int $page = 1, int $itemsPerPage = 10): array {
        // Load the share folder record.
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) {
            return ["error" => "Share link not found."];
        }
        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return ["error" => "Share link not found."];
        }
        $record = $shareLinks[$token];
        // Check expiration.
        if (time() > $record['expires']) {
            return ["error" => "This share link has expired."];
        }
        // If password protection is enabled and no password is provided, signal that.
        if (!empty($record['password']) && empty($providedPass)) {
            return ["needs_password" => true];
        }
        if (!empty($record['password']) && !password_verify($providedPass, $record['password'])) {
            return ["error" => "Invalid password."];
        }
        // Determine the shared folder.
        $folder = trim($record['folder'], "/\\ ");
        $baseDir = realpath(UPLOAD_DIR);
        if ($baseDir === false) {
            return ["error" => "Uploads directory not configured correctly."];
        }
        if (!empty($folder) && strtolower($folder) !== 'root') {
            $folderPath = $baseDir . DIRECTORY_SEPARATOR . $folder;
        } else {
            $folder = "root";
            $folderPath = $baseDir;
        }
        $realFolderPath = realpath($folderPath);
        $uploadDirReal = realpath(UPLOAD_DIR);
        if ($realFolderPath === false || strpos($realFolderPath, $uploadDirReal) !== 0 || !is_dir($realFolderPath)) {
            return ["error" => "Shared folder not found."];
        }
        // Scan for files (only files).
        $allFiles = array_values(array_filter(scandir($realFolderPath), function($item) use ($realFolderPath) {
            return is_file($realFolderPath . DIRECTORY_SEPARATOR . $item);
        }));
        sort($allFiles);
        $totalFiles = count($allFiles);
        $totalPages = max(1, ceil($totalFiles / $itemsPerPage));
        $currentPage = min($page, $totalPages);
        $startIndex = ($currentPage - 1) * $itemsPerPage;
        $filesOnPage = array_slice($allFiles, $startIndex, $itemsPerPage);
        
        return [
            "record" => $record,
            "folder" => $folder,
            "realFolderPath" => $realFolderPath,
            "files" => $filesOnPage,
            "currentPage" => $currentPage,
            "totalPages" => $totalPages
        ];
    }

        /**
     * Creates a share link for a folder.
     *
     * @param string $folder The folder to share (relative to UPLOAD_DIR).
     * @param int $expirationMinutes The duration (in minutes) until the link expires.
     * @param string $password Optional password for the share.
     * @param int $allowUpload Optional flag (0 or 1) indicating whether uploads are allowed.
     * @return array An associative array with "token", "expires", and "link" on success, or "error" on failure.
     */
    public static function createShareFolderLink(string $folder, int $expirationMinutes = 60, string $password = "", int $allowUpload = 0): array {
        // Validate folder name.
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }

        // Generate secure token.
        try {
            $token = bin2hex(random_bytes(16)); // 32 hex characters.
        } catch (Exception $e) {
            return ["error" => "Could not generate token."];
        }

        // Calculate expiration time.
        $expires = time() + ($expirationMinutes * 60);

        // Hash the password if provided.
        $hashedPassword = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : "";

        // Define the share folder links file.
        $shareFile = META_DIR . "share_folder_links.json";
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
            if (isset($link["expires"]) && $link["expires"] < $currentTime) {
                unset($shareLinks[$key]);
            }
        }

        // Add new share record.
        $shareLinks[$token] = [
            "folder" => $folder,
            "expires" => $expires,
            "password" => $hashedPassword,
            "allowUpload" => $allowUpload
        ];

        // Save the updated share links.
        if (file_put_contents($shareFile, json_encode($shareLinks, JSON_PRETTY_PRINT)) === false) {
            return ["error" => "Could not save share link."];
        }

        // Determine the base URL.
        if (defined('BASE_URL') && !empty(BASE_URL) && strpos(BASE_URL, 'yourwebsite') === false) {
            $baseUrl = rtrim(BASE_URL, '/');
        } else {
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
            $host = !empty($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : gethostbyname($_SERVER['SERVER_ADDR'] ?? 'localhost');
            $baseUrl = $protocol . "://" . $host;
        }
        // The share URL points to the shared folder page.
        $link = $baseUrl . "api/folder/shareFolder.php?token=" . urlencode($token);
        
        return ["token" => $token, "expires" => $expires, "link" => $link];
    }

        /**
     * Retrieves information for a shared file from a shared folder link.
     *
     * @param string $token The share folder token.
     * @param string $file The requested file name.
     * @return array An associative array with keys:
     *         - "error": error message, if any,
     *         - "realFilePath": the absolute path to the file,
     *         - "mimeType": the detected MIME type.
     */
    public static function getSharedFileInfo(string $token, string $file): array {
        // Load the share folder record.
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) {
            return ["error" => "Share link not found."];
        }
        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return ["error" => "Share link not found."];
        }
        $record = $shareLinks[$token];

        // Check if the link has expired.
        if (time() > $record['expires']) {
            return ["error" => "This share link has expired."];
        }

        // Determine the shared folder.
        $folder = trim($record['folder'], "/\\ ");
        $baseDir = realpath(UPLOAD_DIR);
        if ($baseDir === false) {
            return ["error" => "Uploads directory not configured correctly."];
        }
        if (!empty($folder) && strtolower($folder) !== 'root') {
            $folderPath = $baseDir . DIRECTORY_SEPARATOR . $folder;
        } else {
            $folderPath = $baseDir;
        }
        $realFolderPath = realpath($folderPath);
        $uploadDirReal = realpath(UPLOAD_DIR);
        if ($realFolderPath === false || strpos($realFolderPath, $uploadDirReal) !== 0 || !is_dir($realFolderPath)) {
            return ["error" => "Shared folder not found."];
        }

        // Sanitize the file name to prevent path traversal.
        if (strpos($file, "/") !== false || strpos($file, "\\") !== false) {
            return ["error" => "Invalid file name."];
        }
        $file = basename($file);
        
        // Build the full file path.
        $filePath = $realFolderPath . DIRECTORY_SEPARATOR . $file;
        $realFilePath = realpath($filePath);
        if ($realFilePath === false || strpos($realFilePath, $realFolderPath) !== 0 || !is_file($realFilePath)) {
            return ["error" => "File not found."];
        }
        
        $mimeType = mime_content_type($realFilePath);
        return [
            "realFilePath" => $realFilePath,
            "mimeType" => $mimeType
        ];
    }

    /**
     * Handles uploading a file to a shared folder.
     *
     * @param string $token The share folder token.
     * @param array $fileUpload The $_FILES['fileToUpload'] array.
     * @return array An associative array with "success" on success or "error" on failure.
     */
    public static function uploadToSharedFolder(string $token, array $fileUpload): array {
        // Define maximum file size and allowed extensions.
        $maxSize = 50 * 1024 * 1024; // 50 MB
        $allowedExtensions = ['jpg','jpeg','png','gif','pdf','doc','docx','txt','xls','xlsx','ppt','pptx','mp4','webm','mp3','mkv'];
        
        // Load the share folder record.
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) {
            return ["error" => "Share record not found."];
        }
        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return ["error" => "Invalid share token."];
        }
        $record = $shareLinks[$token];
        
        // Check expiration.
        if (time() > $record['expires']) {
            return ["error" => "This share link has expired."];
        }
        
        // Check whether uploads are allowed.
        if (empty($record['allowUpload']) || $record['allowUpload'] != 1) {
            return ["error" => "File uploads are not allowed for this share."];
        }
        
        // Validate file upload presence.
        if ($fileUpload['error'] !== UPLOAD_ERR_OK) {
            return ["error" => "File upload error. Code: " . $fileUpload['error']];
        }
        
        if ($fileUpload['size'] > $maxSize) {
            return ["error" => "File size exceeds allowed limit."];
        }
        
        $uploadedName = basename($fileUpload['name']);
        $ext = strtolower(pathinfo($uploadedName, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExtensions)) {
            return ["error" => "File type not allowed."];
        }
        
        // Determine the target folder from the share record.
        $folderName = trim($record['folder'], "/\\");
        $targetFolder = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!empty($folderName) && strtolower($folderName) !== 'root') {
            $targetFolder .= $folderName;
        }
        
        // Verify target folder exists.
        $realTargetFolder = realpath($targetFolder);
        $uploadDirReal = realpath(UPLOAD_DIR);
        if ($realTargetFolder === false || strpos($realTargetFolder, $uploadDirReal) !== 0 || !is_dir($realTargetFolder)) {
            return ["error" => "Shared folder not found."];
        }
        
        // Generate a new filename (using uniqid and sanitizing the original name).
        $newFilename = uniqid() . "_" . preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $uploadedName);
        $targetPath = $realTargetFolder . DIRECTORY_SEPARATOR . $newFilename;
        
        // Move the uploaded file.
        if (!move_uploaded_file($fileUpload['tmp_name'], $targetPath)) {
            return ["error" => "Failed to move the uploaded file."];
        }
        
        // --- Metadata Update ---
        // Determine metadata file.
        $metadataKey = (empty($folderName) || strtolower($folderName) === "root") ? "root" : $folderName;
        $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
        $metadataFile = META_DIR . $metadataFileName;
        $metadataCollection = [];
        if (file_exists($metadataFile)) {
            $data = file_get_contents($metadataFile);
            $metadataCollection = json_decode($data, true);
            if (!is_array($metadataCollection)) {
                $metadataCollection = [];
            }
        }
        $uploadedDate = date(DATE_TIME_FORMAT);
        $uploader = "Outside Share"; // As per your original implementation.
        // Update metadata with the new file's info.
        $metadataCollection[$newFilename] = [
            "uploaded" => $uploadedDate,
            "uploader" => $uploader
        ];
        file_put_contents($metadataFile, json_encode($metadataCollection, JSON_PRETTY_PRINT));
        
        return ["success" => "File uploaded successfully.", "newFilename" => $newFilename];
    }
}