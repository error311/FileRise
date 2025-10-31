<?php
// src/controllers/UploadController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/UploadModel.php';

class UploadController {

    public function handleUpload(): void {
        header('Content-Type: application/json');
    
        // ---- 1) CSRF (header or form field) ----
        $headersArr = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
        $received = '';
        if (!empty($headersArr['x-csrf-token'])) {
            $received = trim($headersArr['x-csrf-token']);
        } elseif (!empty($_POST['csrf_token'])) {
            $received = trim($_POST['csrf_token']);
        } elseif (!empty($_POST['upload_token'])) {
            // legacy alias
            $received = trim($_POST['upload_token']);
        }
    
        if (!isset($_SESSION['csrf_token']) || $received !== $_SESSION['csrf_token']) {
            // Soft-fail so client can retry with refreshed token
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            http_response_code(200);
            echo json_encode([
                'csrf_expired' => true,
                'csrf_token'   => $_SESSION['csrf_token']
            ]);
            return;
        }
    
        // ---- 2) Auth + account-level flags ----
        if (empty($_SESSION['authenticated'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
    
        $username  = (string)($_SESSION['username'] ?? '');
        $userPerms = loadUserPermissions($username) ?: [];
        $isAdmin   = ACL::isAdmin($userPerms);
    
        // Admins should never be blocked by account-level "disableUpload"
        if (!$isAdmin && !empty($userPerms['disableUpload'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Upload disabled for this user.']);
            return;
        }
    
        // ---- 3) Folder-level WRITE permission (ACL) ----
    // Always require client to send the folder; fall back to GET if needed.
    $folderParam = isset($_POST['folder'])
        ? (string)$_POST['folder']
        : (isset($_GET['folder']) ? (string)$_GET['folder'] : 'root');

    // Decode %xx (e.g., "test%20folder") then normalize
    $folderParam  = rawurldecode($folderParam);
    $targetFolder = ACL::normalizeFolder($folderParam);

    // Admins bypass folder canWrite checks
    $username  = (string)($_SESSION['username'] ?? '');
    $userPerms = loadUserPermissions($username) ?: [];
    $isAdmin   = ACL::isAdmin($userPerms);

    if (!$isAdmin && !ACL::canUpload($username, $userPerms, $targetFolder)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden: no write access to folder "'.$targetFolder.'".']);
        return;
    }

    // ---- 4) Delegate to model (force the sanitized folder) ----
    $_POST['folder'] = $targetFolder; // in case model reads superglobal
    $post = $_POST;
    $post['folder'] = $targetFolder;

    $result = UploadModel::handleUpload($post, $_FILES);

    // ---- 5) Response (unchanged) ----
    if (isset($result['error'])) {
        http_response_code(400);
        echo json_encode($result);
        return;
    }
    if (isset($result['status'])) {
        echo json_encode($result);
        return;
    }

    echo json_encode([
        'success'     => 'File uploaded successfully',
        'newFilename' => $result['newFilename'] ?? null
    ]);
}
    
    public function removeChunks(): void {
    header('Content-Type: application/json');

    $receivedToken = isset($_POST['csrf_token']) ? trim($_POST['csrf_token']) : '';
    if ($receivedToken !== ($_SESSION['csrf_token'] ?? '')) {
        http_response_code(403);
        echo json_encode(['error' => 'Invalid CSRF token']);
        return;
    }

    if (!isset($_POST['folder'])) {
        http_response_code(400);
        echo json_encode(['error' => 'No folder specified']);
        return;
    }

    $folderRaw = (string)$_POST['folder'];
    $folder    = ACL::normalizeFolder(rawurldecode($folderRaw));

    echo json_encode(UploadModel::removeChunks($folder));
}
}