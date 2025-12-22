<?php
// public/api/pro/diskUsageDeleteFilePermanent.php
/**
 * @OA\Post(
 *   path="/api/pro/diskUsageDeleteFilePermanent.php",
 *   summary="Permanently delete a file",
 *   description="Deletes a single file from storage explorer (Pro, admin).",
 *   operationId="proDiskUsageDeleteFilePermanent",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"name"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="name", type="string", example="large.zip")
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
require_once PROJECT_ROOT . '/src/models/FileModel.php';

// Pro-only gate: make sure Pro is really active
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
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
    if (!is_array($body) || empty($body['name'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid input']);
        return;
    }

    $folder = isset($body['folder']) ? (string)$body['folder'] : 'root';
    $folder = $folder === '' ? 'root' : trim($folder, "/\\ ");
    $name   = (string)$body['name'];

    $res = FileModel::deleteFilesPermanent($folder, [$name]);
    if (!empty($res['error'])) {
        echo json_encode(['ok' => false, 'error' => $res['error']]);
    } else {
        echo json_encode(['ok' => true, 'success' => $res['success'] ?? 'File deleted.']);
    }
} catch (Throwable $e) {
    error_log('diskUsageDeleteFilePermanent error: '.$e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Internal error']);
}
