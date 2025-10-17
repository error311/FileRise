<?php
// src/controllers/FileController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FileModel.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

class FileController
{
    /* =========================
     * Permission helpers (fail-closed)
     * ========================= */
    private function isAdmin(array $perms): bool {
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
        if (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) return true;
        $role = $_SESSION['role'] ?? null;
        if ($role === 'admin' || $role === '1' || $role === 1) return true;

        $u = $_SESSION['username'] ?? '';
        if ($u) {
            $roleStr = userModel::getUserRole($u);
            if ($roleStr === '1') return true;
        }
        return false;
    }

    private function isFolderOnly(array $perms): bool {
        return !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
    }

    private function getMetadataPath(string $folder): string {
        $folder = trim($folder);
        if ($folder === '' || strtolower($folder) === 'root') {
            return META_DIR . 'root_metadata.json';
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
    }

    private function loadFolderMetadata(string $folder): array {
        $meta = $this->getMetadataPath($folder);
        if (file_exists($meta)) {
            $data = json_decode(file_get_contents($meta), true);
            if (is_array($data)) return $data;
        }
        return [];
    }

    private function loadPerms(string $username): array {
        try {
            if (function_exists('loadUserPermissions')) {
                $p = loadUserPermissions($username);
                return is_array($p) ? $p : [];
            }
            if (class_exists('userModel') && method_exists('userModel', 'getUserPermissions')) {
                $all = userModel::getUserPermissions();
                if (is_array($all)) {
                    if (isset($all[$username])) return (array)$all[$username];
                    $lk = strtolower($username);
                    if (isset($all[$lk])) return (array)$all[$lk];
                }
            }
        } catch (\Throwable $e) { /* ignore */ }
        return [];
    }

    private function enforceScopeAndOwnership(string $folder, array $files, string $username, array $userPermissions): ?string {
        $ignoreOwnership = $this->isAdmin($userPermissions)
            || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

        if ($this->isFolderOnly($userPermissions) && !$this->isAdmin($userPermissions)) {
            $folder = trim($folder);
            if ($folder !== '' && strtolower($folder) !== 'root') {
                if ($folder !== $username && strpos($folder, $username . '/') !== 0) {
                    return "Forbidden: folder scope violation.";
                }
            }
        }

        if ($ignoreOwnership) return null;

        $metadata = $this->loadFolderMetadata($folder);
        foreach ($files as $f) {
            $name = basename((string)$f);
            if (!isset($metadata[$name]['uploader']) || strcasecmp($metadata[$name]['uploader'], $username) !== 0) {
                return "Forbidden: you are not the owner of '{$name}'.";
            }
        }
        return null;
    }

    private function enforceFolderScope(string $folder, string $username, array $userPermissions): ?string {
        if ($this->isAdmin($userPermissions)) return null;
        if (!$this->isFolderOnly($userPermissions)) return null;

        $f = trim($folder);
        while ($f !== '' && strtolower($f) !== 'root') {
            if (FolderModel::getOwnerFor($f) === $username) return null;
            $pos = strrpos($f, '/');
            $f = $pos === false ? '' : substr($f, 0, $pos);
        }
        return "Forbidden: folder scope violation.";
    }

    // --- small helpers ---
    private function _jsonStart(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        header('Content-Type: application/json; charset=utf-8');
        set_error_handler(function ($severity, $message, $file, $line) {
            if (!(error_reporting() & $severity)) return;
            throw new ErrorException($message, 0, $severity, $file, $line);
        });
    }
    private function _jsonEnd(): void { restore_error_handler(); }
    private function _jsonOut(array $payload, int $status = 200): void {
        http_response_code($status);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    private function _checkCsrf(): bool {
        $headersArr = function_exists('getallheaders')
            ? array_change_key_case(getallheaders(), CASE_LOWER)
            : [];
        $receivedToken = $headersArr['x-csrf-token'] ?? '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            $this->_jsonOut(['error' => 'Invalid CSRF token'], 403);
            return false;
        }
        return true;
    }
    private function _requireAuth(): bool {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            $this->_jsonOut(['error' => 'Unauthorized'], 401);
            return false;
        }
        return true;
    }
    private function _readJsonBody(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
    private function _normalizeFolder($f): string {
        $f = trim((string)$f);
        if ($f === '' || strtolower($f) === 'root') return 'root';
        return $f;
    }
    private function _validFolder($f): bool {
        if ($f === 'root') return true;
        return (bool)preg_match(REGEX_FOLDER_NAME, $f);
    }
    private function _validFile($f): bool {
        $f = basename((string)$f);
        return $f !== '' && (bool)preg_match(REGEX_FILE_NAME, $f);
    }

    /* =========================
     * Actions
     * ========================= */

    public function copyFiles()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!$data || !isset($data['source'], $data['destination'], $data['files']) || !is_array($data['files'])) {
                $this->_jsonOut(["error" => "Invalid request"], 400); return;
            }

