<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/folder/saveFolderColor.php",
 *   summary="Save folder color",
 *   description="Sets or clears a custom folder color.",
 *   operationId="saveFolderColor",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder"},
 *       @OA\Property(property="folder", type="string", example="team/reports"),
 *       @OA\Property(property="color", type="string", example="#ff9900", nullable=true, description="Empty string clears")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Save result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }

try {
    $ctl = new FolderController();
    $ctl->saveFolderColor();   // validates method + CSRF, does ACL, echoes JSON
} catch (Throwable $e) {
    error_log('saveFolderColor failed: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Internal server error']);
}
