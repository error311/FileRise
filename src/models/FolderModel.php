<?php
// src/models/FolderModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

class FolderModel
{
    /* ============================================================
     * Ownership mapping helpers (stored in META_DIR/folder_owners.json)
     * ============================================================ */

    /** Load the folder → owner map. */
    public static function getFolderOwners(): array
    {
        $f = FOLDER_OWNERS_FILE;
        if (!file_exists($f)) return [];
        $json = json_decode(@file_get_contents($f), true);
        return is_array($json) ? $json : [];
    }

    /** Persist the folder → owner map. */
    public static function saveFolderOwners(array $map): bool
    {
        return (bool) @file_put_contents(FOLDER_OWNERS_FILE, json_encode($map, JSON_PRETTY_PRINT), LOCK_EX);
    }

    /** Set (or replace) the owner for a specific folder (relative path or 'root'). */
    public static function setOwnerFor(string $folder, string $owner): void
    {
        $key    = trim($folder, "/\\ ");
        $key    = ($key === '' ? 'root' : $key);
        $owners = self::getFolderOwners();
        $owners[$key] = $owner;
        self::saveFolderOwners($owners);
    }

    /** Get the owner for a folder (relative path or 'root'); returns null if unmapped. */
    public static function getOwnerFor(string $folder): ?string
    {
        $key    = trim($folder, "/\\ ");
        $key    = ($key === '' ? 'root' : $key);
        $owners = self::getFolderOwners();
        return $owners[$key] ?? null;
    }

    /** Rename a single ownership key (old → new). */
    public static function renameOwnerKey(string $old, string $new): void
    {
        $old    = trim($old, "/\\ ");
        $new    = trim($new, "/\\ ");
        $owners = self::getFolderOwners();
        if (isset($owners[$old])) {
            $owners[$new] = $owners[$old];
            unset($owners[$old]);
            self::saveFolderOwners($owners);
        }
    }

    /** Remove ownership for a folder and all its descendants. */
    public static function removeOwnerForTree(string $folder): void
    {
        $folder = trim($folder, "/\\ ");
        $owners = self::getFolderOwners();
        foreach (array_keys($owners) as $k) {
            if ($k === $folder || strpos($k, $folder . '/') === 0) {
                unset($owners[$k]);
            }
        }
        self::saveFolderOwners($owners);
    }

    /** Rename ownership keys for an entire subtree: old/... → new/... */
    public static function renameOwnersForTree(string $oldFolder, string $newFolder): void
    {
        $old = trim($oldFolder, "/\\ ");
        $new = trim($newFolder, "/\\ ");
        $owners = self::getFolderOwners();

        $rebased = [];
        foreach ($owners as $k => $v) {
            if ($k === $old || strpos($k, $old . '/') === 0) {
                $suffix = substr($k, strlen($old));
                // ensure no leading slash duplication
                $suffix = ltrim($suffix, '/');
                $rebased[$new . ($suffix !== '' ? '/' . $suffix : '')] = $v;
            } else {
                $rebased[$k] = $v;
            }
        }
        self::saveFolderOwners($rebased);
    }

    /* ============================================================
     * Existing helpers
     * ============================================================ */

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

    /** Build metadata file path for a given (relative) folder. */
    private static function getMetadataFilePath(string $folder): string
    {
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            return META_DIR . "root_metadata.json";
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
    }

    /**
     * Creates a folder under the specified parent (or in root) and creates an empty metadata file.
     * Also records the creator as the owner (if a session user is available).
     */

    /**
     * Create a folder on disk and register it in ACL with the creator as owner.
     * @param string $folderName leaf name
     * @param string $parent     'root' or nested key (e.g. 'team/reports')
     * @param string $creator    username to set as initial owner (falls back to 'admin')
     */
    public static function createFolder(string $folderName, string $parent = 'root', string $creator = 'admin'): array
    {
        $folderName = trim($folderName);
        $parent     = trim($parent);

        if ($folderName === '' || !preg_match(REGEX_FOLDER_NAME, $folderName)) {
            return ['success' => false, 'error' => 'Invalid folder name', 'code' => 400];
        }
        if ($parent !== '' && strcasecmp($parent, 'root') !== 0 && !preg_match(REGEX_FOLDER_NAME, $parent)) {
            return ['success' => false, 'error' => 'Invalid parent folder', 'code' => 400];
        }

        // Compute ACL key and filesystem path
        $aclKey = ($parent === '' || strcasecmp($parent, 'root') === 0) ? $folderName : ($parent . '/' . $folderName);

        $base = rtrim(UPLOAD_DIR, '/\\');
        $path = ($parent === '' || strcasecmp($parent, 'root') === 0)
            ? $base . DIRECTORY_SEPARATOR . $folderName
            : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $parent) . DIRECTORY_SEPARATOR . $folderName;