            $sourceFolder      = $this->_normalizeFolder($data['source']);
            $destinationFolder = $this->_normalizeFolder($data['destination']);
            $files             = $data['files'];

            if (!$this->_validFolder($sourceFolder) || !$this->_validFolder($destinationFolder)) {
                $this->_jsonOut(["error" => "Invalid folder name(s)."], 400); return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // ACL: require read on source and write on destination (or write on both if your ACL only has canWrite)
            if (!ACL::canRead($username, $userPermissions, $sourceFolder)) {
                $this->_jsonOut(["error"=>"Forbidden: no read access to source"], 403); return;
            }
            if (!ACL::canWrite($username, $userPermissions, $destinationFolder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access to destination"], 403); return;
            }

            // scope/ownership
            $violation = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
            if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }
            $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions);
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            $result = FileModel::copyFiles($sourceFolder, $destinationFolder, $files);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::copyFiles error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while copying files.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function deleteFiles()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!isset($data['files']) || !is_array($data['files'])) {
                $this->_jsonOut(["error" => "No file names provided"], 400); return;
            }

            $folder = $this->_normalizeFolder($data['folder'] ?? 'root');
            if (!$this->_validFolder($folder)) {
                $this->_jsonOut(["error" => "Invalid folder name."], 400); return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (!ACL::canWrite($username, $userPermissions, $folder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access"], 403); return;
            }

            $violation = $this->enforceScopeAndOwnership($folder, $data['files'], $username, $userPermissions);
            if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }

            $result = FileModel::deleteFiles($folder, $data['files']);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::deleteFiles error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while deleting files.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function moveFiles()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!$data || !isset($data['source'], $data['destination'], $data['files']) || !is_array($data['files'])) {
                $this->_jsonOut(["error" => "Invalid request"], 400); return;
            }

            $sourceFolder      = $this->_normalizeFolder($data['source']);
            $destinationFolder = $this->_normalizeFolder($data['destination']);
            if (!$this->_validFolder($sourceFolder) || !$this->_validFolder($destinationFolder)) {
                $this->_jsonOut(["error" => "Invalid folder name(s)."], 400); return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // Require write on both source and destination to be safe
            if (!ACL::canWrite($username, $userPermissions, $sourceFolder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access to source"], 403); return;
            }
            if (!ACL::canWrite($username, $userPermissions, $destinationFolder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access to destination"], 403); return;
            }

            $violation = $this->enforceScopeAndOwnership($sourceFolder, $data['files'], $username, $userPermissions);
            if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }
            $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions);
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            $result = FileModel::moveFiles($sourceFolder, $destinationFolder, $data['files']);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::moveFiles error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while moving files.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function renameFile()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!$data || !isset($data['folder'], $data['oldName'], $data['newName'])) {
                $this->_jsonOut(["error" => "Invalid input"], 400); return;
            }

            $folder  = $this->_normalizeFolder($data['folder']);
            $oldName = basename(trim((string)$data['oldName']));
            $newName = basename(trim((string)$data['newName']));
            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name"], 400); return; }
            if (!$this->_validFile($oldName) || !$this->_validFile($newName)) {
                $this->_jsonOut(["error"=>"Invalid file name(s)."], 400); return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (!ACL::canWrite($username, $userPermissions, $folder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access"], 403); return;
            }

            $violation = $this->enforceScopeAndOwnership($folder, [$oldName], $username, $userPermissions);
            if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }

            $result = FileModel::renameFile($folder, $oldName, $newName);
            if (!is_array($result)) throw new RuntimeException('FileModel::renameFile returned non-array');
            if (isset($result['error'])) { $this->_jsonOut($result, 400); return; }
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::renameFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while renaming file.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function saveFile()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (empty($data) || !isset($data["fileName"])) {
                $this->_jsonOut(["error" => "Invalid request data"], 400); return;
            }

            $fileName = basename(trim((string)$data["fileName"]));
            $folder   = $this->_normalizeFolder($data["folder"] ?? 'root');
            if (!$this->_validFile($fileName)) { $this->_jsonOut(["error"=>"Invalid file name."], 400); return; }
            if (!$this->_validFolder($folder))  { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (!ACL::canWrite($username, $userPermissions, $folder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access"], 403); return;
            }

            $dv = $this->enforceFolderScope($folder, $username, $userPermissions);
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            // If overwriting, enforce ownership for non-admins
            $baseDir = rtrim(UPLOAD_DIR, '/\\');
            $dir = ($folder === 'root') ? $baseDir : $baseDir . DIRECTORY_SEPARATOR . $folder;
            $path = $dir . DIRECTORY_SEPARATOR . $fileName;
            if (is_file($path)) {
                $violation = $this->enforceScopeAndOwnership($folder, [$fileName], $username, $userPermissions);
                if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }
            }

            $deny = ['php','phtml','phar','php3','php4','php5','php7','php8','pht','shtml','cgi','fcgi'];
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            if (in_array($ext, $deny, true)) {
                $this->_jsonOut(['error' => 'Saving this file type is not allowed.'], 400); return;
            }

            $content = (string)($data['content'] ?? '');
            $result = FileModel::saveFile($folder, $fileName, $content, $username);
            if (!is_array($result)) throw new RuntimeException('FileModel::saveFile returned non-array');
            if (isset($result['error'])) { $this->_jsonOut($result, 400); return; }
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::saveFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while saving file.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function downloadFile()
{
    if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(["error" => "Unauthorized"]);
        exit;
    }

    $file   = isset($_GET['file']) ? basename($_GET['file']) : '';
    $folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';

    if (!preg_match(REGEX_FILE_NAME, $file)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid file name."]);
        exit;
    }
    if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid folder name."]);
        exit;
    }

    $username = $_SESSION['username'] ?? '';
    $perms    = $this->loadPerms($username);

    $ignoreOwnership = $this->isAdmin($perms)
        || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

    // Folder-level view grants
    $fullView   = $ignoreOwnership || ACL::canRead($username, $perms, $folder);
    $ownGrant   = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

    if (!$fullView && !$ownGrant) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: no view access to this folder."]);
        exit;
    }

    // If own-only, enforce uploader==user
    if ($ownGrant) {
        $meta = $this->loadFolderMetadata($folder);
        if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
            http_response_code(403);
            echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
            exit;
        }
    }

    $downloadInfo = FileModel::getDownloadInfo($folder, $file);
    if (isset($downloadInfo['error'])) {
        http_response_code((in_array($downloadInfo['error'], ["File not found.", "Access forbidden."])) ? 404 : 400);
        echo json_encode(["error" => $downloadInfo['error']]);
        exit;
    }

    $realFilePath = $downloadInfo['filePath'];
    $mimeType     = $downloadInfo['mimeType'];
    header("Content-Type: " . $mimeType);

    $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
    $inlineImageTypes = ['jpg','jpeg','png','gif','bmp','webp','svg','ico'];
    if (in_array($ext, $inlineImageTypes, true)) {
        header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
    } else {
        header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
    }
    header('Content-Length: ' . filesize($realFilePath));
    readfile($realFilePath);
    exit;
}

