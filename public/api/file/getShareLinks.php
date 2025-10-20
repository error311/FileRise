<?php

/**
 * @OA\Get(
 *   path="/api/file/getShareLinks.php",
 *   summary="Get (raw) share links file",
 *   description="Returns the full share links JSON (no auth in current implementation).",
 *   operationId="getShareLinks",
 *   tags={"Shares"},
 *   @OA\Response(response=200, description="Share links (model-defined JSON)")
 * )
 */


require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->getShareLinks();