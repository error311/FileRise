<?php
// src/controllers/FileController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FileModel.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';


class FileController
{
    /* =========================
     * Permission helpers (fail-closed)
     * ========================= */
    private function isAdmin(array $perms): bool {
        // explicit flags in permissions blob
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
    
        // session-based flags commonly set at login
        if (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) return true;
    
        // sometimes apps store role in session
        $role = $_SESSION['role'] ?? null;
        if ($role === 'admin' || $role === '1' || $role === 1) return true;
    
        // definitive fallback: read users.txt role ("1" means admin)
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

    // Always return an array for user permissions.
    private function loadPerms(string $username): array
    {
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

    /** Enforce that (a) folder-only users act only in their subtree, and
     *  (b) non-admins own all files in the provided list (metadata.uploader === $username).
     *  Returns an error string on violation, or null if ok. */
    private function enforceScopeAndOwnership(string $folder, array $files, string $username, array $userPermissions): ?string {
        $ignoreOwnership = $this->isAdmin($userPermissions)
            || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
    
        // Folder-only users must stay in "<username>" subtree
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
    
        $folder = trim($folder);
        if ($folder !== '' && strtolower($folder) !== 'root') {
            if ($folder !== $username && strpos($folder, $username . '/') !== 0) {
                return "Forbidden: folder scope violation.";
            }
        }
        return null;
    }

    // --- JSON/session/error helpers (non-breaking additions) ---
private function _jsonStart(): void {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    header('Content-Type: application/json; charset=utf-8');
    // Turn notices/warnings into exceptions so we can return JSON instead of HTML
    set_error_handler(function ($severity, $message, $file, $line) {
        if (!(error_reporting() & $severity)) return; // respect @-silence
        throw new ErrorException($message, 0, $severity, $file, $line);
    });
}

private function _jsonEnd(): void {
    restore_error_handler();
}

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

    /**
     * @OA\Post(
     *     path="/api/file/copyFiles.php",
     *     summary="Copy files between folders",
     *     description="Copies files from a source folder to a destination folder. It validates folder names, handles file renaming if a conflict exists, and updates metadata accordingly.",
     *     operationId="copyFiles",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"source", "destination", "files"},
     *             @OA\Property(property="source", type="string", example="root"),
     *             @OA\Property(property="destination", type="string", example="Documents"),
     *             @OA\Property(
     *                 property="files",
     *                 type="array",
     *                 @OA\Items(type="string", example="example.pdf")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Files copied successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Files copied successfully")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request or input"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or read-only permission"
     *     )
     * )
     *
     * Handles copying files from a source folder to a destination folder.
     *
     * @return void Outputs JSON response.
     */
    public function copyFiles()
    {
        header('Content-Type: application/json');

        // --- CSRF Protection ---
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Check user permissions (assuming loadUserPermissions() is available).
        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if (!$this->isAdmin($userPermissions) && !empty($userPermissions['readOnly'])) {
            echo json_encode(["error" => "Read-only users are not allowed to copy files."]);
            exit;
        }

        // Get JSON input data.
        $data = json_decode(file_get_contents("php://input"), true);
        if (
            !$data ||
            !isset($data['source']) ||
            !isset($data['destination']) ||
            !isset($data['files'])
        ) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid request"]);
            exit;
        }

        $sourceFolder = trim($data['source']);
        $destinationFolder = trim($data['destination']);
        $files = $data['files'];

        // Validate folder names.
        if ($sourceFolder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $sourceFolder)) {
            echo json_encode(["error" => "Invalid source folder name."]);
            exit;
        }
        if ($destinationFolder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $destinationFolder)) {
            echo json_encode(["error" => "Invalid destination folder name."]);
            exit;
        }

