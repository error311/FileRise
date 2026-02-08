<?php
// public/api/file/moveFiles.php

/**
 * @OA\Post(
 *   path="/api/file/moveFiles.php",
 *   operationId="moveFiles",
 *   tags={"Files"},
 *   security={{"cookieAuth":{}}},
 *   @OA\RequestBody(ref="#/components/requestBodies/MoveFilesRequest"),
 *   @OA\Response(response=200, description="Moved"),
 *   @OA\Response(response=400, description="Bad Request"),
 *   @OA\Response(response=401, ref="#/components/responses/Unauthorized"),
 *   @OA\Response(response=403, ref="#/components/responses/Forbidden")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->moveFiles();