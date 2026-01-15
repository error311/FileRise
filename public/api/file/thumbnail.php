<?php
// public/api/file/thumbnail.php

/**
 * @OA\Get(
 *   path="/api/file/thumbnail.php",
 *   summary="Get a video thumbnail image",
 *   description="Returns a cached JPEG thumbnail for supported video files.",
 *   operationId="getVideoThumbnail",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=true, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="file", in="query", required=true, @OA\Schema(type="string"), example="clip.mp4"),
 *   @OA\Response(
 *     response=200,
 *     description="Thumbnail image",
 *     content={
 *       "image/jpeg": @OA\MediaType(
 *         mediaType="image/jpeg",
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
$fileController->videoThumbnail();
