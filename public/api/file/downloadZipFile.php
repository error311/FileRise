<?php
// public/api/file/downloadZipFile.php

/**
 * @OA\Get(
 *   path="/api/file/downloadZipFile.php",
 *   summary="Download a finished ZIP by token",
 *   description="Streams the zip once; token is one-shot.",
 *   operationId="downloadZipFile",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="k", in="query", required=true, @OA\Schema(type="string"), description="Job token"),
 *   @OA\Parameter(name="name", in="query", required=false, @OA\Schema(type="string"), description="Suggested filename"),
 *   @OA\Response(response=200, description="ZIP stream"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$controller = new FileController();
$controller->downloadZipFile();