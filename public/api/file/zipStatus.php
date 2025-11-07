<?php
// public/api/file/zipStatus.php

/**
 * @OA\Get(
 *   path="/api/file/zipStatus.php",
 *   summary="Check status of a background ZIP build",
 *   description="Returns status for the authenticated user's token.",
 *   operationId="zipStatus",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="k", in="query", required=true, @OA\Schema(type="string"), description="Job token"),
 *   @OA\Response(response=200, description="Status payload"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$controller = new FileController();
$controller->zipStatus();