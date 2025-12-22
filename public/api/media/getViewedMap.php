<?php
// public/api/media/getViewedMap.php
/**
 * @OA\Get(
 *   path="/api/media/getViewedMap.php",
 *   summary="Get viewed media map",
 *   operationId="getViewedMediaMap",
 *   tags={"Media"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Response(response=200, description="Viewed map"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/MediaController.php';

$ctl = new MediaController();
$ctl->getViewedMap();
