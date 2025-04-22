<?php
// src/controllers/folderController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

class FolderController
{
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
     *
     * Creates a new folder in the upload directory, optionally under a parent folder.
     *
     * @return void Outputs a JSON response.
     */
    public function createFolder(): void
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Ensure the request method is POST.
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['error' => 'Invalid request method.']);
            exit;
        }

        // CSRF check.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = $headersArr['x-csrf-token'] ?? '';
        if (!isset($_SESSION['csrf_token']) || trim($receivedToken) !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid CSRF token.']);
            exit;
        }

        // Check permissions.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to create folders."]);
            exit;
        }

        // Get and decode JSON input.
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['folderName'])) {
            echo json_encode(['error' => 'Folder name not provided.']);
            exit;
        }

        $folderName = trim($input['folderName']);
        $parent = isset($input['parent']) ? trim($input['parent']) : "";

        // Basic sanitation for folderName.
        if (!preg_match(REGEX_FOLDER_NAME, $folderName)) {
            echo json_encode(['error' => 'Invalid folder name.']);
            exit;
        }

        // Optionally sanitize the parent.
        if ($parent && !preg_match(REGEX_FOLDER_NAME, $parent)) {
            echo json_encode(['error' => 'Invalid parent folder name.']);
            exit;
        }

        // Delegate to FolderModel.
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
     *
     * Deletes a folder if it is empty and not the root folder.
     *
     * @return void Outputs a JSON response.
     */
    public function deleteFolder(): void
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Ensure the request is a POST.
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(["error" => "Invalid request method."]);
            exit;
        }

        // CSRF Protection.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token."]);
            exit;
        }

        // Check user permissions.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to delete folders."]);
            exit;
        }

        // Get and decode JSON input.
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['folder'])) {
            echo json_encode(["error" => "Folder name not provided."]);
            exit;
        }

        $folder = trim($input['folder']);
        // Prevent deletion of the root folder.
        if (strtolower($folder) === 'root') {
            echo json_encode(["error" => "Cannot delete root folder."]);
            exit;
        }

        // Delegate to the model.
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
     *
     * Renames a folder by validating inputs and delegating to the model.
     *
     * @return void Outputs a JSON response.
     */
    public function renameFolder(): void
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Ensure the request method is POST.
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['error' => 'Invalid request method.']);
            exit;
        }

        // CSRF Protection.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token."]);
            exit;
        }

        // Check that the user is not read-only.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to rename folders."]);
            exit;
        }

        // Get JSON input.
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['oldFolder']) || !isset($input['newFolder'])) {
            echo json_encode(['error' => 'Required folder names not provided.']);
            exit;
        }

        $oldFolder = trim($input['oldFolder']);
        $newFolder = trim($input['newFolder']);

        // Validate folder names.
        if (!preg_match(REGEX_FOLDER_NAME, $oldFolder) || !preg_match(REGEX_FOLDER_NAME, $newFolder)) {
            echo json_encode(['error' => 'Invalid folder name(s).']);
            exit;
        }

        // Delegate to the model.
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
     *
     * Retrieves the folder list and associated metadata.
     *
     * @return void Outputs JSON response.
     */
    public function getFolderList(): void
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Optionally, you might add further input validation if necessary.
        $folderList = FolderModel::getFolderList();
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
     *
     * Displays a shared folder with file listings, pagination, and an upload container if allowed.
     *
     * @return void Outputs HTML content.
     */

     function formatBytes($bytes)
     {
         if ($bytes < 1024) {
             return $bytes . " B";
         } elseif ($bytes < 1024 * 1024) {
             return round($bytes / 1024, 2) . " KB";
         } elseif ($bytes < 1024 * 1024 * 1024) {
             return round($bytes / (1024 * 1024), 2) . " MB";
         } else {
             return round($bytes / (1024 * 1024 * 1024), 2) . " GB";
         }
     }
     
    public function shareFolder(): void
    {
        // Retrieve GET parameters.
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);
        $page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
        if ($page === false || $page < 1) {
            $page = 1;
        }

        if (empty($token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token."]);
            exit;
        }

        // Delegate to the model.
        $data = FolderModel::getSharedFolderData($token, $providedPass, $page);

        // If a password is needed, output an HTML form.
        if (isset($data['needs_password']) && $data['needs_password'] === true) {
            header("Content-Type: text/html; charset=utf-8");
?>
            <!DOCTYPE html>
            <html lang="en">

            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Enter Password</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        background-color: #f7f7f7;
                    }

                    .container {
                        max-width: 400px;
                        margin: 80px auto;
                        background: #fff;
                        padding: 20px;
                        border-radius: 4px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    }

                    input[type="password"],
                    button {
                        width: 100%;
                        padding: 10px;
                        margin: 10px 0;
                        font-size: 1rem;
                    }

                    button {
                        background-color: #007BFF;
                        border: none;
                        color: #fff;
                        cursor: pointer;
                    }

                    button:hover {
                        background-color: #0056b3;
                    }
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
        <?php
            exit;
        }

        // If the model returned an error, output JSON error.
        if (isset($data['error'])) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => $data['error']]);
            exit;
        }

        // Load admin config so we can pull the sharedMaxUploadSize
        require_once PROJECT_ROOT . '/src/models/AdminModel.php';
        $adminConfig        = AdminModel::getConfig();
        $sharedMaxUploadSize = isset($adminConfig['sharedMaxUploadSize']) && is_numeric($adminConfig['sharedMaxUploadSize'])
            ? (int)$adminConfig['sharedMaxUploadSize']
            : null;

        // For human‐readable formatting
        function formatBytes($bytes)
        {
            if ($bytes < 1024) {
                return $bytes . " B";
            } elseif ($bytes < 1024 * 1024) {
                return round($bytes / 1024, 2) . " KB";
            } elseif ($bytes < 1024 * 1024 * 1024) {
                return round($bytes / (1024 * 1024), 2) . " MB";
            } else {
                return round($bytes / (1024 * 1024 * 1024), 2) . " GB";
            }
        }

        // Extract data for the HTML view.
        $folderName = $data['folder'];
        $files = $data['files'];
        $currentPage = $data['currentPage'];
        $totalPages = $data['totalPages'];

        // Build the HTML view.
        header("Content-Type: text/html; charset=utf-8");
        ?>
        <!DOCTYPE html>
        <html lang="en">

        <head>
            <meta charset="UTF-8">
            <title>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    background: #f2f2f2;
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    color: #333;
                }

                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }

                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: #fff;
                    border-radius: 4px;
                    padding: 20px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }

                th,
                td {
                    padding: 12px;
                    border-bottom: 1px solid #ddd;
                    text-align: left;
                }

                th {
                    background: #007BFF;
                    color: #fff;
                }

                .pagination {
                    text-align: center;
                    margin-top: 20px;
                }

                .pagination a,
                .pagination span {
                    margin: 0 5px;
                    padding: 8px 12px;
                    background: #007BFF;
                    color: #fff;
                    border-radius: 4px;
                    text-decoration: none;
                }

                .pagination span.current {
                    background: #0056b3;
                }

                /* Gallery view styles if needed */
                .shared-gallery-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                    padding: 10px 0;
                }

                .shared-gallery-card {
                    border: 1px solid #ccc;
                    padding: 5px;
                    text-align: center;
                }

                .shared-gallery-card img {
                    max-width: 100%;
                    display: block;
                    margin: 0 auto;
                }

                /* Upload container */
                .upload-container {
                    margin-top: 30px;
                    text-align: center;
                }

                .upload-container h3 {
                    font-size: 1.4rem;
                    margin-bottom: 10px;
                }

                .upload-container form {
                    display: inline-block;
                    margin-top: 10px;
                }

                .upload-container button {
                    background-color: #28a745;
                    border: none;
                    color: #fff;
                    padding: 10px 20px;
                    font-size: 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .upload-container button:hover {
                    background-color: #218838;
                }

                .footer {
                    text-align: center;
                    margin-top: 40px;
                    font-size: 0.9rem;
                    color: #777;
                }
            </style>
        </head>

        <body>
            <div class="header">
                <h1>Shared Folder: <?php echo htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8'); ?></h1>
            </div>
            <div class="container">
                <!-- Toggle Button -->
                <button id="toggleBtn" class="toggle-btn" onclick="toggleViewMode()">Switch to Gallery View</button>

                <!-- List View Container -->
                <div id="listViewContainer">
                    <?php if (empty($files)): ?>
                        <p style="text-align:center;">This folder is empty.</p>
                    <?php else: ?>
                        <table>
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php
                                // For each file, build a download link using your downloadSharedFile endpoint.
                                foreach ($files as $file):
                                    $filePath = $data['realFolderPath'] . DIRECTORY_SEPARATOR . $file;
                                    $fileSize = file_exists($filePath) ? formatBytes(filesize($filePath)) : "Unknown";
                                    $downloadLink = "/api/folder/downloadSharedFile.php?token=" . urlencode($token) . "&file=" . urlencode($file);
                                ?>
                                    <tr>
                                        <td>
                                            <a href="<?php echo htmlspecialchars($downloadLink, ENT_QUOTES, 'UTF-8'); ?>">
                                                <?php echo htmlspecialchars($file, ENT_QUOTES, 'UTF-8'); ?>
                                                <span class="download-icon">&#x21E9;</span>
                                            </a>
                                        </td>
                                        <td><?php echo $fileSize; ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>

                <!-- Gallery View Container (hidden by default) -->
                <div id="galleryViewContainer" style="display:none;"></div>

                <!-- Pagination Controls -->
                <div class="pagination">
                    <?php if ($currentPage > 1): ?>
                        <a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage - 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Prev</a>
                    <?php else: ?>
                        <span>Prev</span>
                    <?php endif; ?>

                    <?php
                    $startPage = max(1, $currentPage - 2);
                    $endPage = min($totalPages, $currentPage + 2);
                    for ($i = $startPage; $i <= $endPage; $i++): ?>
                        <?php if ($i == $currentPage): ?>
                            <span class="current"><?php echo $i; ?></span>
                        <?php else: ?>
                            <a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $i; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>"><?php echo $i; ?></a>
                        <?php endif; ?>
                    <?php endfor; ?>

                    <?php if ($currentPage < $totalPages): ?>
                        <a href="/api/folder/shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage + 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Next</a>
                    <?php else: ?>
                        <span>Next</span>
                    <?php endif; ?>
                </div>

                <!-- Upload Container (if uploads are allowed by the share record) -->
                <?php if (isset($data['record']['allowUpload']) && $data['record']['allowUpload'] == 1): ?>
                    <div class="upload-container">
                        <h3>Upload File
                            <?php if ($sharedMaxUploadSize !== null): ?>
                                (<?php echo formatBytes($sharedMaxUploadSize); ?> max size)
                            <?php endif; ?>
                        </h3>
                        <form action="/api/folder/uploadToSharedFolder.php" method="post" enctype="multipart/form-data">
                            <!-- Pass the share token so the upload endpoint can verify -->
                            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
                            <input type="file" name="fileToUpload" required>
                            <br><br>
                            <button type="submit">Upload</button>
                        </form>
                    </div>
                <?php endif; ?>
            </div>
            <div class="footer">
                &copy; <?php echo date("Y"); ?> FileRise. All rights reserved.
            </div>

            <script>
                // (Optional) JavaScript for toggling view modes (list/gallery).
                var viewMode = 'list';
                window.imageCache = window.imageCache || {};
                var filesData = <?php echo json_encode($files); ?>;

                // Use the shared‑folder relative path (from your model), not realFolderPath
                // $data['folder'] should be something like "eafwef/testfolder2/test/new folder two"
                var rawRelPath = "<?php echo addslashes($data['folder']); ?>";
                // Split into segments, encode each segment, then re-join
                var folderSegments = rawRelPath
                    .split('/')
                    .map(encodeURIComponent)
                    .join('/');

                function renderGalleryView() {
                    var galleryContainer = document.getElementById("galleryViewContainer");
                    var html = '<div class="shared-gallery-container">';
                    filesData.forEach(function(file) {
                        // Encode the filename too
                        var fileName = encodeURIComponent(file);
                        var fileUrl = window.location.origin +
                            '/uploads/' +
                            folderSegments +
                            '/' +
                            fileName +
                            '?t=' +
                            Date.now();

                        var ext = file.split('.').pop().toLowerCase();
                        var thumbnail;
                        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].indexOf(ext) >= 0) {
                            thumbnail = '<img src="' + fileUrl + '" alt="' + file + '">';
                        } else {
                            thumbnail = '<span class="material-icons">insert_drive_file</span>';
                        }

                        html +=
                            '<div class="shared-gallery-card">' +
                            '<div class="gallery-preview" ' +
                            'onclick="window.location.href=\'' + fileUrl + '\'" ' +
                            'style="cursor:pointer;">' +
                            thumbnail +
                            '</div>' +
                            '<div class="gallery-info">' +
                            '<span class="gallery-file-name">' + file + '</span>' +
                            '</div>' +
                            '</div>';
                    });
                    html += '</div>';
                    galleryContainer.innerHTML = html;
                }

                function toggleViewMode() {
                    if (viewMode === 'list') {
                        viewMode = 'gallery';
                        document.getElementById("listViewContainer").style.display = "none";
                        renderGalleryView();
                        document.getElementById("galleryViewContainer").style.display = "block";
                        document.getElementById("toggleBtn").textContent = "Switch to List View";
                    } else {
                        viewMode = 'list';
                        document.getElementById("galleryViewContainer").style.display = "none";
                        document.getElementById("listViewContainer").style.display = "block";
                        document.getElementById("toggleBtn").textContent = "Switch to Gallery View";
                    }
                }
            </script>
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
     *
     * Creates a share link for a folder by validating input and delegating to the FolderModel.
     *
     * @return void Outputs a JSON response.
     */
    public function createShareFolderLink(): void
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Check that the user is not read-only.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            http_response_code(403);
            echo json_encode(["error" => "Read-only users are not allowed to create share folders."]);
            exit;
        }

        // Retrieve and decode POST input.
        $input = json_decode(file_get_contents("php://input"), true);
        if (!$input || !isset($input['folder'])) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input."]);
            exit;
        }

        $folder = trim($input['folder']);
        $expirationMinutes = isset($input['expirationMinutes']) ? intval($input['expirationMinutes']) : 60;
        $password = isset($input['password']) ? $input['password'] : "";
        $allowUpload = isset($input['allowUpload']) ? intval($input['allowUpload']) : 0;

        // Delegate to the model.
        $result = FolderModel::createShareFolderLink($folder, $expirationMinutes, $password, $allowUpload);
        echo json_encode($result);
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
     *
     * Downloads a file from a shared folder based on a token.
     *
     * @return void Outputs the file with proper headers.
     */
    public function downloadSharedFile(): void
    {
        // Retrieve and sanitize GET parameters.
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $file = filter_input(INPUT_GET, 'file', FILTER_SANITIZE_STRING);

        if (empty($token) || empty($file)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token or file parameter."]);
            exit;
        }

        // Delegate to the model.
        $result = FolderModel::getSharedFileInfo($token, $file);
        if (isset($result['error'])) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => $result['error']]);
            exit;
        }

        $realFilePath = $result['realFilePath'];
        $mimeType = $result['mimeType'];

        // Serve the file.
        header("Content-Type: " . $mimeType);
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'])) {
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
     *
     * Handles uploading a file to a shared folder.
     *
     * @return void Redirects upon successful upload or outputs JSON errors.
     */
    public function uploadToSharedFolder(): void
    {
        // Ensure request is POST.
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Method not allowed."]);
            exit;
        }

        // Ensure the share token is provided.
        if (empty($_POST['token'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing share token."]);
            exit;
        }
        $token = trim($_POST['token']);

        // Delegate the upload to the model.
        if (!isset($_FILES['fileToUpload'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "No file was uploaded."]);
            exit;
        }
        $fileUpload = $_FILES['fileToUpload'];

        $result = FolderModel::uploadToSharedFolder($token, $fileUpload);
        if (isset($result['error'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode($result);
            exit;
        }

        // Optionally, set a flash message in session.
        $_SESSION['upload_message'] = "File uploaded successfully.";

        // Redirect back to the shared folder view.
        $redirectUrl = "/api/folder/shareFolder.php?token=" . urlencode($token);
        header("Location: " . $redirectUrl);
        exit;
    }
}
