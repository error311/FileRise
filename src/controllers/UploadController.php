<?php
// src/controllers/UploadController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/UploadModel.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class UploadController
{
    public function handleUpload(): void
    {
        header('Content-Type: application/json');

        $method         = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $requestParams  = ($method === 'GET') ? $_GET : array_merge($_GET, $_POST);

        // Detect Resumable.js chunk "test" requests (testChunks=true, default GET)
        $isResumableTest =
            ($method === 'GET'
             && isset($requestParams['resumableChunkNumber'])
             && isset($requestParams['resumableIdentifier']));

        // ---- 1) CSRF (skip for resumable GET tests – Resumable only cares about HTTP status) ----
        if (!$isResumableTest) {
            $headersArr = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
            $received   = '';

            if (!empty($headersArr['x-csrf-token'])) {
                $received = trim($headersArr['x-csrf-token']);
            } elseif (!empty($requestParams['csrf_token'])) {
                $received = trim((string)$requestParams['csrf_token']);
            } elseif (!empty($requestParams['upload_token'])) {
                // legacy alias
                $received = trim((string)$requestParams['upload_token']);
            }

            if (!isset($_SESSION['csrf_token']) || $received !== $_SESSION['csrf_token']) {
                // Soft-fail so client can retry with refreshed token
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
                http_response_code(200);
                echo json_encode([
                    'csrf_expired' => true,
                    'csrf_token'   => $_SESSION['csrf_token'],
                ]);
                return;
            }
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

        $sourceId = trim((string)($requestParams['sourceId'] ?? ($_GET['sourceId'] ?? '')));
        if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid source id.']);
                return;
            }
            $info = SourceContext::getSourceById($sourceId);
            if (!$info) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid source.']);
                return;
            }
            if (empty($info['enabled']) && !$isAdmin) {
                http_response_code(403);
                echo json_encode(['error' => 'Source is disabled.']);
                return;
            }
            SourceContext::setActiveId($sourceId, false, $isAdmin);
        }

        if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
            http_response_code(403);
            echo json_encode(['error' => 'Source is read-only.']);
            return;
        }

        // ---- 3) Folder-level WRITE permission (ACL) ----
        // Prefer the unified param array, fall back to GET only if needed.
        $folderParam = isset($requestParams['folder'])
            ? (string)$requestParams['folder']
            : (isset($_GET['folder']) ? (string)$_GET['folder'] : 'root');

        // Decode %xx (e.g., "test%20folder") then normalize
        $folderParam  = rawurldecode($folderParam);
        $targetFolder = ACL::normalizeFolder($folderParam);

        // Admins bypass folder canWrite checks
        if (!$isAdmin && !ACL::canUpload($username, $userPerms, $targetFolder)) {
            http_response_code(403);
            echo json_encode([
                'error' => 'Forbidden: no write access to folder "' . $targetFolder . '".',
            ]);
            return;
        }

        // ---- 4) Delegate to model (force the sanitized folder) ----
        $requestParams['folder'] = $targetFolder;
        // Keep legacy behavior for anything still reading $_POST directly
        $_POST['folder'] = $targetFolder;

        $result = UploadModel::handleUpload($requestParams, $_FILES);

        // ---- 5) Special handling for Resumable.js GET tests ----
        // Resumable only inspects HTTP status:
        //   200 => chunk exists (skip)
        //   404/other => chunk missing (upload)
        if ($isResumableTest && isset($result['status'])) {
            if ($result['status'] === 'found') {
                http_response_code(200);
            } else {
                http_response_code(202); // 202 Accepted = chunk not found
            }
             echo json_encode($result);
            return;
        }

        // ---- 6) Normal response handling ----
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
            'success'     => $result['success'] ?? 'File uploaded successfully',
            'newFilename' => $result['newFilename'] ?? null,
        ]);
    }

    public function removeChunks(): void
    {
        header('Content-Type: application/json');

        $receivedToken = isset($_POST['csrf_token']) ? trim((string)$_POST['csrf_token']) : '';
        if ($receivedToken !== ($_SESSION['csrf_token'] ?? '')) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid CSRF token']);
            return;
        }

        $sourceId = trim((string)($_POST['sourceId'] ?? ''));
        if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid source id.']);
                return;
            }
            $info = SourceContext::getSourceById($sourceId);
            if (!$info) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid source.']);
                return;
            }
            SourceContext::setActiveId($sourceId, false, true);
        }

        if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
            http_response_code(403);
            echo json_encode(['error' => 'Source is read-only.']);
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
