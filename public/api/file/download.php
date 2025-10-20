<?php
// public/api/file/download.php


/**
 * @OA\Get(
 *   path="/api/file/download.php",
 *   summary="Download a file",
 *   description="Requires view access (or own-only with ownership). Streams the file with appropriate Content-Type.",
 *   operationId="downloadFile",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=true, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="file", in="query", required=true, @OA\Schema(type="string"), example="photo.jpg"),
 *   @OA\Response(
 *     response=200,
 *     description="Binary file",
 *     content={
 *       "application/octet-stream": @OA\MediaType(
 *         mediaType="application/octet-stream",
 *         @OA\Schema(type="string", format="binary")
 *       )
 *     }
 *   ),
 *   @OA\Response(response=400, description="Invalid folder/file"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->downloadFile();