public function downloadZip()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;

        $data = $this->_readJsonBody();
        if (!is_array($data) || !isset($data['folder'], $data['files']) || !is_array($data['files'])) {
            $this->_jsonOut(["error" => "Invalid input."], 400); return;
        }

        $folder = $this->_normalizeFolder($data['folder']);
        $files  = $data['files'];
        if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);

        // Optional zip gate by account flag
        if (!$this->isAdmin($perms) && array_key_exists('canZip', $perms) && !$perms['canZip']) {
            $this->_jsonOut(["error" => "ZIP downloads are not allowed for your account."], 403); return;
        }

        $ignoreOwnership = $this->isAdmin($perms)
            || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

        $fullView = $ignoreOwnership || ACL::canRead($username, $perms, $folder);
        $ownOnly  = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

        if (!$fullView && !$ownOnly) {
            $this->_jsonOut(["error" => "Forbidden: no view access to this folder."], 403); return;
        }

        // If own-only, ensure all files are owned by the user
        if ($ownOnly) {
            $meta = $this->loadFolderMetadata($folder);
            foreach ($files as $f) {
                $bn = basename((string)$f);
                if (!isset($meta[$bn]['uploader']) || strcasecmp((string)$meta[$bn]['uploader'], $username) !== 0) {
                    $this->_jsonOut(["error" => "Forbidden: you are not the owner of '{$bn}'."], 403); return;
                }
            }
        }

        $result = FileModel::createZipArchive($folder, $files);
        if (isset($result['error'])) {
            $this->_jsonOut(["error" => $result['error']], 400); return;
        }

        $zipPath = $result['zipPath'] ?? null;
        if (!$zipPath || !file_exists($zipPath)) { $this->_jsonOut(["error"=>"ZIP archive not found."], 500); return; }

        // switch to file streaming
        header_remove('Content-Type');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="files.zip"');
        header('Content-Length: ' . filesize($zipPath));
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');

        readfile($zipPath);
        @unlink($zipPath);
        exit;
    } catch (Throwable $e) {
        error_log('FileController::downloadZip error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
        $this->_jsonOut(['error' => 'Internal server error while preparing ZIP.'], 500);
    } finally { $this->_jsonEnd(); }
}

