<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/folder/encryptionJobTick.php",
 *   summary="Process encryption job tick",
 *   description="Processes a small batch for an active encryption/decryption job.",
 *   operationId="tickFolderEncryptionJob",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"jobId"},
 *       @OA\Property(property="jobId", type="string", example="a1b2c3d4e5f6"),
 *       @OA\Property(property="maxFiles", type="integer", example=2)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Tick result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=404, description="Job not found"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->encryptionJobTick();
