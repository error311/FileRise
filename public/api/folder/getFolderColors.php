<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/getFolderColors.php",
 *   summary="Get folder color map",
 *   operationId="getFolderColors",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Folder color map"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }

try {
    $ctl = new FolderController();
    $ctl->getFolderColors();   // echoes JSON + status codes
} catch (Throwable $e) {
    error_log('getFolderColors failed: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Internal server error']);
}
