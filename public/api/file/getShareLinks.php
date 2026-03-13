<?php

/**
 * @OA\Get(
 *   path="/api/file/getShareLinks.php",
 *   summary="Get (raw) share links file",
 *   description="Returns the full share links JSON. Requires an authenticated admin session.",
 *   operationId="getShareLinks",
 *   tags={"Shares"},
 *   @OA\Response(response=200, description="Share links (model-defined JSON)"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden")
 * )
 */


require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->getShareLinks();