        // Safety: stay inside UPLOAD_DIR
        $realBase = realpath($base);
        $realPath = $path; // may not exist yet
        $parentDir = dirname($path);
        if (!is_dir($parentDir) && !@mkdir($parentDir, 0775, true)) {
            return ['success' => false, 'error' => 'Failed to create parent path', 'code' => 500];
        }

        if (is_dir($path)) {
            // Idempotent: still ensure ACL record exists
            ACL::ensureFolderRecord($aclKey, $creator ?: 'admin');
            return ['success' => true, 'folder' => $aclKey, 'alreadyExists' => true];
        }

        if (!@mkdir($path, 0775, true)) {
            return ['success' => false, 'error' => 'Failed to create folder', 'code' => 500];
        }

        // Seed ACL: owner/read/write/share -> creator; read_own empty
        ACL::ensureFolderRecord($aclKey, $creator ?: 'admin');

        return ['success' => true, 'folder' => $aclKey];
    }


    /**
     * Deletes a folder if it is empty and removes its corresponding metadata.
     * Also removes ownership mappings for this folder and all its descendants.
     */
    public static function deleteFolder(string $folder): array
    {
        if (strtolower($folder) === 'root') {
            return ["error" => "Cannot delete root folder."];
        }

        [$real, $relative, $err] = self::resolveFolderPath($folder, false);
        if ($err) return ["error" => $err];

        // Prevent deletion if not empty.
        $items = array_diff(@scandir($real) ?: [], array('.', '..'));
        if (count($items) > 0) {
            return ["error" => "Folder is not empty."];
        }

        if (!@rmdir($real)) {
            return ["error" => "Failed to delete folder."];
        }

        // Remove metadata file (best-effort).
        $metadataFile = self::getMetadataFilePath($relative);
        if (file_exists($metadataFile)) {
            @unlink($metadataFile);
        }

        // Remove ownership mappings for the subtree.
        self::removeOwnerForTree($relative);

        return ["success" => true];
    }

    /**
     * Renames a folder and updates related metadata files (by renaming their filenames).
     * Also rewrites ownership keys for the whole subtree from old → new.
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
        $newRel   = implode('/', $newParts);
        $newPath  = $base . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $newParts);

        // Parent of new path must exist
        $newParent = dirname($newPath);
        if (!is_dir($newParent) || strpos(realpath($newParent), $base) !== 0) {
            return ["error" => "Invalid folder path."];
        }
        if (file_exists($newPath)) {
            return ["error" => "New folder name already exists."];
        }

        if (!@rename($oldReal, $newPath)) {
            return ["error" => "Failed to rename folder."];
        }

        // Update metadata filenames (prefix-rename)
        $oldPrefix = str_replace(['/', '\\', ' '], '-', $oldRel);
        $newPrefix = str_replace(['/', '\\', ' '], '-', $newRel);
        $globPat   = META_DIR . $oldPrefix . '*_metadata.json';
        $metadataFiles = glob($globPat) ?: [];

        foreach ($metadataFiles as $oldMetaFile) {
            $baseName   = basename($oldMetaFile);
            $newBase    = preg_replace('/^' . preg_quote($oldPrefix, '/') . '/', $newPrefix, $baseName);
            $newMeta    = META_DIR . $newBase;
            @rename($oldMetaFile, $newMeta);
        }

        // Update ownership mapping for the entire subtree.
        self::renameOwnersForTree($oldRel, $newRel);

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
     * (Ownership filtering is handled in the controller; this function remains unchanged.)
     */
    public static function getFolderList($ignoredParent = null, ?string $username = null, array $perms = []): array
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

        if ($username !== null) {
            $folderInfoList = array_values(array_filter(
                $folderInfoList,
                fn($row) => ACL::canRead($username, $perms, $row['folder'])
            ));
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