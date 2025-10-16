<?php
// src/controllers/FolderController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

class FolderController
{
    // ---- Helpers -----------------------------------------------------------
    private static function getHeadersLower(): array
    {
        // getallheaders() may not exist on some SAPIs
        if (function_exists('getallheaders')) {
            $h = getallheaders();
            if (is_array($h)) return array_change_key_case($h, CASE_LOWER);
        }
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (strpos($k, 'HTTP_') === 0) {
                $name = strtolower(str_replace('_', '-', substr($k, 5)));
                $headers[$name] = $v;
            }
        }
        return $headers;
    }

    private static function requireCsrf(): void
    {
        $headers = self::getHeadersLower();
        $received = trim($headers['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));
        if (!isset($_SESSION['csrf_token']) || $received !== $_SESSION['csrf_token']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid CSRF token']);
            exit;
        }
    }

    private static function requireAuth(): void
    {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }

    private static function requireNotReadOnly(): void
    {
        $username = $_SESSION['username'] ?? '';
        $perms    = loadUserPermissions($username);
        if ($username && !empty($perms['readOnly'])) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Read-only users are not allowed to perform this action.']);
            exit;
        }
    }

    private static function requireAdmin(): void
    {
        if (empty($_SESSION['isAdmin'])) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Admin privileges required.']);
            exit;
        }
    }

    private static function formatBytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes . " B";
        } elseif ($bytes < 1048576) {
            return round($bytes / 1024, 2) . " KB";
        } elseif ($bytes < 1073741824) {
            return round($bytes / 1048576, 2) . " MB";
        } else {
            return round($bytes / 1073741824, 2) . " GB";
        }
    }

    private function enforceFolderScope(string $folder, string $username, array $userPermissions): ?string {
        if ($this->isAdmin($userPermissions) || !empty($userPermissions['bypassFolderScope'])) return null;
        if (!$this->isFolderOnly($userPermissions)) return null;
    
        $folder = trim($folder);
        if ($folder !== '' && strtolower($folder) !== 'root') {
            if ($folder !== $username && strpos($folder, $username . '/') !== 0) {
                return "Forbidden: folder scope violation.";
            }
        }
        return null;
    }

    /**
     * @OA\Post(
     *     path="/api/folder/createFolder.php",
     *     summary="Create a new folder",
     *     description="Creates a new folder in the upload directory (under an optional parent) and creates an associated empty metadata file.",
     *     operationId="createFolder",
     *     tags={"Folders"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folderName"},
     *             @OA\Property(property="folderName", type="string", example="NewFolder"),
     *             @OA\Property(property="parent", type="string", example="Documents")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Folder created successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., invalid folder name)"
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
     */
    public function createFolder(): void
    {
        header('Content-Type: application/json');

        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            exit;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['folderName'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Folder name not provided.']);
            exit;
        }

        $folderName = trim($input['folderName']);
        $parent     = isset($input['parent']) ? trim($input['parent']) : "";

        if (!preg_match(REGEX_FOLDER_NAME, $folderName)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder name.']);
            exit;
        }
        if ($parent && !preg_match(REGEX_FOLDER_NAME, $parent)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid parent folder name.']);
            exit;
        }

        $result = FolderModel::createFolder($folderName, $parent);
        echo json_encode($result);
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/folder/deleteFolder.php",
     *     summary="Delete an empty folder",
     *     description="Deletes a specified folder if it is empty and not the root folder, and also removes its metadata file.",
     *     operationId="deleteFolder",
     *     tags={"Folders"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder"},
     *             @OA\Property(property="folder", type="string", example="Documents/Subfolder")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Folder deleted successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., invalid folder name or folder not empty)"
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
     */
    public function deleteFolder(): void
    {
        header('Content-Type: application/json');

        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(["error" => "Method not allowed."]);
            exit;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['folder'])) {
            http_response_code(400);
            echo json_encode(["error" => "Folder name not provided."]);
            exit;
        }

        $folder = trim($input['folder']);
        if (strtolower($folder) === 'root') {
            http_response_code(400);
            echo json_encode(["error" => "Cannot delete root folder."]);
            exit;
        }
        if (!preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        $result = FolderModel::deleteFolder($folder);
        echo json_encode($result);
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/folder/renameFolder.php",
     *     summary="Rename a folder",
     *     description="Renames an existing folder and updates its associated metadata files.",
     *     operationId="renameFolder",
     *     tags={"Folders"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"oldFolder", "newFolder"},
     *             @OA\Property(property="oldFolder", type="string", example="Documents/OldFolder"),
     *             @OA\Property(property="newFolder", type="string", example="Documents/NewFolder")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Folder renamed successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid folder names or folder does not exist"
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
     */
    public function renameFolder(): void
    {
        header('Content-Type: application/json');

        self::requireAuth();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            exit;
        }
        self::requireCsrf();
        self::requireNotReadOnly();

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Required folder names not provided.']);
            exit;
        }

        $oldFolder = trim($input['oldFolder']);
        $newFolder = trim($input['newFolder']);

        if (!preg_match(REGEX_FOLDER_NAME, $oldFolder) || !preg_match(REGEX_FOLDER_NAME, $newFolder)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder name(s).']);
            exit;
        }

        $result = FolderModel::renameFolder($oldFolder, $newFolder);
        echo json_encode($result);
        exit;
    }

    /**
     * @OA\Get(
     *     path="/api/folder/getFolderList.php",
     *     summary="Get list of folders",
     *     description="Retrieves the list of folders in the upload directory, including file counts and metadata file names for each folder.",
     *     operationId="getFolderList",
     *     tags={"Folders"},
     *     @OA\Parameter(
     *         name="folder",
     *         in="query",
     *         description="Optional folder name to filter the listing",
     *         required=false,
     *         @OA\Schema(type="string", example="Documents")
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Folder list retrieved successfully",
     *         @OA\JsonContent(
     *             type="array",
     *             @OA\Items(type="object")
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad request"
     *     )
     * )
     */
    public function getFolderList(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();

        $parent = $_GET['folder'] ?? null;
        if ($parent !== null && $parent !== '' && $parent !== 'root' && !preg_match(REGEX_FOLDER_NAME, $parent)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        $folderList = FolderModel::getFolderList($parent);
        echo json_encode($folderList);
        exit;
    }

    /**
     * @OA\Get(
     *     path="/api/folder/shareFolder.php",
     *     summary="Display a shared folder",
     *     description="Renders an HTML view of a shared folder's contents. Supports password protection, file listing with pagination, and an upload container if uploads are allowed.",
     *     operationId="shareFolder",
     *     tags={"Folders"},
     *     @OA\Parameter(
     *         name="token",
     *         in="query",
     *         description="The share token for the folder",
     *         required=true,
     *         @OA\Schema(type="string")
     *     ),
     *     @OA\Parameter(
     *         name="pass",
     *         in="query",
     *         description="The password if the folder is protected",
     *         required=false,
     *         @OA\Schema(type="string")
     *     ),
     *     @OA\Parameter(
     *         name="page",
     *         in="query",
     *         description="Page number for pagination",
     *         required=false,
     *         @OA\Schema(type="integer", example=1)
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Shared folder displayed",
     *         @OA\MediaType(mediaType="text/html")
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid request"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Access forbidden (expired link or invalid password)"
     *     ),
     *     @OA\Response(
     *         response=404,
     *         description="Share folder not found"
     *     )
     * )
     */
    public function shareFolder(): void
    {
        $token        = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);
        $page         = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
        if ($page === false || $page < 1) $page = 1;

        if (empty($token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token."]);
            exit;
        }

        $data = FolderModel::getSharedFolderData($token, $providedPass, $page);

        if (isset($data['needs_password']) && $data['needs_password'] === true) {
            header("Content-Type: text/html; charset=utf-8"); ?>
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Enter Password</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background-color: #f7f7f7; }
                    .container { max-width: 400px; margin: 80px auto; background: #fff; padding: 20px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
                    input[type="password"], button { width: 100%; padding: 10px; margin: 10px 0; font-size: 1rem; }
                    button { background-color: #007BFF; border: none; color: #fff; cursor: pointer; }
                    button:hover { background-color: #0056b3; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Folder Protected</h2>
                    <p>This folder is protected by a password. Please enter the password to view its contents.</p>
                    <form method="get" action="/api/folder/shareFolder.php">
                        <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
                        <label for="pass">Password:</label>
                        <input type="password" name="pass" id="pass" required>
                        <button type="submit">Submit</button>
                    </form>
                </div>
            </body>
            </html>
            <?php exit;
        }

        if (isset($data['error'])) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => $data['error']]);
            exit;
        }

        require_once PROJECT_ROOT . '/src/models/AdminModel.php';
        $adminConfig          = AdminModel::getConfig();
        $sharedMaxUploadSize  = (isset($adminConfig['sharedMaxUploadSize']) && is_numeric($adminConfig['sharedMaxUploadSize']))
            ? (int)$adminConfig['sharedMaxUploadSize'] : null;

        $folderName  = $data['folder'];
        $files       = $data['files'];
        $currentPage = $data['currentPage'];
        $totalPages  = $data['totalPages'];

        header("Content-Type: text/html; charset=utf-8"); ?>
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { background:#f2f2f2; font-family: Arial, sans-serif; padding:0 20px 20px; color:#333; }
                .header { text-align:center; margin:0 0 30px; }
                .container { max-width: 800px; margin: 0 auto; background:#fff; border-radius:4px; padding:20px; box-shadow:0 2px 12px rgba(0,0,0,.1); }
                table { width:100%; border-collapse:collapse; margin-top:20px; }
                th, td { padding:12px; border-bottom:1px solid #ddd; text-align:left; }
                th { background:#007BFF; color:#fff; }
                .pagination { text-align:center; margin-top:20px; }
                .pagination a, .pagination span { margin:0 5px; padding:8px 12px; background:#007BFF; color:#fff; border-radius:4px; text-decoration:none; }
                .pagination span.current { background:#0056b3; }
                .shared-gallery-container { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; padding:10px 0; }
                .shared-gallery-card { border:1px solid #ccc; padding:5px; text-align:center; }
                .shared-gallery-card img { max-width:100%; display:block; margin:0 auto; }
                .upload-container { margin-top:30px; text-align:center; }
                .upload-container h3 { font-size:1.4rem; margin-bottom:10px; }
                .upload-container form { display:inline-block; margin-top:10px; }
                .upload-container button { background-color:#28a745; border:none; color:#fff; padding:10px 20px; font-size:1rem; border-radius:4px; cursor:pointer; }
                .upload-container button:hover { background-color:#218838; }
                .footer { text-align:center; margin-top:40px; font-size:.9rem; color:#777; }
                .toggle-btn { background-color:#007BFF; color:#fff; border:none; border-radius:4px; padding:8px 16px; font-size:1rem; cursor:pointer; }
                .toggle-btn:hover { background-color:#0056b3; }
                .pagination a:hover { background-color:#0056b3; }
                .pagination span { cursor:default; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></h1>
            </div>
            <div class="container">
                <button id="toggleBtn" class="toggle-btn">Switch to Gallery View</button>

                <div id="listViewContainer">
                    <?php if (empty($files)): ?>
                        <p style="text-align:center;">This folder is empty.</p>
                    <?php else: ?>
                        <table>
                            <thead>
                                <tr><th>Filename</th><th>Size</th></tr>
                            </thead>
                            <tbody>
                            <?php foreach ($files as $file):
                                $safeName   = htmlspecialchars($file, ENT_QUOTES, 'UTF-8');
                                $filePath   = $data['realFolderPath'] . DIRECTORY_SEPARATOR . $file;
                                $sizeString = (is_file($filePath) ? self::formatBytes((int)@filesize($filePath)) : "Unknown");
                                $downloadLink = "/api/folder/downloadSharedFile.php?token=" . urlencode($token) . "&file=" . urlencode($file);
                            ?>
                                <tr>
                                    <td>
                                        <a href="<?php echo htmlspecialchars($downloadLink, ENT_QUOTES, 'UTF-8'); ?>">
                                            <?php echo $safeName; ?> <span class="download-icon">&#x21E9;</span>
                                        </a>
                                    </td>
                                    <td><?php echo $sizeString; ?></td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>

                <div id="galleryViewContainer" style="display:none;"></div>

                <div class="pagination">
                    <?php if ($currentPage > 1): ?>
                        <a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage - 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Prev</a>
                    <?php else: ?><span>Prev</span><?php endif; ?>

                    <?php
                    $startPage = max(1, $currentPage - 2);
                    $endPage   = min($totalPages, $currentPage + 2);
                    for ($i = $startPage; $i <= $endPage; $i++): ?>
                        <?php if ($i == $currentPage): ?>
                            <span class="current"><?php echo $i; ?></span>
                        <?php else: ?>
                            <a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $i; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>"><?php echo $i; ?></a>
                        <?php endif; ?>
                    <?php endfor; ?>

                    <?php if ($currentPage < $totalPages): ?>
                        <a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage + 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Next</a>
                    <?php else: ?><span>Next</span><?php endif; ?>
                </div>

                <?php if (isset($data['record']['allowUpload']) && (int)$data['record']['allowUpload'] === 1): ?>
                    <div class="upload-container">
                        <h3>Upload File
                            <?php if ($sharedMaxUploadSize !== null): ?>
                                (<?php echo self::formatBytes($sharedMaxUploadSize); ?> max size)
                            <?php endif; ?>
                        </h3>
                        <form action="/api/folder/uploadToSharedFolder.php" method="post" enctype="multipart/form-data">
                            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
                            <input type="file" name="fileToUpload" required>
                            <br><br>
                            <button type="submit">Upload</button>
                        </form>
                    </div>
                <?php endif; ?>
            </div>
            <div class="footer">&copy; <?php echo date("Y"); ?> FileRise. All rights reserved.</div>

            <script type="application/json" id="shared-data">
                {
                    "token": <?php echo json_encode($token, JSON_HEX_TAG); ?>,
                    "files": <?php echo json_encode($files, JSON_HEX_TAG); ?>
                }
            </script>
            <script src="/js/sharedFolderView.js" defer></script>
        </body>
        </html>
        <?php
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/folder/createShareFolderLink.php",
     *     summary="Create a share link for a folder",
     *     description="Generates a secure share link for a folder along with optional password protection and upload settings.",
     *     operationId="createShareFolderLink",
     *     tags={"Folders"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(property="expirationMinutes", type="integer", example=60),
     *             @OA\Property(property="password", type="string", example="secret"),
     *             @OA\Property(property="allowUpload", type="integer", example=1)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Share link created successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="token", type="string", example="a1b2c3d4..."),
     *             @OA\Property(property="expires", type="integer", example=1623456789),
     *             @OA\Property(property="link", type="string", example="https://yourdomain.com/api/folder/shareFolder.php?token=...")
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
     *         description="Read-only users are not allowed to create share links"
     *     )
     * )
     */
    public function createShareFolderLink(): void
{
    header('Content-Type: application/json');

    self::requireAuth();
    self::requireCsrf();
    self::requireNotReadOnly();

    $in = json_decode(file_get_contents("php://input"), true);
    if (!$in || !isset($in['folder'])) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid input."]);
        exit;
    }

    $folder      = trim($in['folder']);
    $value       = isset($in['expirationValue']) ? intval($in['expirationValue']) : 60;
    $unit        = $in['expirationUnit'] ?? 'minutes';
    $password    = $in['password'] ?? '';
    $allowUpload = intval($in['allowUpload'] ?? 0);

    // Basic folder name guard
    if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid folder name."]);
        exit;
    }

    // ---- Permissions ----
    $username = $_SESSION['username'] ?? '';
    $perms    = loadUserPermissions($username) ?: [];

    $isAdmin = !empty($perms['admin']) || !empty($perms['isAdmin']);
    $canShare = $isAdmin || ($perms['canShare'] ?? (defined('DEFAULT_CAN_SHARE') ? DEFAULT_CAN_SHARE : true));
    if (!$canShare) {
        http_response_code(403);
        echo json_encode(["error" => "Sharing is not permitted for your account."]);
        exit;
    }

    // Folder-only scope: non-admins must stay inside their subtree and cannot share root
    $folderOnly = !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
    if (!$isAdmin && strcasecmp($folder, 'root') === 0) {
        http_response_code(403);
        echo json_encode(["error" => "Only admins may share the root folder."]);
        exit;
    }
    if (!$isAdmin && $folderOnly && $folder !== 'root') {
        if ($folder !== $username && strpos($folder, $username . '/') !== 0) {
            http_response_code(403);
            echo json_encode(["error" => "Forbidden: folder scope violation."]);
            exit;
        }
    }

    // Ownership check unless bypassOwnership
    $ignoreOwnership = $isAdmin || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
    if (!$ignoreOwnership) {
        // Only checks top-level files (sharing UI lists top-level files only)
        $metaFile = (strcasecmp($folder, 'root') === 0)
            ? META_DIR . 'root_metadata.json'
            : META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';

        $meta = (is_file($metaFile) ? json_decode(@file_get_contents($metaFile), true) : []) ?: [];
        foreach ($meta as $fname => $m) {
            if (($m['uploader'] ?? null) !== $username) {
                http_response_code(403);
                echo json_encode(["error" => "Forbidden: you don't own all files in this folder."]);
                exit;
            }
        }
    }

    // If user is not allowed to upload generally, block share-with-upload
    if ($allowUpload === 1 && !empty($perms['disableUpload']) && !$isAdmin) {
        http_response_code(403);
        echo json_encode(["error" => "You cannot enable uploads on shared folders."]);
        exit;
    }

    // Expiration seconds (cap at 1 year)
    if ($value < 1) $value = 1;
    switch ($unit) {
        case 'seconds': $seconds = $value; break;
        case 'hours':   $seconds = $value * 3600; break;
        case 'days':    $seconds = $value * 86400; break;
        case 'minutes':
        default:        $seconds = $value * 60; break;
    }
    $seconds = min($seconds, 31536000);

    // Create share link
    $res = FolderModel::createShareFolderLink($folder, $seconds, $password, $allowUpload);
    echo json_encode($res);
    exit;
}

    /**
     * @OA\Get(
     *     path="/api/folder/downloadSharedFile.php",
     *     summary="Download a file from a shared folder",
     *     description="Retrieves and serves a file from a shared folder based on a share token.",
     *     operationId="downloadSharedFile",
     *     tags={"Folders"},
     *     @OA\Parameter(
     *         name="token",
     *         in="query",
     *         description="The share folder token",
     *         required=true,
     *         @OA\Schema(type="string")
     *     ),
     *     @OA\Parameter(
     *         name="file",
     *         in="query",
     *         description="The filename to download",
     *         required=true,
     *         @OA\Schema(type="string")
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File served successfully",
     *         @OA\MediaType(mediaType="application/octet-stream")
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (missing parameters, invalid file name, etc.)"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Access forbidden (e.g., expired share link)"
     *     ),
     *     @OA\Response(
     *         response=404,
     *         description="File not found"
     *     )
     * )
     */
    public function downloadSharedFile(): void
    {
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $file  = filter_input(INPUT_GET, 'file', FILTER_SANITIZE_STRING);

        if (empty($token) || empty($file)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token or file parameter."]);
            exit;
        }

        // Extra safety: enforce filename policy before delegating
        $basename = basename($file);
        if (!preg_match(REGEX_FILE_NAME, $basename)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }

        $result = FolderModel::getSharedFileInfo($token, $basename);
        if (isset($result['error'])) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => $result['error']]);
            exit;
        }

        $realFilePath = $result['realFilePath'];
        $mimeType     = $result['mimeType'];

        header('X-Content-Type-Options: nosniff');
        header("Content-Type: " . $mimeType);
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
            header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
        } else {
            header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
        }
        $size = @filesize($realFilePath);
        if (is_int($size)) header('Content-Length: ' . $size);
        readfile($realFilePath);
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/folder/uploadToSharedFolder.php",
     *     summary="Upload a file to a shared folder",
     *     description="Handles file upload to a shared folder using a share token. Validates file size, extension, and uploads the file to the shared folder, updating metadata accordingly.",
     *     operationId="uploadToSharedFolder",
     *     tags={"Folders"},
     *     @OA\RequestBody(
     *         required=true,
     *         description="Multipart form data containing the share token and file to upload.",
     *         @OA\MediaType(
     *             mediaType="multipart/form-data",
     *             @OA\Schema(
     *                 required={"token", "fileToUpload"},
     *                 @OA\Property(property="token", type="string"),
     *                 @OA\Property(property="fileToUpload", type="string", format="binary")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=302,
     *         description="Redirects to the shared folder page on success."
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (missing token, file upload error, file type/size not allowed)"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Forbidden (share link expired or uploads not allowed)"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error during file move"
     *     )
     * )
     */
    public function uploadToSharedFolder(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Method not allowed."]);
            exit;
        }

        if (empty($_POST['token'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing share token."]);
            exit;
        }
        $token = trim($_POST['token']);

        if (!isset($_FILES['fileToUpload'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "No file was uploaded."]);
            exit;
        }
        $fileUpload = $_FILES['fileToUpload'];

        // Quick surface error mapping
        if (!empty($fileUpload['error']) && $fileUpload['error'] !== UPLOAD_ERR_OK) {
            $map = [
                UPLOAD_ERR_INI_SIZE   => 'The uploaded file exceeds the upload_max_filesize directive.',
                UPLOAD_ERR_FORM_SIZE  => 'The uploaded file exceeds the MAX_FILE_SIZE directive that was specified in the HTML form.',
                UPLOAD_ERR_PARTIAL    => 'The uploaded file was only partially uploaded.',
                UPLOAD_ERR_NO_FILE    => 'No file was uploaded.',
                UPLOAD_ERR_NO_TMP_DIR => 'Missing a temporary folder.',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
                UPLOAD_ERR_EXTENSION  => 'A PHP extension stopped the file upload.'
            ];
            $msg = $map[$fileUpload['error']] ?? 'Upload error.';
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => $msg]);
            exit;
        }

        $result = FolderModel::uploadToSharedFolder($token, $fileUpload);
        if (isset($result['error'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode($result);
            exit;
        }

        $_SESSION['upload_message'] = "File uploaded successfully.";
        $redirectUrl = "/api/folder/shareFolder.php?token=" . urlencode($token);
        header("Location: " . $redirectUrl);
        exit;
    }

    /**
     * GET /api/folder/getShareFolderLinks.php
     */
    public function getAllShareFolderLinks(): void
    {
        header('Content-Type: application/json');
        self::requireAuth();
        self::requireAdmin(); // exposing all share folder links is an admin operation

        $shareFile = META_DIR . 'share_folder_links.json';
        $links     = file_exists($shareFile)
            ? json_decode(file_get_contents($shareFile), true) ?? []
            : [];
        $now       = time();
        $cleaned   = [];

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
     * POST /api/folder/deleteShareFolderLink.php
     */
    public function deleteShareFolderLink()
    {
        header('Content-Type: application/json');
        self::requireAuth();
        self::requireAdmin();
        self::requireCsrf();

        $token = $_POST['token'] ?? '';
        if (!$token) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No token provided']);
            return;
        }

        $deleted = FolderModel::deleteShareFolderLink($token);
        if ($deleted) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Not found']);
        }
    }
}