        // Scope + ownership on source; scope on destination
        $violation = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
        if ($violation) { http_response_code(403); echo json_encode(["error"=>$violation]); return; }
        $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions);
        if ($dv) { http_response_code(403); echo json_encode(["error"=>$dv]); return; }

        // Delegate to the model.
        $result = FileModel::copyFiles($sourceFolder, $destinationFolder, $files);
        echo json_encode($result);
    }

    /**
     * @OA\Post(
     *     path="/api/file/deleteFiles.php",
     *     summary="Delete files (move to trash)",
     *     description="Moves the specified files from the given folder to the trash and updates metadata accordingly.",
     *     operationId="deleteFiles",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"files"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(
     *                 property="files",
     *                 type="array",
     *                 @OA\Items(type="string", example="example.pdf")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Files moved to Trash successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Files moved to Trash: file1.pdf, file2.doc")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or permission denied"
     *     )
     * )
     *
     * Handles deletion of files (moves them to Trash) by updating metadata.
     *
     * @return void Outputs JSON response.
     */
    public function deleteFiles()
    {
        header('Content-Type: application/json');

        // --- CSRF Protection ---
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Load user's permissions.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to delete files."]);
            exit;
        }

        // Get JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!isset($data['files']) || !is_array($data['files'])) {
            http_response_code(400);
            echo json_encode(["error" => "No file names provided"]);
            exit;
        }

        // Determine folder; default to 'root'.
        $folder = isset($data['folder']) ? trim($data['folder']) : 'root';
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }
        $folder = trim($folder, "/\\ ");

        // Scope + ownership
        $violation = $this->enforceScopeAndOwnership($folder, $data['files'], $username, $userPermissions);
        if ($violation) { http_response_code(403); echo json_encode(["error"=>$violation]); return; }

        // Delegate to the FileModel.
        $result = FileModel::deleteFiles($folder, $data['files']);
        echo json_encode($result);
    }

    /**
     * @OA\Post(
     *     path="/api/file/moveFiles.php",
     *     summary="Move files between folders",
     *     description="Moves files from a source folder to a destination folder, updating metadata accordingly.",
     *     operationId="moveFiles",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"source", "destination", "files"},
     *             @OA\Property(property="source", type="string", example="root"),
     *             @OA\Property(property="destination", type="string", example="Archives"),
     *             @OA\Property(
     *                 property="files",
     *                 type="array",
     *                 @OA\Items(type="string", example="report.pdf")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Files moved successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Files moved successfully")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request or input"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or permission denied"
     *     )
     * )
     *
     * Handles moving files from a source folder to a destination folder.
     *
     * @return void Outputs JSON response.
     */
    public function moveFiles()
    {
        header('Content-Type: application/json');

        // --- CSRF Protection ---
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Verify that the user is not read-only.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if (!$this->isAdmin($userPermissions) && !empty($userPermissions['readOnly'])) {
            echo json_encode(["error" => "Read-only users are not allowed to move files."]);
            exit;
        }

        // Get JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (
            !$data ||
            !isset($data['source']) ||
            !isset($data['destination']) ||
            !isset($data['files'])
        ) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid request"]);
            exit;
        }

        $sourceFolder = trim($data['source']) ?: 'root';
        $destinationFolder = trim($data['destination']) ?: 'root';

        // Validate folder names.
        if ($sourceFolder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $sourceFolder)) {
            echo json_encode(["error" => "Invalid source folder name."]);
            exit;
        }
        if ($destinationFolder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $destinationFolder)) {
            echo json_encode(["error" => "Invalid destination folder name."]);
            exit;
        }

        // Scope + ownership on source; scope on destination
        $violation = $this->enforceScopeAndOwnership($sourceFolder, $data['files'], $username, $userPermissions);
        if ($violation) { http_response_code(403); echo json_encode(["error"=>$violation]); return; }
        $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions);
        if ($dv) { http_response_code(403); echo json_encode(["error"=>$dv]); return; }

        // Delegate to the model.
        $result = FileModel::moveFiles($sourceFolder, $destinationFolder, $data['files']);
        echo json_encode($result);
    }

    /**
     * @OA\Post(
     *     path="/api/file/renameFile.php",
     *     summary="Rename a file",
     *     description="Renames a file within a specified folder and updates folder metadata. If a file with the new name exists, a unique name is generated.",
     *     operationId="renameFile",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder", "oldName", "newName"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(property="oldName", type="string", example="oldfile.pdf"),
     *             @OA\Property(property="newName", type="string", example="newfile.pdf")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File renamed successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="File renamed successfully"),
     *             @OA\Property(property="newName", type="string", example="newfile.pdf")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid input"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or permission denied"
     *     )
     * )
     *
     * Handles renaming a file by validating input and updating folder metadata.
     *
     * @return void Outputs a JSON response.
     */
    public function renameFile()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;

        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if (!$this->isAdmin($userPermissions) && !empty($userPermissions['readOnly'])) {
            $this->_jsonOut(["error" => "Read-only users are not allowed to rename files."], 403);
            return;
        }

        $data = $this->_readJsonBody();
        if (!$data || !isset($data['folder'], $data['oldName'], $data['newName'])) {
            $this->_jsonOut(["error" => "Invalid input"], 400);
            return;
        }

        $folder  = trim((string)$data['folder']) ?: 'root';
        $oldName = basename(trim((string)$data['oldName']));
        $newName = basename(trim((string)$data['newName']));

        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            $this->_jsonOut(["error" => "Invalid folder name"], 400);
            return;
        }
        if ($oldName === '' || !preg_match(REGEX_FILE_NAME, $oldName)) {
            $this->_jsonOut(["error" => "Invalid old file name."], 400);
            return;
        }
        if ($newName === '' || !preg_match(REGEX_FILE_NAME, $newName)) {
            $this->_jsonOut(["error" => "Invalid new file name."], 400);
            return;
        }

        // Non-admin must own the original
        $violation = $this->enforceScopeAndOwnership($folder, [$oldName], $username, $userPermissions);
        if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }

        $result = FileModel::renameFile($folder, $oldName, $newName);
        if (!is_array($result)) {
            throw new RuntimeException('FileModel::renameFile returned non-array');
        }
        if (isset($result['error'])) {
            $this->_jsonOut($result, 400);
            return;
        }
        $this->_jsonOut($result);

    } catch (Throwable $e) {
        error_log('FileController::renameFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
        $this->_jsonOut(['error' => 'Internal server error while renaming file.'], 500);
    } finally {
        $this->_jsonEnd();
    }
}

    /**
     * @OA\Post(
     *     path="/api/file/saveFile.php",
     *     summary="Save a file",
     *     description="Saves file content to disk in a specified folder and updates metadata accordingly.",
     *     operationId="saveFile",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"fileName", "content"},
     *             @OA\Property(property="fileName", type="string", example="document.txt"),
     *             @OA\Property(property="content", type="string", example="File content here"),
     *             @OA\Property(property="folder", type="string", example="Documents")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File saved successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="File saved successfully")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request data"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or read-only permission"
     *     )
     * )
     *
     * Handles saving a file's content and updating the corresponding metadata.
     *
     * @return void Outputs a JSON response.
     */
    public function saveFile()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;

        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if (!$this->isAdmin($userPermissions) && !empty($userPermissions['readOnly'])) {
            $this->_jsonOut(["error" => "Read-only users are not allowed to save files."], 403);
            return;
        }

        $data = $this->_readJsonBody();
        if (empty($data) || !isset($data["fileName"], $data["content"])) {
            $this->_jsonOut(["error" => "Invalid request data"], 400);
            return;
        }

        $fileName = basename(trim((string)$data["fileName"]));
        $folder   = isset($data["folder"]) ? trim((string)$data["folder"]) : "root";

        if ($fileName === '' || !preg_match(REGEX_FILE_NAME, $fileName)) {
            $this->_jsonOut(["error" => "Invalid file name."], 400);
            return;
        }
        if (strtolower($folder) !== "root" && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            $this->_jsonOut(["error" => "Invalid folder name"], 400);
            return;
        }

        // Folder-only users may only write within their scope
        $dv = $this->enforceFolderScope($folder, $username, $userPermissions);
        if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

        // If overwriting, enforce ownership for non-admins
        $baseDir = rtrim(UPLOAD_DIR, '/\\');
        $dir = (strtolower($folder) === 'root') ? $baseDir : $baseDir . DIRECTORY_SEPARATOR . $folder;
        $path = $dir . DIRECTORY_SEPARATOR . $fileName;
        if (is_file($path)) {
            $violation = $this->enforceScopeAndOwnership($folder, [$fileName], $username, $userPermissions);
            if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }
        }

        // Server-side guard: block saving executable/server-side script types
        $deny = ['php','phtml','phar','php3','php4','php5','php7','php8','pht','shtml','cgi','fcgi'];
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (in_array($ext, $deny, true)) {
            $this->_jsonOut(['error' => 'Saving this file type is not allowed.'], 400);
            return;
        }

        $result = FileModel::saveFile($folder, $fileName, (string)$data["content"], $username);
        if (!is_array($result)) {
            throw new RuntimeException('FileModel::saveFile returned non-array');
        }
        if (isset($result['error'])) {
            $this->_jsonOut($result, 400);
            return;
        }
        $this->_jsonOut($result);

    } catch (Throwable $e) {
        error_log('FileController::saveFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
        $this->_jsonOut(['error' => 'Internal server error while saving file.'], 500);
    } finally {
        $this->_jsonEnd();
    }
}

    /**
     * @OA\Get(
     *     path="/api/file/download.php",
     *     summary="Download a file",
     *     description="Downloads a file from a specified folder. The file is served inline for images or as an attachment for other types.",
     *     operationId="downloadFile",
     *     tags={"Files"},
     *     @OA\Parameter(
     *         name="file",
     *         in="query",
     *         description="The name of the file to download",
     *         required=true,
     *         @OA\Schema(type="string", example="example.pdf")
     *     ),
     *     @OA\Parameter(
     *         name="folder",
     *         in="query",
     *         description="The folder in which the file is located. Defaults to root.",
     *         required=false,
     *         @OA\Schema(type="string", example="Documents")
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File downloaded successfully"
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Access forbidden"
     *     ),
     *     @OA\Response(
     *         response=404,
     *         description="File not found"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error"
     *     )
     * )
     *
     * Downloads a file by validating parameters and serving its content.
     *
     * @return void Outputs file content with appropriate headers.
     */
    public function downloadFile()
    {
        // Check if the user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Get GET parameters.
        $file = isset($_GET['file']) ? basename($_GET['file']) : '';
        $folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';

        // Validate the file name using REGEX_FILE_NAME.
        if (!preg_match(REGEX_FILE_NAME, $file)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }

// Ownership enforcement (allow admin OR bypassOwnership)
$username        = $_SESSION['username'] ?? '';
$userPermissions = $this->loadPerms($username);

$ignoreOwnership = $this->isAdmin($userPermissions)
    || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

if (!$ignoreOwnership) {
    $meta = $this->loadFolderMetadata($folder);
    if (!isset($meta[$file]['uploader']) || $meta[$file]['uploader'] !== $username) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
        exit;
    }
}
        

        // Retrieve download info from the model.
        $downloadInfo = FileModel::getDownloadInfo($folder, $file);
        if (isset($downloadInfo['error'])) {
            http_response_code((in_array($downloadInfo['error'], ["File not found.", "Access forbidden."])) ? 404 : 400);
            echo json_encode(["error" => $downloadInfo['error']]);
            exit;
        }

        // Serve the file.
        $realFilePath = $downloadInfo['filePath'];
        $mimeType = $downloadInfo['mimeType'];
        header("Content-Type: " . $mimeType);

        // For images, serve inline; for others, force download.
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        $inlineImageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
        if (in_array($ext, $inlineImageTypes)) {
            header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
        } else {
            header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
        }
        header('Content-Length: ' . filesize($realFilePath));
        readfile($realFilePath);
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/file/downloadZip.php",
     *     summary="Download a ZIP archive of selected files",
     *     description="Creates a ZIP archive of the specified files in a folder and serves it for download.",
     *     operationId="downloadZip",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder", "files"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(
     *                 property="files",
     *                 type="array",
     *                 @OA\Items(type="string", example="example.pdf")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="ZIP archive created and served",
     *         @OA\MediaType(
     *             mediaType="application/zip"
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad request or invalid input"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error"
     *     )
     * )
     *
     * Downloads a ZIP archive of the specified files.
     *
     * @return void Outputs the ZIP file for download.
     */
    public function downloadZip()
    {
        // --- CSRF Protection ---
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        if (!$this->isAdmin($userPermissions) && array_key_exists('canZip', $userPermissions) && !$userPermissions['canZip']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "ZIP downloads are not allowed for your account."]);
            exit;
        }

        // Read and decode JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data) || !isset($data['folder']) || !isset($data['files']) || !is_array($data['files'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Invalid input."]);
            exit;
        }

        $folder = $data['folder'];
        $files = $data['files'];

        // Validate folder: if not "root", split and validate each segment.
        if ($folder !== "root") {
            $parts = explode('/', $folder);
            foreach ($parts as $part) {
                if (empty($part) || $part === '.' || $part === '..' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                    http_response_code(400);
                    header('Content-Type: application/json');
                    echo json_encode(["error" => "Invalid folder name."]);
                    exit;
                }
            }
        }

