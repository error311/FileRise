<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/folder/encryptionJobStart.php",
 *   summary="Start folder encryption/decryption job",
 *   description="Queues an encryption or decryption job for a folder.",
 *   operationId="startFolderEncryptionJob",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","mode"},
 *       @OA\Property(property="folder", type="string", example="team/reports"),
 *       @OA\Property(property="mode", type="string", enum={"encrypt","decrypt"}),
 *       @OA\Property(property="totalFiles", type="integer", example=0),
 *       @OA\Property(property="totalBytes", type="integer", example=0)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Job started"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=409, description="Conflict"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../config/config.php';

$folderController = new \FileRise\Http\Controllers\FolderController();
$folderController->encryptionJobStart();
