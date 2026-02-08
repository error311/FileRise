<?php
// public/api/media/getProgress.php
/**
 * @OA\Get(
 *   path="/api/media/getProgress.php",
 *   summary="Get media playback progress",
 *   operationId="getMediaProgress",
 *   tags={"Media"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=true, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="file", in="query", required=true, @OA\Schema(type="string"), example="video.mp4"),
 *   @OA\Response(response=200, description="Progress state"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
require_once __DIR__ . '/../../../config/config.php';

$ctl = new \FileRise\Http\Controllers\MediaController();
$ctl->getProgress();