// Ownership enforcement (allow admin OR bypassOwnership)
$username        = $_SESSION['username'] ?? '';
$userPermissions = $this->loadPerms($username);

$ignoreOwnership = $this->isAdmin($userPermissions)
    || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

if (!$ignoreOwnership) {
    $meta = $this->loadFolderMetadata($folder);
    if (!isset($meta[$file]['uploader']) || $meta[$file]['uploader'] !== $username) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
        exit;
    }
}

        // Create ZIP archive using FileModel.
        $result = FileModel::createZipArchive($folder, $files);
        if (isset($result['error'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => $result['error']]);
            exit;
        }

        $zipPath = $result['zipPath'];
        if (!file_exists($zipPath)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(["error" => "ZIP archive not found."]);
            exit;
        }

        // Send headers to force download.
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="files.zip"');
        header('Content-Length: ' . filesize($zipPath));
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');

        // Output the ZIP file.
        readfile($zipPath);
        unlink($zipPath);
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/file/extractZip.php",
     *     summary="Extract ZIP files",
     *     description="Extracts ZIP archives from a specified folder and updates metadata. Returns a list of extracted files.",
     *     operationId="extractZip",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder", "files"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(
     *                 property="files",
     *                 type="array",
     *                 @OA\Items(type="string", example="archive.zip")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="ZIP files extracted successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true),
     *             @OA\Property(property="extractedFiles", type="array", @OA\Items(type="string"))
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid input"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     )
     * )
     *
     * Handles the extraction of ZIP files from a given folder.
     *
     * @return void Outputs JSON response.
     */
    public function extractZip()
    {
        header('Content-Type: application/json');

        // --- CSRF Protection ---
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Read and decode JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data) || !isset($data['folder']) || !isset($data['files']) || !is_array($data['files'])) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input."]);
            exit;
        }

        $folder = $data['folder'];
        $files = $data['files'];

        // Validate folder name.
        if ($folder !== "root") {
            $parts = explode('/', trim($folder));
            foreach ($parts as $part) {
                if (empty($part) || $part === '.' || $part === '..' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                    http_response_code(400);
                    echo json_encode(["error" => "Invalid folder name."]);
                    exit;
                }
            }
        }

        // Folder-only users can only extract inside their subtree
        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        $dv = $this->enforceFolderScope($folder, $username, $userPermissions);
        if ($dv) { http_response_code(403); echo json_encode(["error"=>$dv]); return; }

        // Delegate to the model.
        $result = FileModel::extractZipArchive($folder, $files);
        echo json_encode($result);
    }

    /**
     * @OA\Get(
     *     path="/api/file/share.php",
     *     summary="Access a shared file",
     *     description="Serves a shared file based on a share token. If the file is password protected and no password is provided, a password entry form is returned.",
     *     operationId="shareFile",
     *     tags={"Files"},
     *     @OA\Parameter(
     *         name="token",
     *         in="query",
     *         description="The share token",
     *         required=true,
     *         @OA\Schema(type="string")
     *     ),
     *     @OA\Parameter(
     *         name="pass",
     *         in="query",
     *         description="The password for the share if required",
     *         required=false,
     *         @OA\Schema(type="string")
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File served or password form rendered",
     *         @OA\MediaType(mediaType="application/octet-stream")
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Missing token or invalid request"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Link expired, invalid password, or forbidden access"
     *     ),
     *     @OA\Response(
     *         response=404,
     *         description="Share link or file not found"
     *     )
     * )
     *
     * Shares a file based on a share token. If the share record is password-protected and no password is provided,
     * an HTML form prompting for the password is returned.
     *
     * @return void Outputs either HTML (password form) or serves the file.
     */
    public function shareFile()
    {
        // Retrieve and sanitize GET parameters.
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);

        if (empty($token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token."]);
            exit;
        }

        // Get share record from the model.
        $record = FileModel::getShareRecord($token);
        if (!$record) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Share link not found."]);
            exit;
        }

        // Check expiration.
        if (time() > $record['expires']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "This link has expired."]);
            exit;
        }

        // If a password is required and not provided, show an HTML form.
        if (!empty($record['password']) && empty($providedPass)) {
            header("Content-Type: text/html; charset=utf-8");
?>
            <!DOCTYPE html>
            <html>

            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Enter Password</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        background-color: #f4f4f4;
                        color: #333;
                    }

                    form {
                        max-width: 400px;
                        margin: 40px auto;
                        background: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    }

                    input[type="password"] {
                        width: 100%;
                        padding: 10px;
                        margin: 10px 0;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                    }

                    button {
                        padding: 10px 20px;
                        background: #007BFF;
                        border: none;
                        border-radius: 4px;
                        color: #fff;
                        cursor: pointer;
                    }

                    button:hover {
                        background: #0056b3;
                    }
                </style>
            </head>

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

        // If a password is required, validate the provided password.
        if (!empty($record['password'])) {
            if (!password_verify($providedPass, $record['password'])) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(["error" => "Invalid password."]);
                exit;
            }
        }

        // Build file path securely.
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

        // Serve the file.
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

    /**
     * @OA\Post(
     *     path="/api/file/createShareLink.php",
     *     summary="Create a share link for a file",
     *     description="Generates a secure share link token for a specific file with optional password protection and a custom expiration time.",
     *     operationId="createShareLink",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder", "file", "expirationValue", "expirationUnit"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(property="file", type="string", example="report.pdf"),
     *             @OA\Property(property="expirationValue", type="integer", example=1),
     *             @OA\Property(
     *                 property="expirationUnit",
     *                 type="string",
     *                 enum={"seconds","minutes","hours","days"},
     *                 example="minutes"
     *             ),
     *             @OA\Property(property="password", type="string", example="secret")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Share link created successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="token", type="string", example="a1b2c3d4e5f6..."),
     *             @OA\Property(property="expires", type="integer", example=1621234567)
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request data"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Read-only users are not allowed to create share links"
     *     )
     * )
     *
     * Creates a share link for a file.
     *
     * @return void Outputs JSON response.
     */
    public function createShareLink()
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Check user permissions.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if (!$this->isAdmin($userPermissions) && !empty($userPermissions['readOnly'])) {
            http_response_code(403);
            echo json_encode(["error" => "Read-only users are not allowed to create share links."]);
            exit;
        }

        if (!$this->isAdmin($userPermissions) && array_key_exists('canShare', $userPermissions) && !$userPermissions['canShare']) {
            http_response_code(403);
            echo json_encode(["error" => "You are not allowed to create share links."]);
            exit;
        }

        // Parse POST JSON input.
        $input = json_decode(file_get_contents("php://input"), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input."]);
            exit;
        }

        // Extract parameters.
        $folder = isset($input['folder']) ? trim($input['folder']) : "";
        $file   = isset($input['file'])   ? basename($input['file'])   : "";
        $value  = isset($input['expirationValue']) ? intval($input['expirationValue']) : 60;
        $unit   = isset($input['expirationUnit'])  ? $input['expirationUnit']          : 'minutes';
        $password = isset($input['password']) ? $input['password'] : "";

        // Validate folder name.
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        // Non-admins can only share their own files
// Ownership enforcement (allow admin OR bypassOwnership)
$username        = $_SESSION['username'] ?? '';
$userPermissions = $this->loadPerms($username);

