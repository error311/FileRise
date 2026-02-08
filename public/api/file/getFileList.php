<?php
// public/api/file/getFileList.php

/**
 * @OA\Get(
 *   path="/api/file/getFileList.php",
 *   summary="List files in a folder",
 *   description="Requires view access (full) or read_own (own-only results).",
 *   operationId="getFileList",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=true, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string"), example="local"),
 *   @OA\Response(response=200, description="Listing result (model-defined JSON)"),
 *   @OA\Response(response=400, description="Invalid folder"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->getFileList();
