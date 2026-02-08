<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/encryptionPlan.php",
 *   summary="Plan folder encryption/decryption",
 *   description="Scans a folder to estimate file/byte counts for encryption jobs.",
 *   operationId="planFolderEncryption",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="mode", in="query", required=false, @OA\Schema(type="string", enum={"encrypt","decrypt"}), example="encrypt"),
 *   @OA\Response(response=200, description="Plan result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=409, description="Conflict"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../config/config.php';

$folderController = new \FileRise\Http\Controllers\FolderController();
$folderController->encryptionPlan();
