<?php
// public/api/media/updateProgress.php
/**
 * @OA\Post(
 *   path="/api/media/updateProgress.php",
 *   summary="Update media playback progress",
 *   operationId="updateMediaProgress",
 *   tags={"Media"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","file"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="file", type="string", example="video.mp4"),
 *       @OA\Property(property="seconds", type="number", format="float", example=42.5),
 *       @OA\Property(property="duration", type="number", format="float", nullable=true, example=3600),
 *       @OA\Property(property="completed", type="boolean", nullable=true),
 *       @OA\Property(property="clear", type="boolean", example=false)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Update result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
require_once __DIR__ . '/../../../config/config.php';

$ctl = new \FileRise\Http\Controllers\MediaController();
$ctl->updateProgress();
