<?php
// src/controllers/UploadController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/UploadModel.php';

class UploadController {

    /**
     * @OA\Post(
     *     path="/api/upload/upload.php",
     *     summary="Handle file upload",
     *     description="Handles file uploads for both chunked and non-chunked (full) uploads. Validates CSRF, user authentication, and permissions, and processes file uploads accordingly. On success, returns a JSON status for chunked uploads or redirects for full uploads.",
     *     operationId="handleUpload",
     *     tags={"Uploads"},
     *     @OA\RequestBody(
     *         required=true,
     *         description="Multipart form data for file upload. For chunked uploads, include fields like 'resumableChunkNumber', 'resumableTotalChunks', 'resumableIdentifier', 'resumableFilename', etc.",
     *         @OA\MediaType(
     *             mediaType="multipart/form-data",
     *             @OA\Schema(
     *                 required={"token", "fileToUpload"},
     *                 @OA\Property(property="token", type="string", description="Share token or upload token."),
     *                 @OA\Property(
     *                     property="fileToUpload",
     *                     type="string",
     *                     format="binary",
     *                     description="The file to upload."
     *                 ),
     *                 @OA\Property(property="resumableChunkNumber", type="integer", description="Chunk number for chunked uploads."),
     *                 @OA\Property(property="resumableTotalChunks", type="integer", description="Total number of chunks."),
     *                 @OA\Property(property="resumableFilename", type="string", description="Original filename."),
     *                 @OA\Property(property="folder", type="string", description="Target folder (default 'root').")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="File uploaded successfully (or chunk uploaded status).",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="success", type="string", example="File uploaded successfully"),
     *             @OA\Property(property="newFilename", type="string", example="5f2d7c123a_example.png"),
     *             @OA\Property(property="status", type="string", example="chunk uploaded")
     *         )
     *     ),
     *     @OA\Response(
     *         response=302,
     *         description="Redirection on full upload success."
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., missing file, invalid parameters)"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Forbidden (e.g., invalid CSRF token, upload disabled)"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error during file processing"
     *     )
     * )
     *
     * Handles file uploads, both chunked and full, and redirects upon success.
     *
     * @return void Outputs JSON response (for chunked uploads) or redirects on successful full upload.
     */
    public function handleUpload(): void {
        header('Content-Type: application/json');
  
        //
        // 1) CSRF – pull from header or POST fields
        //
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $received = '';
        if (!empty($headersArr['x-csrf-token'])) {
            $received = trim($headersArr['x-csrf-token']);
        } elseif (!empty($_POST['csrf_token'])) {
            $received = trim($_POST['csrf_token']);
        } elseif (!empty($_POST['upload_token'])) {
            $received = trim($_POST['upload_token']);
        }
    
        // 1a) If it doesn’t match, soft-fail: send new token and let client retry
        if (!isset($_SESSION['csrf_token']) || $received !== $_SESSION['csrf_token']) {
            // regenerate
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            // tell client “please retry with this new token”
            http_response_code(200);
            echo json_encode([
              'csrf_expired' => true,
              'csrf_token'   => $_SESSION['csrf_token']
            ]);
            exit;
        }
    
        //
        // 2) Auth checks
        //
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }
        $userPerms = loadUserPermissions($_SESSION['username']);
        if (!empty($userPerms['disableUpload'])) {
            http_response_code(403);
            echo json_encode(["error" => "Upload disabled for this user."]);
            exit;
        }
    
        //
        // 3) Delegate the actual file handling
        //
        $result = UploadModel::handleUpload($_POST, $_FILES);
    
        //
        // 4) Respond
        //
        if (isset($result['error'])) {
            http_response_code(400);
            echo json_encode($result);
            exit;
        }
        if (isset($result['status'])) {
            echo json_encode($result);
            exit;
        }
    
        // full‐upload redirect
        $_SESSION['upload_message'] = "File uploaded successfully.";
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/upload/removeChunks.php",
     *     summary="Remove chunked upload temporary directory",
     *     description="Removes the temporary directory used for chunked uploads, given a folder name matching the expected resumable pattern.",
     *     operationId="removeChunks",
     *     tags={"Uploads"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"folder"},
     *             @OA\Property(property="folder", type="string", example="resumable_myupload123")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Temporary folder removed successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true),
     *             @OA\Property(property="message", type="string", example="Temporary folder removed.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid input (e.g., missing folder or invalid folder name)"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     )
     * )
     *
     * Removes the temporary upload folder for chunked uploads.
     *
     * @return void Outputs a JSON response.
     */
    public function removeChunks(): void {
        header('Content-Type: application/json');
        
        // CSRF Protection: Validate token from POST data.
        $receivedToken = isset($_POST['csrf_token']) ? trim($_POST['csrf_token']) : '';
        if ($receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }
        
        // Check that the folder parameter is provided.
        if (!isset($_POST['folder'])) {
            http_response_code(400);
            echo json_encode(["error" => "No folder specified"]);
            exit;
        }
        
        $folder = $_POST['folder'];
        $result = UploadModel::removeChunks($folder);
        echo json_encode($result);
        exit;
    }
}