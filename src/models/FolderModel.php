<?php
// src/models/FolderModel.php

require_once PROJECT_ROOT . '/config/config.php';

class FolderModel
{
    /**
     * Resolve a (possibly nested) relative folder like "invoices/2025" to a real path
     * under UPLOAD_DIR. Validates each path segment against REGEX_FOLDER_NAME, enforces
     * containment, and (optionally) creates the folder.
     *
     * @param string $folder  Relative folder or "root"
     * @param bool   $create  Create the folder if missing
     * @return array [string|null $realPath, string   $relative, string|null $error]
     */
    private static function resolveFolderPath(string $folder, bool $create = false): array
    {
        $folder   = trim($folder) ?: 'root';
        $relative = 'root';

        $base = realpath(UPLOAD_DIR);
        if ($base === false) {
            return [null, 'root', "Uploads directory not configured correctly."];
        }

        if (strtolower($folder) === 'root') {
            $dir = $base;
        } else {
            // validate each segment against REGEX_FOLDER_NAME
            $parts = array_filter(explode('/', trim($folder, "/\\ ")), fn($p) => $p !== '');
            if (empty($parts)) {
                return [null, 'root', "Invalid folder name."];
            }
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    return [null, 'root', "Invalid folder name."];
                }
            }
            $relative = implode('/', $parts);
            $dir      = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
        }

        if (!is_dir($dir)) {
            if ($create) {
                if (!mkdir($dir, 0775, true)) {
                    return [null, $relative, "Failed to create folder."];
                }
            } else {
                return [null, $relative, "Folder does not exist."];
            }
        }

        $real = realpath($dir);
        if ($real === false || strpos($real, $base) !== 0) {
            return [null, $relative, "Invalid folder path."];
        }

        return [$real, $relative, null];
    }

    /**
     * Build metadata file path for a given (relative) folder.
     */
    private static function getMetadataFilePath(string $folder): string
    {
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            return META_DIR . "root_metadata.json";
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
    }

    /**
     * Creates a folder under the specified parent (or in root) and creates an empty metadata file.
     */
    public static function createFolder(string $folderName, string $parent = ""): array
    {
        $folderName = trim($folderName);
        $parent     = trim($parent);

        if (!preg_match(REGEX_FOLDER_NAME, $folderName)) {
            return ["error" => "Invalid folder name."];
        }

        // Resolve parent path (root ok; nested ok)
        [$parentReal, $parentRel, $err] = self::resolveFolderPath($parent === '' ? 'root' : $parent, true);
        if ($err) return ["error" => $err];

        $targetRel = ($parentRel === 'root') ? $folderName : ($parentRel . '/' . $folderName);
        $targetDir = $parentReal . DIRECTORY_SEPARATOR . $folderName;

        if (file_exists($targetDir)) {
            return ["error" => "Folder already exists."];
        }

        if (!mkdir($targetDir, 0775, true)) {
            return ["error" => "Failed to create folder."];
        }

        // Create an empty metadata file for the new folder.
        $metadataFile = self::getMetadataFilePath($targetRel);
        if (file_put_contents($metadataFile, json_encode([], JSON_PRETTY_PRINT), LOCK_EX) === false) {
            return ["error" => "Folder created but failed to create metadata file."];
        }

        return ["success" => true];
    }

    /**
     * Deletes a folder if it is empty and removes its corresponding metadata.
     */
    public static function deleteFolder(string $folder): array
    {
        if (strtolower($folder) === 'root') {
            return ["error" => "Cannot delete root folder."];
        }

        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) return ["error" => $err];

        // Prevent deletion if not empty.
        $items = array_diff(scandir($real), array('.', '..'));
        if (count($items) > 0) {
            return ["error" => "Folder is not empty."];
        }

        if (!rmdir($real)) {
            return ["error" => "Failed to delete folder."];
        }

        // Remove metadata file (best-effort).
        $metadataFile = self::getMetadataFilePath($relative);
        if (file_exists($metadataFile)) {
            @unlink($metadataFile);
        }

        return ["success" => true];
    }

    /**
     * Renames a folder and updates related metadata files (by renaming their filenames).
     */
    public static function renameFolder(string $oldFolder, string $newFolder): array
    {
        $oldFolder = trim($oldFolder, "/\\ ");
        $newFolder = trim($newFolder, "/\\ ");

        // Validate names (per-segment)
        foreach ([$oldFolder, $newFolder] as $f) {
            $parts = array_filter(explode('/', $f), fn($p)=>$p!=='');
            if (empty($parts)) return ["error" => "Invalid folder name(s)."];
            foreach ($parts as $seg) {
                if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                    return ["error" => "Invalid folder name(s)."];
                }
            }
        }

        [$oldReal, $oldRel, $err] = self::resolveFolderPath($oldFolder, false);
        if ($err) return ["error" => $err];

        $base = realpath(UPLOAD_DIR);
        if ($base === false) return ["error" => "Uploads directory not configured correctly."];

        $newParts = array_filter(explode('/', $newFolder), fn($p) => $p!=='');
        $newPath  = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $newParts);

        // Parent of new path must exist
        $newParent = dirname($newPath);
        if (!is_dir($newParent) || strpos(realpath($newParent), $base) !== 0) {
            return ["error" => "Invalid folder path."];
        }
        if (file_exists($newPath)) {
            return ["error" => "New folder name already exists."];
        }

        if (!rename($oldReal, $newPath)) {
            return ["error" => "Failed to rename folder."];
        }

        // Update metadata filenames (prefix-rename)
        $oldPrefix = str_replace(['/', '\\', ' '], '-', $oldRel);
        $newPrefix = str_replace(['/', '\\', ' '], '-', implode('/', $newParts));
        $globPat   = META_DIR . $oldPrefix . '*_metadata.json';
        $metadataFiles = glob($globPat) ?: [];

        foreach ($metadataFiles as $oldMetaFile) {
            $baseName   = basename($oldMetaFile);
            $newBase    = preg_replace('/^' . preg_quote($oldPrefix, '/') . '/', $newPrefix, $baseName);
            $newMeta    = META_DIR . $newBase;
            @rename($oldMetaFile, $newMeta);
        }

        return ["success" => true];
    }

    /**
     * Recursively scans a directory for subfolders (relative paths).
     */
    private static function getSubfolders(string $dir, string $relative = ''): array
    {
        $folders = [];
        $items   = @scandir($dir) ?: [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            if (!preg_match(REGEX_FOLDER_NAME, $item)) continue;

            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path)) {
                $folderPath = ($relative ? $relative . '/' : '') . $item;
                $folders[]  = $folderPath;
                $folders    = array_merge($folders, self::getSubfolders($path, $folderPath));
            }
        }
        return $folders;
    }

    /**
     * Retrieves the list of folders (including "root") along with file count metadata.
     */
    public static function getFolderList(): array
    {
        $baseDir = realpath(UPLOAD_DIR);
        if ($baseDir === false) {
            return []; // or ["error" => "..."]
        }

        $folderInfoList = [];

        // root
        $rootMetaFile   = self::getMetadataFilePath('root');
        $rootFileCount  = 0;
        if (file_exists($rootMetaFile)) {
            $rootMetadata = json_decode(file_get_contents($rootMetaFile), true);
            $rootFileCount = is_array($rootMetadata) ? count($rootMetadata) : 0;
        }
        $folderInfoList[] = [
            "folder"       => "root",
            "fileCount"    => $rootFileCount,
            "metadataFile" => basename($rootMetaFile)
        ];

        // subfolders
        $subfolders = is_dir($baseDir) ? self::getSubfolders($baseDir) : [];
        foreach ($subfolders as $folder) {
            $metaFile = self::getMetadataFilePath($folder);
            $fileCount = 0;
            if (file_exists($metaFile)) {
                $metadata = json_decode(file_get_contents($metaFile), true);
                $fileCount = is_array($metadata) ? count($metadata) : 0;
            }
            $folderInfoList[] = [
                "folder"       => $folder,
                "fileCount"    => $fileCount,
                "metadataFile" => basename($metaFile)
            ];
        }

        return $folderInfoList;
    }

    /**
     * Retrieves the share folder record for a given token.
     */
    public static function getShareFolderRecord(string $token): ?array
    {
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) return null;
        $shareLinks = json_decode(file_get_contents($shareFile), true);
        return (is_array($shareLinks) && isset($shareLinks[$token])) ? $shareLinks[$token] : null;
    }

    /**
     * Retrieves shared folder data based on a share token.
     */
    public static function getSharedFolderData(string $token, ?string $providedPass, int $page = 1, int $itemsPerPage = 10): array
    {
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) return ["error" => "Share link not found."];

        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return ["error" => "Share link not found."];
        }
        $record = $shareLinks[$token];

        if (time() > ($record['expires'] ?? 0)) {
            return ["error" => "This share link has expired."];
        }

        if (!empty($record['password']) && empty($providedPass)) {
            return ["needs_password" => true];
        }
        if (!empty($record['password']) && !password_verify($providedPass, $record['password'])) {
            return ["error" => "Invalid password."];
        }

        // Resolve shared folder
        $folder = trim((string)$record['folder'], "/\\ ");
        [$realFolderPath, $relative, $err] = self::resolveFolderPath($folder === '' ? 'root' : $folder, false);
        if ($err || !is_dir($realFolderPath)) {
            return ["error" => "Shared folder not found."];
        }

        // List files (safe names only; skip hidden)
        $all = @scandir($realFolderPath) ?: [];
        $allFiles = [];
        foreach ($all as $it) {
            if ($it === '.' || $it === '..') continue;
            if ($it[0] === '.') continue;
            if (!preg_match(REGEX_FILE_NAME, $it)) continue;
            if (is_file($realFolderPath . DIRECTORY_SEPARATOR . $it)) {
                $allFiles[] = $it;
            }
        }
        sort($allFiles, SORT_NATURAL | SORT_FLAG_CASE);

        $totalFiles  = count($allFiles);
        $totalPages  = max(1, (int)ceil($totalFiles / max(1, $itemsPerPage)));
        $currentPage = min(max(1, $page), $totalPages);
        $startIndex  = ($currentPage - 1) * $itemsPerPage;
        $filesOnPage = array_slice($allFiles, $startIndex, $itemsPerPage);

        return [
            "record"        => $record,
            "folder"        => $relative,
            "realFolderPath"=> $realFolderPath,
            "files"         => $filesOnPage,
            "currentPage"   => $currentPage,
            "totalPages"    => $totalPages
        ];
    }

    /**
     * Creates a share link for a folder.
     */
    public static function createShareFolderLink(string $folder, int $expirationSeconds = 3600, string $password = "", int $allowUpload = 0): array
    {
        // Validate folder (and ensure it exists)
        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) return ["error" => $err];

        // Token
        try {
            $token = bin2hex(random_bytes(16));
        } catch (\Throwable $e) {
            return ["error" => "Could not generate token."];
        }

        $expires       = time() + max(1, $expirationSeconds);
        $hashedPassword= $password !== "" ? password_hash($password, PASSWORD_DEFAULT) : "";

        $shareFile = META_DIR . "share_folder_links.json";
        $links = file_exists($shareFile)
            ? (json_decode(file_get_contents($shareFile), true) ?? [])
            : [];

        // cleanup expired
        $now = time();
        foreach ($links as $k => $v) {
            if (!empty($v['expires']) && $v['expires'] < $now) {
                unset($links[$k]);
            }
        }

        $links[$token] = [
            "folder"      => $relative,
            "expires"     => $expires,
            "password"    => $hashedPassword,
            "allowUpload" => $allowUpload ? 1 : 0
        ];

        if (file_put_contents($shareFile, json_encode($links, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            return ["error" => "Could not save share link."];
        }

        // Build URL
        $https   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                   || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme  = $https ? 'https' : 'http';
        $host    = $_SERVER['HTTP_HOST'] ?? gethostbyname(gethostname());
        $baseUrl = $scheme . '://' . rtrim($host, '/');
        $link    = $baseUrl . "/api/folder/shareFolder.php?token=" . urlencode($token);

        return ["token" => $token, "expires" => $expires, "link" => $link];
    }

    /**
     * Retrieves information for a shared file from a shared folder link.
     */
    public static function getSharedFileInfo(string $token, string $file): array
    {
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) return ["error" => "Share link not found."];

        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return ["error" => "Share link not found."];
        }
        $record = $shareLinks[$token];

        if (time() > ($record['expires'] ?? 0)) {
            return ["error" => "This share link has expired."];
        }

        [$realFolderPath, , $err] = self::resolveFolderPath((string)$record['folder'], false);
        if ($err || !is_dir($realFolderPath)) {
            return ["error" => "Shared folder not found."];
        }

        $file = basename(trim($file));
        if (!preg_match(REGEX_FILE_NAME, $file)) {
            return ["error" => "Invalid file name."];
        }

        $full = $realFolderPath . DIRECTORY_SEPARATOR . $file;
        $real = realpath($full);
        if ($real === false || strpos($real, $realFolderPath) !== 0 || !is_file($real)) {
            return ["error" => "File not found."];
        }

        $mime = function_exists('mime_content_type') ? mime_content_type($real) : 'application/octet-stream';
        return ["realFilePath" => $real, "mimeType" => $mime];
    }

    /**
     * Handles uploading a file to a shared folder.
     */
    public static function uploadToSharedFolder(string $token, array $fileUpload): array
    {
        // Max size & allowed extensions (mirror FileModel’s common types)
        $maxSize = 50 * 1024 * 1024; // 50 MB
        $allowedExtensions = [
            'jpg','jpeg','png','gif','pdf','doc','docx','txt','xls','xlsx','ppt','pptx',
            'mp4','webm','mp3','mkv','csv','json','xml','md'
        ];

        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) {
            return ["error" => "Share record not found."];
        }
        $shareLinks = json_decode(file_get_contents($shareFile), true);
        if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
            return ["error" => "Invalid share token."];
        }
        $record = $shareLinks[$token];

        if (time() > ($record['expires'] ?? 0)) {
            return ["error" => "This share link has expired."];
        }
        if (empty($record['allowUpload']) || (int)$record['allowUpload'] !== 1) {
            return ["error" => "File uploads are not allowed for this share."];
        }

        if (($fileUpload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return ["error" => "File upload error. Code: " . (int)$fileUpload['error']];
        }
        if (($fileUpload['size'] ?? 0) > $maxSize) {
            return ["error" => "File size exceeds allowed limit."];
        }

        $uploadedName = basename((string)($fileUpload['name'] ?? ''));
        $ext = strtolower(pathinfo($uploadedName, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExtensions, true)) {
            return ["error" => "File type not allowed."];
        }

        // Resolve target folder
        [$targetDir, $relative, $err] = self::resolveFolderPath((string)$record['folder'], true);
        if ($err) return ["error" => $err];

        // New safe filename
        $safeBase   = preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $uploadedName);
        $newFilename= uniqid('', true) . "_" . $safeBase;
        $targetPath = $targetDir . DIRECTORY_SEPARATOR . $newFilename;

        if (!move_uploaded_file($fileUpload['tmp_name'], $targetPath)) {
            return ["error" => "Failed to move the uploaded file."];
        }

        // Update metadata (uploaded + modified + uploader)
        $metadataFile = self::getMetadataFilePath($relative);
        $meta = file_exists($metadataFile) ? (json_decode(file_get_contents($metadataFile), true) ?: []) : [];

        $now = date(DATE_TIME_FORMAT);
        $meta[$newFilename] = [
            "uploaded" => $now,
            "modified" => $now,
            "uploader" => "Outside Share"
        ];
        file_put_contents($metadataFile, json_encode($meta, JSON_PRETTY_PRINT), LOCK_EX);

        return ["success" => "File uploaded successfully.", "newFilename" => $newFilename];
    }

    public static function getAllShareFolderLinks(): array
    {
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) return [];
        $links = json_decode(file_get_contents($shareFile), true);
        return is_array($links) ? $links : [];
    }

    public static function deleteShareFolderLink(string $token): bool
    {
        $shareFile = META_DIR . "share_folder_links.json";
        if (!file_exists($shareFile)) return false;

        $links = json_decode(file_get_contents($shareFile), true);
        if (!is_array($links) || !isset($links[$token])) return false;

        unset($links[$token]);
        file_put_contents($shareFile, json_encode($links, JSON_PRETTY_PRINT), LOCK_EX);
        return true;
    }
}