$ignoreOwnership = $this->isAdmin($userPermissions)
    || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

if (!$ignoreOwnership) {
    $meta = $this->loadFolderMetadata($folder);
    if (!isset($meta[$file]['uploader']) || $meta[$file]['uploader'] !== $username) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
        exit;
    }
}

        // Convert the provided value+unit into seconds
        switch ($unit) {
            case 'seconds':
                $expirationSeconds = $value;
                break;
            case 'hours':
                $expirationSeconds = $value * 3600;
                break;
            case 'days':
                $expirationSeconds = $value * 86400;
                break;
            case 'minutes':
            default:
                $expirationSeconds = $value * 60;
                break;
        }

        // Delegate share link creation to the model.
        $result = FileModel::createShareLink($folder, $file, $expirationSeconds, $password);

        echo json_encode($result);
    }

    /**
     * @OA\Get(
     *     path="/api/file/getTrashItems.php",
     *     summary="Get trash items",
     *     description="Retrieves a list of files that have been moved to Trash, enriched with metadata such as who deleted them and when.",
     *     operationId="getTrashItems",
     *     tags={"Files"},
     *     @OA\Response(
     *         response=200,
     *         description="Trash items retrieved successfully",
     *         @OA\JsonContent(type="array", @OA\Items(type="object"))
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     )
     * )
     *
     * Retrieves trash items from the trash metadata file.
     *
     * @return void Outputs JSON response with trash items.
     */
    public function getTrashItems()
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Delegate to the model.
        $trashItems = FileModel::getTrashItems();
        echo json_encode($trashItems);
    }

    /**
     * @OA\Post(
     *     path="/api/file/restoreFiles.php",
     *     summary="Restore trashed files",
     *     description="Restores files from Trash based on provided trash file identifiers and updates metadata.",
     *     operationId="restoreFiles",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"files"},
     *             @OA\Property(property="files", type="array", @OA\Items(type="string", example="trashedFile_1623456789.zip"))
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Files restored successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Items restored: file1, file2"),
     *             @OA\Property(property="restored", type="array", @OA\Items(type="string"))
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     )
     * )
     *
     * Restores files from Trash based on provided trash file names.
     *
     * @return void Outputs JSON response.
     */
    public function restoreFiles()
    {
        header('Content-Type: application/json');

        // CSRF Protection.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Read POST input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!isset($data['files']) || !is_array($data['files'])) {
            http_response_code(400);
            echo json_encode(["error" => "No file or folder identifiers provided"]);
            exit;
        }

        // Delegate restoration to the model.
        $result = FileModel::restoreFiles($data['files']);
        echo json_encode($result);
    }

    /**
     * @OA\Post(
     *     path="/api/file/deleteTrashFiles.php",
     *     summary="Delete trash files",
     *     description="Deletes trash items based on provided trash file identifiers from the trash metadata and removes the files from disk.",
     *     operationId="deleteTrashFiles",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             oneOf={
     *                 @OA\Schema(
     *                     required={"deleteAll"},
     *                     @OA\Property(property="deleteAll", type="boolean", example=true)
     *                 ),
     *                 @OA\Schema(
     *                     required={"files"},
     *                     @OA\Property(
     *                         property="files",
     *                         type="array",
     *                         @OA\Items(type="string", example="trashedfile_1234567890")
     *                     )
     *                 )
     *             }
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Trash items deleted successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="deleted", type="array", @OA\Items(type="string"))
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid input"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     )
     * )
     *
     * Deletes trash files by processing provided trash file identifiers.
     *
     * @return void Outputs a JSON response.
     */
    public function deleteTrashFiles()
    {
        header('Content-Type: application/json');

        // CSRF Protection.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Read and decode JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input"]);
            exit;
        }

        // Determine deletion mode.
        $filesToDelete = [];
        if (isset($data['deleteAll']) && $data['deleteAll'] === true) {
            // In this case, we need to delete all trash items.
            // Load current trash metadata.
            $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
            $shareFile = $trashDir . "trash.json";
            if (file_exists($shareFile)) {
                $json = file_get_contents($shareFile);
                $tempData = json_decode($json, true);
                if (is_array($tempData)) {
                    foreach ($tempData as $item) {
                        if (isset($item['trashName'])) {
                            $filesToDelete[] = $item['trashName'];
                        }
                    }
                }
            }
        } elseif (isset($data['files']) && is_array($data['files'])) {
            $filesToDelete = $data['files'];
        } else {
            http_response_code(400);
            echo json_encode(["error" => "No trash file identifiers provided"]);
            exit;
        }

        // Delegate deletion to the model.
        $result = FileModel::deleteTrashFiles($filesToDelete);

        // Build a human-friendly success or error message
        if (!empty($result['deleted'])) {
            $count = count($result['deleted']);
            $msg = "Trash item" . ($count === 1 ? "" : "s") . " deleted: " . implode(", ", $result['deleted']);
            echo json_encode(["success" => $msg]);
        } elseif (!empty($result['error'])) {
            echo json_encode(["error" => $result['error']]);
        } else {
            echo json_encode(["success" => "No items to delete."]);
        }
        exit;
    }

    /**
     * @OA\Get(
     *     path="/api/file/getFileTag.php",
     *     summary="Retrieve file tags",
     *     description="Retrieves tags from the createdTags.json metadata file.",
     *     operationId="getFileTags",
     *     tags={"Files"},
     *     @OA\Response(
     *         response=200,
     *         description="File tags retrieved successfully",
     *         @OA\JsonContent(
     *             type="array",
     *             @OA\Items(type="object")
     *         )
     *     )
     * )
     *
     * Retrieves file tags from the createdTags.json metadata file.
     *
     * @return void Outputs JSON response with file tags.
     */
    public function getFileTags(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        $tags = FileModel::getFileTags();
        echo json_encode($tags);
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/file/saveFileTag.php",
     *     summary="Save file tags",
     *     description="Saves tag data for a specified file and updates global tag data. For folder-specific tags, saves to the folder's metadata file.",
     *     operationId="saveFileTag",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"file", "tags"},
     *             @OA\Property(property="file", type="string", example="document.txt"),
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(
     *                 property="tags",
     *                 type="array",
     *                 @OA\Items(
     *                     type="object",
     *                     @OA\Property(property="name", type="string", example="Important"),
     *                     @OA\Property(property="color", type="string", example="#FF0000")
     *                 )
     *             ),
     *             @OA\Property(property="deleteGlobal", type="boolean", example=false),
     *             @OA\Property(property="tagToDelete", type="string", example="OldTag")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Tag data saved successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Tag data saved successfully."),
     *             @OA\Property(property="globalTags", type="array", @OA\Items(type="object"))
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request data"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or insufficient permissions"
     *     )
     * )
     *
     * Saves tag data for a file and updates the global tag repository.
     *
     * @return void Outputs JSON response.
     */
    public function saveFileTag(): void
    {
        header("Cache-Control: no-cache, no-store, must-revalidate");
        header("Pragma: no-cache");
        header("Expires: 0");
        header('Content-Type: application/json');

        // CSRF Protection.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfHeader = $headersArr['x-csrf-token'] ?? '';
        if (!isset($_SESSION['csrf_token']) || trim($csrfHeader) !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Check that the user is not read-only.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to file tags"]);
            exit;
        }

        // Retrieve and sanitize input.
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) {
            http_response_code(400);
            echo json_encode(["error" => "No data received"]);
            exit;
        }

        $file = isset($data['file']) ? trim($data['file']) : '';
        $folder = isset($data['folder']) ? trim($data['folder']) : 'root';
        $tags = $data['tags'] ?? [];
        $deleteGlobal = isset($data['deleteGlobal']) ? (bool)$data['deleteGlobal'] : false;
        $tagToDelete = isset($data['tagToDelete']) ? trim($data['tagToDelete']) : null;

        if ($file === '') {
            http_response_code(400);
            echo json_encode(["error" => "No file specified."]);
            exit;
        }

        // Validate folder name.
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