public function extractZip()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;

        $data = $this->_readJsonBody();
        if (!is_array($data) || !isset($data['folder'], $data['files']) || !is_array($data['files'])) {
            $this->_jsonOut(["error" => "Invalid input."], 400); return;
        }

        $folder = $this->_normalizeFolder($data['folder']);
        if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);

        // must be able to write into target folder
        if (!ACL::canWrite($username, $perms, $folder)) {
            $this->_jsonOut(["error"=>"Forbidden: no write access to destination"], 403); return;
        }

        $dv = $this->enforceFolderScope($folder, $username, $perms);
        if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

        $result = FileModel::extractZipArchive($folder, $data['files']);
        $this->_jsonOut($result);
    } catch (Throwable $e) {
        error_log('FileController::extractZip error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
        $this->_jsonOut(['error' => 'Internal server error while extracting ZIP.'], 500);
    } finally { $this->_jsonEnd(); }
}

    public function shareFile()
    {
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);

        if (empty($token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token."]);
            exit;
        }

        $record = FileModel::getShareRecord($token);
        if (!$record) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Share link not found."]);
            exit;
        }

        if (time() > $record['expires']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "This link has expired."]);
            exit;
        }

        if (!empty($record['password']) && empty($providedPass)) {
            header("Content-Type: text/html; charset=utf-8");
            ?>
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enter Password</title></head>
<body>
  <h2>This file is protected by a password.</h2>
  <form method="get" action="/api/file/share.php">
    <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
    <label for="pass">Password:</label>
    <input type="password" name="pass" id="pass" required>
    <button type="submit">Submit</button>
  </form>
</body>
</html>
<?php
            exit;
        }

        if (!empty($record['password'])) {
            if (!password_verify($providedPass, $record['password'])) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(["error" => "Invalid password."]);
                exit;
            }
        }

        $folder = trim($record['folder'], "/\\ ");
        $file = $record['file'];
        $filePath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!empty($folder) && strtolower($folder) !== 'root') {
            $filePath .= $folder . DIRECTORY_SEPARATOR;
        }
        $filePath .= $file;

        $realFilePath = realpath($filePath);
        $uploadDirReal = realpath(UPLOAD_DIR);
        if ($realFilePath === false || strpos($realFilePath, $uploadDirReal) !== 0) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "File not found."]);
            exit;
        }
        if (!file_exists($realFilePath)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "File not found."]);
            exit;
        }

        $mimeType = mime_content_type($realFilePath);
        header("Content-Type: " . $mimeType);
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'])) {
            header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
        } else {
            header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
        }
        header("Cache-Control: no-store, no-cache, must-revalidate");
        header("Pragma: no-cache");
        header('Content-Length: ' . filesize($realFilePath));

        readfile($realFilePath);
        exit;
    }

    public function createShareLink()
    {
        $this->_jsonStart();
        try {
            if (!$this->_requireAuth()) return;

            $input = $this->_readJsonBody();
            if (!$input) { $this->_jsonOut(["error" => "Invalid input."], 400); return; }

            $folder = $this->_normalizeFolder($input['folder'] ?? '');
            $file   = basename((string)($input['file'] ?? ''));
            $value  = isset($input['expirationValue']) ? (int)$input['expirationValue'] : 60;
            $unit   = $input['expirationUnit'] ?? 'minutes';
            $password = (string)($input['password'] ?? '');

            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }
            if (!$this->_validFile($file))     { $this->_jsonOut(["error"=>"Invalid file name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (!ACL::canShare($username, $userPermissions, $folder)) {
                $this->_jsonOut(["error"=>"Forbidden: no share access"], 403); return;
            }

            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
            if (!$ignoreOwnership) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || $meta[$file]['uploader'] !== $username) {
                    $this->_jsonOut(["error" => "Forbidden: you are not the owner of this file."], 403); return;
                }
            }

            switch ($unit) {
                case 'seconds': $expirationSeconds = $value; break;
                case 'hours':   $expirationSeconds = $value * 3600; break;
                case 'days':    $expirationSeconds = $value * 86400; break;
                case 'minutes':
                default:        $expirationSeconds = $value * 60; break;
            }

            $result = FileModel::createShareLink($folder, $file, $expirationSeconds, $password);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::createShareLink error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while creating share link.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function getTrashItems()
{
    $this->_jsonStart();
    try {
        if (!$this->_requireAuth()) return;
        $perms = $this->loadPerms($_SESSION['username'] ?? '');
        if (!$this->isAdmin($perms)) { $this->_jsonOut(['error'=>'Admin only'], 403); return; }

        $trashItems = FileModel::getTrashItems();
        $this->_jsonOut($trashItems);
    } catch (Throwable $e) {
        error_log('FileController::getTrashItems error: '.$e->getMessage());
        $this->_jsonOut(['error' => 'Internal server error while fetching trash.'], 500);
    } finally { $this->_jsonEnd(); }
}

public function restoreFiles()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;
        $perms = $this->loadPerms($_SESSION['username'] ?? '');
        if (!$this->isAdmin($perms)) { $this->_jsonOut(['error'=>'Admin only'], 403); return; }

        $data = $this->_readJsonBody();
        if (!isset($data['files']) || !is_array($data['files'])) {
            $this->_jsonOut(["error" => "No file or folder identifiers provided"], 400); return;
        }
        $result = FileModel::restoreFiles($data['files']);
        $this->_jsonOut($result);
    } catch (Throwable $e) {
        error_log('FileController::restoreFiles error: '.$e->getMessage());
        $this->_jsonOut(['error' => 'Internal server error while restoring files.'], 500);
    } finally { $this->_jsonEnd(); }
}

