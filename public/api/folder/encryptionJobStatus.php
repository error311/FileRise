<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/folder/encryptionJobStatus.php",
 *   summary="Get folder encryption job status",
 *   operationId="getFolderEncryptionJobStatus",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="jobId", in="query", required=true, @OA\Schema(type="string"), description="Job id"),
 *   @OA\Response(response=200, description="Job status"),
 *   @OA\Response(response=400, description="Invalid job id"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=404, description="Job not found"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../config/config.php';

$folderController = new \FileRise\Http\Controllers\FolderController();
$folderController->encryptionJobStatus();
