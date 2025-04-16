<?php
// src/controllers/fileController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FileModel.php';

class FileController {
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
    public function copyFiles() {
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
        $userPermissions = loadUserPermissions($username);
        if (!empty($userPermissions['readOnly'])) {
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
    public function deleteFiles() {
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
        $userPermissions = loadUserPermissions($username);
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
    public function moveFiles() {
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
        $userPermissions = loadUserPermissions($username);
        if (!empty($userPermissions['readOnly'])) {
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
    public function renameFile() {
        header('Content-Type: application/json');
        header("Cache-Control: no-cache, no-store, must-revalidate");
        header("Pragma: no-cache");
        header("Expires: 0");
        
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
        
        // Verify user permissions.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to rename files."]);
            exit;
        }
        
        // Get JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data || !isset($data['folder']) || !isset($data['oldName']) || !isset($data['newName'])) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input"]);
            exit;
        }
        
        $folder = trim($data['folder']) ?: 'root';
        // Validate folder: allow letters, numbers, underscores, dashes, spaces, and forward slashes.
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            echo json_encode(["error" => "Invalid folder name"]);
            exit;
        }
        
        $oldName = basename(trim($data['oldName']));
        $newName = basename(trim($data['newName']));
        
        // Validate file names.
        if (!preg_match(REGEX_FILE_NAME, $oldName) || !preg_match(REGEX_FILE_NAME, $newName)) {
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }
        
        // Delegate the renaming operation to the model.
        $result = FileModel::renameFile($folder, $oldName, $newName);
        echo json_encode($result);
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
    public function saveFile() {
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
        
        // Check if the user is allowed to save files (not read-only).
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            echo json_encode(["error" => "Read-only users are not allowed to save files."]);
            exit;
        }
        
        // Get JSON input.
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (!$data) {
            echo json_encode(["error" => "No data received"]);
            exit;
        }
        
        if (!isset($data["fileName"]) || !isset($data["content"])) {
            echo json_encode(["error" => "Invalid request data", "received" => $data]);
            exit;
        }
        
        $fileName = basename($data["fileName"]);
        // Determine the folder. Default to "root" if not provided.
        $folder = isset($data["folder"]) ? trim($data["folder"]) : "root";
        
        // Validate folder if not root.
        if (strtolower($folder) !== "root" && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            echo json_encode(["error" => "Invalid folder name"]);
            exit;
        }
        
        $folder = trim($folder, "/\\ ");
        
        // Delegate to the model.
        $result = FileModel::saveFile($folder, $fileName, $data["content"]);
        echo json_encode($result);
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
    public function downloadFile() {
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
        
        // Retrieve download info from the model.
        $downloadInfo = FileModel::getDownloadInfo($folder, $file);
        if (isset($downloadInfo['error'])) {
            http_response_code( (in_array($downloadInfo['error'], ["File not found.", "Access forbidden."])) ? 404 : 400 );
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
    public function downloadZip() {
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
    public function extractZip() {
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
    public function shareFile() {
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
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
                <form method="get" action="api/file/share.php">
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
        if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
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
     *     description="Generates a secure share link token for a specific file with an optional password protection and expiration time.",
     *     operationId="createShareLink",
     *     tags={"Files"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder", "file"},
     *             @OA\Property(property="folder", type="string", example="Documents"),
     *             @OA\Property(property="file", type="string", example="report.pdf"),
     *             @OA\Property(property="expirationMinutes", type="integer", example=60),
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
    public function createShareLink() {
        header('Content-Type: application/json');
        
        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }
        
        // Check user permissions.
        $username = $_SESSION['username'] ?? '';
        $userPermissions = loadUserPermissions($username);
        if ($username && isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
            http_response_code(403);
            echo json_encode(["error" => "Read-only users are not allowed to create share links."]);
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
        $file = isset($input['file']) ? basename($input['file']) : "";
        $expirationMinutes = isset($input['expirationMinutes']) ? intval($input['expirationMinutes']) : 60;
        $password = isset($input['password']) ? $input['password'] : "";
        
        // Validate folder.
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }
        
        // Delegate share link creation to the model.
        $result = FileModel::createShareLink($folder, $file, $expirationMinutes, $password);
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
    public function getTrashItems() {
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
    public function restoreFiles() {
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
    public function deleteTrashFiles() {
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
        echo json_encode($result);
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
    public function getFileTags(): void {
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
    public function saveFileTag(): void {
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
        $userPermissions = loadUserPermissions($username);
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
    public function getFileList(): void {
        header('Content-Type: application/json');
        
        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }
        
        // Retrieve the folder from GET; default to "root".
        $folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }
        
        // Delegate to the model.
        $result = FileModel::getFileList($folder);
        if (isset($result['error'])) {
            http_response_code(400);
        }
        echo json_encode($result);
        exit;
    }
}