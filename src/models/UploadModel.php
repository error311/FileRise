<?php
// src/models/UploadModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';
require_once PROJECT_ROOT . '/src/models/FolderCrypto.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';
require_once PROJECT_ROOT . '/src/lib/AuditHook.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class UploadModel
{
    /**
     * Log file for virus detections (JSONL; one JSON record per line).
     */
    private const VIRUS_LOG_MAX_BYTES  = 5242880; // 5 MB soft rotation

    private static function uploadRoot(): string
    {
        if (class_exists('SourceContext')) {
            return SourceContext::uploadRoot();
        }
        return rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

    private static function metaRoot(): string
    {
        if (class_exists('SourceContext')) {
            SourceContext::ensureMetaDir();
            return SourceContext::metaRoot();
        }
        return rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

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

    private static function portalMetaFromRequest(): ?array
    {
        $src = $_POST['source'] ?? $_GET['source'] ?? '';
        if (strtolower((string)$src) !== 'portal') return null;
        $slug = trim((string)($_POST['portal'] ?? $_GET['portal'] ?? ''));
        if ($slug === '') return null;
        $slug = str_replace(["\r", "\n"], '', $slug);
        return ['portal' => $slug];
    }

    private static function isVirusScanEnabled(): bool
    {
        // 1) Container env override (most explicit)
        $env = getenv('VIRUS_SCAN_ENABLED');
        if ($env !== false && $env !== '') {
            // Accept "1", "true", "0", "false", etc.
            $envBool = filter_var($env, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            return $envBool === true;
        }

        // 2) PHP constant override (non-container / legacy setups)
        if (defined('VIRUS_SCAN_ENABLED')) {
            return (bool)VIRUS_SCAN_ENABLED;
        }

        // 3) Admin configuration toggle
        if (!class_exists('AdminModel')) {
            return false;
        }

        $cfg = AdminModel::getConfig();
        if (!is_array($cfg) || isset($cfg['error'])) {
            return false;
        }

        if (empty($cfg['clamav']) || !is_array($cfg['clamav'])) {
            return false;
        }

        return !empty($cfg['clamav']['scanUploads']);
    }

    /**
     * Public helper: scan a single $_FILES-style upload array, if ClamAV is enabled.
     *
     * Used by places like shared-folder upload so they can reuse the same logic.
     *
     * $context may include:
     *   - 'user'       => override username (default: current session)
     *   - 'ip'         => override client IP (default: derived from $_SERVER)
     *   - 'folder'     => logical folder name / path
     *   - 'file'       => original file name
     *   - 'source'     => e.g. "normal", "shared", "portal", "self_test"
     *   - 'suppressLog'=> true to skip logging (used by self-test endpoint)
     *
     * Returns:
     *   - null           => scanning disabled or clean
     *   - ['error' => …] => infected or scan error (file is deleted)
     */
    public static function scanSingleUploadIfEnabled(array $upload, array $context = []): ?array
    {
        // Respect same toggle logic (env + admin config)
        if (!self::isVirusScanEnabled()) {
            return null;
        }

        $tmp = $upload['tmp_name'] ?? '';
        if (!$tmp || !is_file($tmp)) {
            return ['error' => 'Virus scan failed: uploaded file not found.'];
        }

        // Default file name in log context, if not provided by caller
        if (!isset($context['file']) && isset($upload['name'])) {
            $context['file'] = (string)$upload['name'];
        }

        return self::scanFileIfEnabled($tmp, $context);
    }

    private static function adapterErrorDetail(StorageAdapterInterface $storage): string
    {
        if (method_exists($storage, 'getLastError')) {
            $detail = trim((string)$storage->getLastError());
            if ($detail !== '') {
                $detail = preg_replace('/(\\w+:\\/\\/)([^\\s@]+@)/i', '$1', $detail) ?? $detail;
                if (strlen($detail) > 240) {
                    $detail = substr($detail, 0, 240) . '...';
                }
                return $detail;
            }
        }
        return '';
    }

    public static function handleUpload(array $post, array $files): array
    {
        $storage = StorageRegistry::getAdapter();
        $isLocal = $storage->isLocal();

        // --- GET resumable test (make folder handling consistent) ---
        if (
            (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET')
            && isset($post['resumableChunkNumber'], $post['resumableIdentifier'])
        ) {
            $chunkNumber         = (int)($post['resumableChunkNumber'] ?? 0);
            $resumableIdentifier = $post['resumableIdentifier'] ?? '';
            $folderSan           = self::sanitizeFolder((string)($post['folder'] ?? 'root'));

            $baseUploadDir = self::uploadRoot();
            if ($folderSan !== '') {
                $baseUploadDir = rtrim($baseUploadDir, '/\\') . DIRECTORY_SEPARATOR
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

            $baseUploadDir = self::uploadRoot();
            if ($folderSan !== '') {
                $baseUploadDir = rtrim($baseUploadDir, '/\\') . DIRECTORY_SEPARATOR
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

            // Optional: virus scan the merged file
            $folderForLog = ($folderSan === '' ? 'root' : $folderSan);
            $scanResult   = self::scanFileIfEnabled($targetPath, [
                'folder' => $folderForLog,
                'file'   => $resumableFilename,
                'source' => 'normal', // core/resumable upload
            ]);

            if (is_array($scanResult) && isset($scanResult['error'])) {
                // Clean up temporary chunk directory
                self::rrmdir($tempDir);
                return $scanResult; // e.g. "Upload blocked: virus detected in file."
            }

            if (!$isLocal) {
                try {
                    if (FolderCrypto::isEncryptedOrAncestor($folderForLog)) {
                        @unlink($targetPath);
                        self::rrmdir($tempDir);
                        return ['error' => 'Encrypted folders are not supported for remote storage.'];
                    }
                } catch (\Throwable $e) { /* ignore */ }
            }

            // Encrypt at rest if folder is marked encrypted (local storage only)
            if ($isLocal) {
                try {
                    if (FolderCrypto::isEncryptedOrAncestor($folderForLog)) {
                        if (!CryptoAtRest::isAvailable()) {
                            throw new \RuntimeException('Upload failed: encryption at rest is not supported on this server (libsodium secretstream missing).');
                        }
                        if (!CryptoAtRest::masterKeyIsConfigured()) {
                            throw new \RuntimeException('Upload failed: destination folder is encrypted but the encryption master key is not configured (Admin → Encryption at rest, or FR_ENCRYPTION_MASTER_KEY).');
                        }
                        CryptoAtRest::encryptFileInPlace($targetPath);
                    }
                } catch (\Throwable $e) {
                    error_log('Upload encryption failed: ' . $e->getMessage());
                    @unlink($targetPath);
                    self::rrmdir($tempDir);
                    $msg = $e->getMessage();
                    if (!is_string($msg) || trim($msg) === '') {
                        $msg = 'Upload failed: could not encrypt file at rest.';
                    }
                    return ['error' => $msg];
                }
            }

            if (!$isLocal) {
                $mimeType = function_exists('mime_content_type') ? mime_content_type($targetPath) : null;
                $size = @filesize($targetPath);
                $stream = @fopen($targetPath, 'rb');
                if ($stream === false) {
                    @unlink($targetPath);
                    self::rrmdir($tempDir);
                    return ['error' => 'Failed to open file for remote upload.'];
                }
                $ok = $storage->writeStream($targetPath, $stream, ($size === false ? null : (int)$size), $mimeType ?: null);
                @fclose($stream);
                if (!$ok) {
                    $detail = self::adapterErrorDetail($storage);
                    @unlink($targetPath);
                    self::rrmdir($tempDir);
                    return ['error' => $detail !== '' ? ('Failed to upload to remote storage: ' . $detail) : 'Failed to upload to remote storage.'];
                }
                @unlink($targetPath);
            }

            // Metadata
            $metadataKey      = ($folderSan === '') ? 'root' : $folderSan;
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
            $metadataFile     = self::metaRoot() . $metadataFileName;
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

            AuditHook::log('file.upload', [
                'user'   => $uploader,
                'folder' => $folderForLog,
                'path'   => ($folderForLog === 'root') ? $resumableFilename : ($folderForLog . '/' . $resumableFilename),
                'meta'   => self::portalMetaFromRequest(),
            ]);

            // Cleanup temp
            self::rrmdir($tempDir);

            return ['success' => 'File uploaded successfully'];
        }

        // --- NON-CHUNKED (drag-and-drop / folder uploads) ---
        $createdDirs = [];
        try {
            $folderSan = self::sanitizeFolder((string)($post['folder'] ?? 'root'));

            $baseUploadDir = self::uploadRoot();
            if ($folderSan !== '') {
                $baseUploadDir = rtrim($baseUploadDir, '/\\') . DIRECTORY_SEPARATOR
                    . str_replace('/', DIRECTORY_SEPARATOR, $folderSan) . DIRECTORY_SEPARATOR;
            }
            if (!self::ensureDir($baseUploadDir, $createdDirs)) {
                return ['error' => 'Failed to create upload directory'];
            }

            $safeFileNamePattern = REGEX_FILE_NAME;
            $metadataCollection  = [];
            $metadataChanged     = [];

            if (empty($files['file']) || empty($files['file']['name'])) {
                return ['error' => 'No files received'];
            }
            if (!is_array($files['file']['name'])) {
                $files['file']['name'] = [$files['file']['name']];
                $files['file']['tmp_name'] = [$files['file']['tmp_name'] ?? ''];
                $files['file']['error'] = [$files['file']['error'] ?? UPLOAD_ERR_OK];
            }

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

                if (!self::ensureDir($uploadDir, $createdDirs)) {
                    return ['error' => 'Failed to create subfolder: ' . $uploadDir];
                }

                $targetPath = $uploadDir . $safeFileName;
                if (!move_uploaded_file($files['file']['tmp_name'][$index], $targetPath)) {
                    return ['error' => 'Error uploading file'];
                }

                // Compute logical folder for logging: relative to UPLOAD_DIR
                $folderForLog = 'root';
                $rootDir      = rtrim(self::uploadRoot(), '/\\') . DIRECTORY_SEPARATOR;
                if (strpos($targetPath, $rootDir) === 0) {
                    $rel = substr($targetPath, strlen($rootDir));
                    $rel = str_replace(DIRECTORY_SEPARATOR, '/', $rel);
                    $slashPos = strrpos($rel, '/');
                    if ($slashPos !== false) {
                        $folderRel = substr($rel, 0, $slashPos);
                        if ($folderRel !== '') {
                            $folderForLog = $folderRel;
                        }
                    }
                } elseif ($folderSan !== '') {
                    // Fallback: if above fails, use sanitized folder
                    $folderForLog = $folderSan;
                }

                // Optional: virus scan this file
                $scanResult = self::scanFileIfEnabled($targetPath, [
                    'folder' => $folderForLog,
                    'file'   => $safeFileName,
                    'source' => 'normal', // core non-resumable upload
                ]);

                if (is_array($scanResult) && isset($scanResult['error'])) {
                    // scanFileIfEnabled already unlinks the file on failure/infection
                    return $scanResult;
                }

                if (!$isLocal) {
                    try {
                        if (FolderCrypto::isEncryptedOrAncestor($folderForLog)) {
                            @unlink($targetPath);
                            return ['error' => 'Encrypted folders are not supported for remote storage.'];
                        }
                    } catch (\Throwable $e) { /* ignore */ }
                }

                // Encrypt at rest if destination folder is encrypted (local storage only)
                if ($isLocal) {
                    try {
                        if (FolderCrypto::isEncryptedOrAncestor($folderForLog)) {
                            if (!CryptoAtRest::isAvailable()) {
                                throw new \RuntimeException('Upload failed: encryption at rest is not supported on this server (libsodium secretstream missing).');
                            }
                            if (!CryptoAtRest::masterKeyIsConfigured()) {
                                throw new \RuntimeException('Upload failed: destination folder is encrypted but the encryption master key is not configured (Admin → Encryption at rest, or FR_ENCRYPTION_MASTER_KEY).');
                            }
                            CryptoAtRest::encryptFileInPlace($targetPath);
                        }
                    } catch (\Throwable $e) {
                        error_log('Upload encryption failed: ' . $e->getMessage());
                        @unlink($targetPath);
                        $msg = $e->getMessage();
                        if (!is_string($msg) || trim($msg) === '') {
                            $msg = 'Upload failed: could not encrypt file at rest.';
                        }
                        return ['error' => $msg];
                    }
                }

                if (!$isLocal) {
                    $mimeType = function_exists('mime_content_type') ? mime_content_type($targetPath) : null;
                    $size = @filesize($targetPath);
                    $stream = @fopen($targetPath, 'rb');
                    if ($stream === false) {
                        @unlink($targetPath);
                        return ['error' => 'Failed to open file for remote upload.'];
                    }
                    $ok = $storage->writeStream($targetPath, $stream, ($size === false ? null : (int)$size), $mimeType ?: null);
                    @fclose($stream);
                    if (!$ok) {
                        $detail = self::adapterErrorDetail($storage);
                        @unlink($targetPath);
                        return ['error' => $detail !== '' ? ('Failed to upload to remote storage: ' . $detail) : 'Failed to upload to remote storage.'];
                    }
                    @unlink($targetPath);
                }

                $uploader = $_SESSION['username'] ?? 'Unknown';
                AuditHook::log('file.upload', [
                    'user'   => $uploader,
                    'folder' => $folderForLog,
                    'path'   => ($folderForLog === 'root') ? $safeFileName : ($folderForLog . '/' . $safeFileName),
                    'meta'   => self::portalMetaFromRequest(),
                ]);

                $metadataKey      = ($folderSan === '') ? 'root' : $folderSan;
                $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
                $metadataFile     = self::metaRoot() . $metadataFileName;

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
                    $metadataFile     = self::metaRoot() . $metadataFileName;
                    file_put_contents($metadataFile, json_encode($data, JSON_PRETTY_PRINT));
                }
            }

            return ['success' => 'Files uploaded successfully'];
        } finally {
            if (!$isLocal) {
                self::cleanupCreatedDirs($createdDirs, self::uploadRoot());
            }
        }
    }

    private static function ensureDir(string $path, array &$createdDirs): bool
    {
        $path = rtrim($path, "/\\");
        if ($path === '') {
            return false;
        }
        if (is_dir($path)) {
            return true;
        }

        $stack = [];
        $cur = $path;
        while ($cur !== '' && !is_dir($cur)) {
            $stack[] = $cur;
            $parent = dirname($cur);
            if ($parent === $cur) {
                break;
            }
            $cur = $parent;
        }

        for ($i = count($stack) - 1; $i >= 0; $i--) {
            $dir = $stack[$i];
            if (!is_dir($dir)) {
                if (!@mkdir($dir, 0775)) {
                    if (!is_dir($dir)) {
                        return false;
                    }
                } else {
                    $createdDirs[] = $dir;
                }
            }
        }

        return is_dir($path);
    }

    private static function cleanupCreatedDirs(array $createdDirs, string $root): void
    {
        if (empty($createdDirs)) {
            return;
        }

        $rootNorm = rtrim(str_replace('\\', '/', $root), '/') . '/';
        $unique = array_values(array_unique($createdDirs));
        usort($unique, static function ($a, $b) {
            return strlen((string)$b) <=> strlen((string)$a);
        });

        foreach ($unique as $dir) {
            if (!is_string($dir) || $dir === '') {
                continue;
            }
            $dirNorm = rtrim(str_replace('\\', '/', $dir), '/') . '/';
            if ($dirNorm === $rootNorm) {
                continue;
            }
            if ($rootNorm !== '' && strpos($dirNorm, $rootNorm) !== 0) {
                continue;
            }
            @rmdir($dir);
        }
    }

    /**
     * Optionally scan an uploaded file with ClamAV.
     *
     * $context may include the same keys as scanSingleUploadIfEnabled().
     *
     * Returns:
     *   - null           => scanning disabled or file clean
     *   - ['error' => …] => infected or scan error (file is deleted)
     */
    private static function scanFileIfEnabled(string $path, array $context = []): ?array
    {
        // Respect env override + admin setting
        if (!self::isVirusScanEnabled()) {
            return null; // scanning disabled
        }

        if (!is_file($path)) {
            return ['error' => 'Virus scan failed: uploaded file not found.'];
        }

        $cmd = defined('VIRUS_SCAN_CMD') ? VIRUS_SCAN_CMD : 'clamscan';

        $cmdline = escapeshellcmd($cmd)
            . ' --stdout --no-summary '
            . escapeshellarg($path)
            . ' 2>&1';

        $output   = [];
        $exitCode = 0;
        @exec($cmdline, $output, $exitCode);
        $msg = trim(implode("\n", $output));

        // 0 = clean
        if ($exitCode === 0) {
            return null;
        }

        // 1 = virus found → block + delete + log
        if ($exitCode === 1) {
            // Allow self-test endpoints to suppress log if they pass suppressLog=true
            if (empty($context['suppressLog'])) {
                self::logVirusDetection($path, $msg, $context, $cmd, $exitCode);
            }
            @unlink($path);
            return [
                'error' => 'Upload blocked: virus detected in file.',
            ];
        }

        // >1 = scanner error (missing DB, bad config, etc.)
        // Log but do NOT block the upload.
        error_log("ClamAV scan error (exit={$exitCode}, cmd={$cmd}): {$msg}");
        return null;
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

        $tempDir = rtrim(self::uploadRoot(), '/\\') . DIRECTORY_SEPARATOR . $folder;
        if (!is_dir($tempDir)) {
            return ['success' => true, 'message' => 'Temporary folder already removed.'];
        }

        self::rrmdir($tempDir);

        if (!is_dir($tempDir)) {
            return ['success' => true, 'message' => 'Temporary folder removed.'];
        }

        return ['error' => 'Failed to remove temporary folder.'];
    }

    /**
     * Append a virus detection record to META_DIR/virus_detections.log (JSONL).
     *
     * @param string $path       The scanned file path on disk.
     * @param string $rawMessage Raw clamscan output (stdout/stderr combined).
     * @param array  $context    Extra context: folder, file, user, ip, source, etc.
     * @param string $cmd        Command used (clamscan / custom).
     * @param int    $exitCode   ClamAV exit code.
     */
    private static function logVirusDetection(
        string $path,
        string $rawMessage,
        array $context,
        string $cmd,
        int $exitCode
    ): void {
        try {
            $baseMeta = rtrim(self::metaRoot(), '/\\') . DIRECTORY_SEPARATOR;
            if (!is_dir($baseMeta)) {
                @mkdir($baseMeta, 0775, true);
            }

            $user   = $context['user']   ?? ($_SESSION['username'] ?? 'Unknown');
            $ip     = $context['ip']     ?? self::getClientIp();
            $source = $context['source'] ?? 'normal';

            // Folder + file in log – prefer context, fallback to path
            $fileName = $context['file'] ?? basename($path);
            $folder   = $context['folder'] ?? null;

            if ($folder === null) {
                // Best-effort: derive folder relative to upload root
                $rootDir = rtrim(self::uploadRoot(), '/\\') . DIRECTORY_SEPARATOR;
                if (strpos($path, $rootDir) === 0) {
                    $rel     = substr($path, strlen($rootDir));
                    $rel     = str_replace(DIRECTORY_SEPARATOR, '/', $rel);
                    $pos     = strrpos($rel, '/');
                    $folder  = ($pos !== false) ? substr($rel, 0, $pos) : '';
                } else {
                    $folder = '';
                }
            }

            $msg = self::truncateLogMessage($rawMessage, 400);

            $record = [
                'ts'       => gmdate('c'),
                'user'     => $user,
                'ip'       => $ip,
                'folder'   => ($folder === '' ? 'root' : $folder),
                'file'     => $fileName,
                'source'   => $source,
                'engine'   => $cmd,
                'exitCode' => $exitCode,
                'message'  => $msg,
            ];

            $json = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                return;
            }

            // *** Canonical base path: matches virusLog.php ***
            $logFile  = $baseMeta . 'virus_detections.log';

            // Soft rotation
            if (file_exists($logFile) && filesize($logFile) > self::VIRUS_LOG_MAX_BYTES) {
                $ts  = date('Ymd-His');
                $rot = $baseMeta . 'virus_detections-' . $ts . '.log';
                @rename($logFile, $rot);
            }

            @file_put_contents($logFile, $json . "\n", FILE_APPEND | LOCK_EX);
        } catch (\Throwable $e) {
            // Never break uploads because logging failed.
            error_log('Failed to log virus detection: ' . $e->getMessage());
        }
    }

    /**
     * Best-effort client IP resolution for logging.
     */
    private static function getClientIp(): string
    {
        $keys = [
            'HTTP_X_FORWARDED_FOR',
            'HTTP_CLIENT_IP',
            'REMOTE_ADDR',
        ];

        foreach ($keys as $key) {
            if (!empty($_SERVER[$key])) {
                $val = trim((string)$_SERVER[$key]);
                // X-Forwarded-For may contain multiple IPs – use first
                if ($key === 'HTTP_X_FORWARDED_FOR' && strpos($val, ',') !== false) {
                    $parts = explode(',', $val);
                    $val   = trim($parts[0]);
                }
                return $val;
            }
        }

        return 'unknown';
    }

    /**
     * Truncate ClamAV output message for log safety.
     */
    private static function truncateLogMessage(string $msg, int $max): string
    {
        if (mb_strlen($msg, 'UTF-8') <= $max) {
            return $msg;
        }
        return mb_substr($msg, 0, $max, 'UTF-8') . '…';
    }
}
