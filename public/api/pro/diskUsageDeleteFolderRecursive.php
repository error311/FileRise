<?php
// public/api/pro/diskUsageDeleteFolderRecursive.php
/**
 * @OA\Post(
 *   path="/api/pro/diskUsageDeleteFolderRecursive.php",
 *   summary="Permanently delete a folder",
 *   description="Recursively deletes a folder from storage explorer (Pro, admin).",
 *   operationId="proDiskUsageDeleteFolderRecursive",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder"},
 *       @OA\Property(property="folder", type="string", example="team/archive"),
 *       @OA\Property(property="sourceId", type="string", example="local")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Delete result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

// Pro-only gate
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_DISK_USAGE)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'FileRise Pro is not active on this instance.']);
    return;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();
    AdminController::requireCsrf();

    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['folder'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid input']);
        return;
    }

    $folder = (string)$body['folder'];
    $folder = $folder === '' ? 'root' : trim($folder, "/\\ ");

    $sourceId = isset($body['sourceId']) ? trim((string)$body['sourceId']) : '';
    $prevSourceId = null;
    if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Invalid source id.']);
            return;
        }
        $src = SourceContext::getSourceById($sourceId);
        if (!$src || empty($src['enabled'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Invalid source id.']);
            return;
        }
        $type = strtolower((string)($src['type'] ?? 'local'));
        if ($type !== 'local') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Storage explorer is only available for local sources.']);
            return;
        }
        $prevSourceId = SourceContext::getActiveId();
        SourceContext::setActiveId($sourceId, false, true);
    }

    if (strtolower($folder) === 'root') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Cannot deep delete root folder.']);
        return;
    }

    try {
        $res = FolderModel::deleteFolderRecursiveAdmin($folder);
    } finally {
        if ($prevSourceId !== null) {
            SourceContext::setActiveId($prevSourceId, false, true);
        }
    }
    if (!empty($res['error'])) {
        echo json_encode(['ok' => false, 'error' => $res['error']]);
    } else {
        echo json_encode(['ok' => true, 'success' => $res['success'] ?? 'Folder deleted.']);
    }
} catch (Throwable $e) {
    error_log('diskUsageDeleteFolderRecursive error: '.$e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Internal error']);
}