public function deleteTrashFiles()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;
        $perms = $this->loadPerms($_SESSION['username'] ?? '');
        if (!$this->isAdmin($perms)) { $this->_jsonOut(['error'=>'Admin only'], 403); return; }

        $data = $this->_readJsonBody();
        if (!$data) { $this->_jsonOut(["error" => "Invalid input"], 400); return; }

        $filesToDelete = [];
        if (!empty($data['deleteAll'])) {
            $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
            $shareFile = $trashDir . "trash.json";
            if (file_exists($shareFile)) {
                $tmp = json_decode(file_get_contents($shareFile), true);
                if (is_array($tmp)) {
                    foreach ($tmp as $item) {
                        if (!empty($item['trashName'])) $filesToDelete[] = $item['trashName'];
                    }
                }
            }
        } elseif (isset($data['files']) && is_array($data['files'])) {
            $filesToDelete = $data['files'];
        } else {
            $this->_jsonOut(["error" => "No trash file identifiers provided"], 400); return;
        }

        $result = FileModel::deleteTrashFiles($filesToDelete);
        if (!empty($result['deleted'])) {
            $msg = "Trash item".(count($result['deleted']) === 1 ? "" : "s")." deleted: ".implode(", ", $result['deleted']);
            $this->_jsonOut(["success"=>$msg]);
        } elseif (!empty($result['error'])) {
            $this->_jsonOut(["error"=>$result['error']], 400);
        } else {
            $this->_jsonOut(["success"=>"No items to delete."]);
        }
    } catch (Throwable $e) {
        error_log('FileController::deleteTrashFiles error: '.$e->getMessage());
        $this->_jsonOut(['error' => 'Internal server error while deleting trash files.'], 500);
    } finally { $this->_jsonEnd(); }
}

    public function getFileTags(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $tags = FileModel::getFileTags();
        echo json_encode($tags);
        exit;
    }

    public function saveFileTag(): void
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!$data) { $this->_jsonOut(["error" => "No data received"], 400); return; }

            $file        = trim((string)($data['file'] ?? ''));
            $folder      = $this->_normalizeFolder($data['folder'] ?? 'root');
            $tags        = $data['tags'] ?? [];
            $deleteGlobal= !empty($data['deleteGlobal']);
            $tagToDelete = isset($data['tagToDelete']) ? trim((string)$data['tagToDelete']) : null;

            if ($file === '' || !$this->_validFile($file)) { $this->_jsonOut(["error"=>"Invalid file."], 400); return; }
            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (!ACL::canWrite($username, $userPermissions, $folder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access"], 403); return;
            }

            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
            if (!$ignoreOwnership) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || $meta[$file]['uploader'] !== $username) {
                    $this->_jsonOut(["error" => "Forbidden: you are not the owner of this file."], 403); return;
                }
            }

            $result = FileModel::saveFileTag($folder, $file, $tags, $deleteGlobal, $tagToDelete);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::saveFileTag error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while saving tags.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function getFileList(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    header('Content-Type: application/json; charset=utf-8');

    // convert warnings/notices to exceptions for cleaner error handling
    set_error_handler(function ($severity, $message, $file, $line) {
        if (!(error_reporting() & $severity)) return;
        throw new ErrorException($message, 0, $severity, $file, $line);
    });

    try {
        if (empty($_SESSION['username'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!is_dir(META_DIR)) @mkdir(META_DIR, 0775, true);

        $folder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'root';
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder name.']);
            return;
        }

        if (!is_dir(UPLOAD_DIR)) {
            http_response_code(500);
            echo json_encode(['error' => 'Uploads directory not found.']);
            return;
        }

        // ---- Folder-level view checks (full vs own-only) ----
        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);     // your existing helper
        $fullView = ACL::canRead($username, $perms, $folder);
        $ownOnlyGrant = ACL::hasGrant($username, $folder, 'read_own');

        if (!$fullView && !$ownOnlyGrant) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: no view access to this folder.']);
            return;
        }

        // Fetch the list
        $result = FileModel::getFileList($folder);
        if ($result === false || $result === null) {
            http_response_code(500);
            echo json_encode(['error' => 'File model failed.']);
            return;
        }
        if (!is_array($result)) {
            throw new RuntimeException('FileModel::getFileList returned a non-array.');
        }
        if (isset($result['error'])) {
            http_response_code(400);
            echo json_encode($result);
            return;
        }

        // ---- Apply own-only filter if user does NOT have full view ----
        if (!$fullView && $ownOnlyGrant && isset($result['files'])) {
            $files = $result['files'];

            // If files keyed by filename
            if (is_array($files) && array_keys($files) !== range(0, count($files) - 1)) {
                $filtered = [];
                foreach ($files as $name => $meta) {
                    // SAFETY: only include when uploader is present AND matches
                    if (isset($meta['uploader']) && strcasecmp((string)$meta['uploader'], $username) === 0) {
                        $filtered[$name] = $meta;
                    }
                }
                $result['files'] = $filtered;
            }
            // If files are a numeric array of metadata
            else if (is_array($files)) {
                $result['files'] = array_values(array_filter(
                    $files,
                    function ($f) use ($username) {
                        return isset($f['uploader']) && strcasecmp((string)$f['uploader'], $username) === 0;
                    }
                ));
            }
        }

        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch (Throwable $e) {
        error_log('FileController::getFileList error: '.$e->getMessage().' in '.$e->getFile().':'.$e->getLine());
        http_response_code(500);
        echo json_encode(['error' => 'Internal server error while listing files.']);
    } finally {
        restore_error_handler();
    }
}

    public function getShareLinks()
    {
        header('Content-Type: application/json');
        $shareFile = FileModel::getAllShareLinks();
        echo json_encode($shareFile, JSON_PRETTY_PRINT);
    }

    public function getAllShareLinks(): void
    {
        header('Content-Type: application/json');
        $shareFile = META_DIR . 'share_links.json';
        $links     = file_exists($shareFile)
                   ? json_decode(file_get_contents($shareFile), true) ?? []
                   : [];
        $now       = time();
        $cleaned   = [];

        foreach ($links as $token => $record) {
            if (!empty($record['expires']) && $record['expires'] < $now) continue;
            $cleaned[$token] = $record;
        }

        if (count($cleaned) !== count($links)) {
            file_put_contents($shareFile, json_encode($cleaned, JSON_PRETTY_PRINT));
        }

        echo json_encode($cleaned);
    }

    public function deleteShareLink()
    {
        header('Content-Type: application/json');
        $token = $_POST['token'] ?? '';
        if (!$token) { echo json_encode(['success' => false, 'error' => 'No token provided']); return; }

        $deleted = FileModel::deleteShareLink($token);
        echo json_encode($deleted ? ['success' => true] : ['success' => false, 'error' => 'Not found']);
    }

    public function createFile(): void
    {
        $this->_jsonStart();
        try {
            if (!$this->_requireAuth()) return;

            $body = $this->_readJsonBody();
            $folder   = $this->_normalizeFolder($body['folder'] ?? 'root');
            $filename = basename(trim((string)($body['name'] ?? '')));

            if (!$this->_validFolder($folder))   { $this->_jsonOut(["error" => "Invalid folder name."], 400); return; }
            if (!$this->_validFile($filename))   { $this->_jsonOut(["error" => "Invalid file name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (!ACL::canWrite($username, $userPermissions, $folder)) {
                $this->_jsonOut(["error"=>"Forbidden: no write access"], 403); return;
            }

            $dv = $this->enforceFolderScope($folder, $username, $userPermissions);
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            $result = FileModel::createFile($folder, $filename, $username);
            if (empty($result['success'])) {
                $this->_jsonOut(['success'=>false,'error'=>$result['error'] ?? 'Failed to create file'], $result['code'] ?? 400);
                return;
            }
            $this->_jsonOut(['success'=>true]);
        } catch (Throwable $e) {
            error_log('FileController::createFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while creating file.'], 500);
        } finally { $this->_jsonEnd(); }
    }
}