// Ownership enforcement (allow admin OR bypassOwnership)
$username        = $_SESSION['username'] ?? '';
$userPermissions = $this->loadPerms($username);

$ignoreOwnership = $this->isAdmin($userPermissions)
    || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

if (!$ignoreOwnership) {
    $meta = $this->loadFolderMetadata($folder);
    if (!isset($meta[$file]['uploader']) || $meta[$file]['uploader'] !== $username) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
        exit;
    }
}

        // Delegate to the model.
        $result = FileModel::saveFileTag($folder, $file, $tags, $deleteGlobal, $tagToDelete);
        echo json_encode($result);
    }

    /**
     * @OA\Get(
     *     path="/api/file/getFileList.php",
     *     summary="Get file list",
     *     description="Retrieves a list of files from a specified folder along with global tags and metadata.",
     *     operationId="getFileList",
     *     tags={"Files"},
     *     @OA\Parameter(
     *         name="folder",
     *         in="query",
     *         description="Folder name (defaults to 'root')",
     *         required=false,
     *         @OA\Schema(type="string", example="Documents")
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File list retrieved successfully",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="files", type="array", @OA\Items(type="object")),
     *             @OA\Property(property="globalTags", type="array", @OA\Items(type="object"))
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     )
     * )
     *
     * Retrieves the file list and associated metadata for the specified folder.
     *
     * @return void Outputs JSON response.
     */
    public function getFileList(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    header('Content-Type: application/json; charset=utf-8');

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

        if (!is_dir(META_DIR)) {
            @mkdir(META_DIR, 0775, true);
        }

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

        // --- viewOwnOnly (for non-admins) ---
        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);
        $admin    = $this->isAdmin($perms);
        $ownOnly  = !$admin && !empty($perms['viewOwnOnly']);

        if ($ownOnly && isset($result['files'])) {
            $files = $result['files'];
            if (is_array($files) && array_keys($files) !== range(0, count($files) - 1)) {
                // associative: name => meta
                $filtered = [];
                foreach ($files as $name => $meta) {
                    if (!isset($meta['uploader']) || strcasecmp((string)$meta['uploader'], $username) === 0) {
                        $filtered[$name] = $meta;
                    }
                }
                $result['files'] = $filtered;
            } elseif (is_array($files)) {
                // list of objects
                $result['files'] = array_values(array_filter($files, function ($f) use ($username) {
                    return !isset($f['uploader']) || strcasecmp((string)$f['uploader'], $username) === 0;
                }));
            }
        }

        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return;

    } catch (Throwable $e) {
        error_log('FileController::getFileList error: ' . $e->getMessage() .
                  ' in ' . $e->getFile() . ':' . $e->getLine());
        http_response_code(500);
        echo json_encode(['error' => 'Internal server error while listing files.']);
    } finally {
        restore_error_handler();
    }
}

    /**
     * GET /api/file/getShareLinks.php
     */
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
    
        // remove expired
        foreach ($links as $token => $record) {
            if (!empty($record['expires']) && $record['expires'] < $now) {
                continue;
            }
            $cleaned[$token] = $record;
        }
    
        if (count($cleaned) !== count($links)) {
            file_put_contents($shareFile, json_encode($cleaned, JSON_PRETTY_PRINT));
        }
    
        echo json_encode($cleaned);
    }

    /**
     * POST /api/file/deleteShareLink.php
     */
    public function deleteShareLink()
    {
        header('Content-Type: application/json');
        $token = $_POST['token'] ?? '';
        if (!$token) {
            echo json_encode(['success' => false, 'error' => 'No token provided']);
            return;
        }

        $deleted = FileModel::deleteShareLink($token);
        if ($deleted) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Not found']);
        }
    }

    /**
     * POST /api/file/createFile.php
     */
    public function createFile(): void
{
    $this->_jsonStart();
    try {
        if (!$this->_requireAuth()) return;

        $username = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);
        if (!$this->isAdmin($userPermissions) && !empty($userPermissions['readOnly'])) {
            $this->_jsonOut(["error" => "Read-only users are not allowed to create files."], 403);
            return;
        }

        $body = $this->_readJsonBody();
        $folder   = isset($body['folder']) ? trim((string)$body['folder']) : 'root';
        $filename = isset($body['name'])   ? basename(trim((string)$body['name'])) : '';

        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            $this->_jsonOut(["error" => "Invalid folder name."], 400); return;
        }
        if ($filename === '' || !preg_match(REGEX_FILE_NAME, $filename)) {
            $this->_jsonOut(["error" => "Invalid file name."], 400); return;
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
    } finally {
        $this->_jsonEnd();
    }
}
}