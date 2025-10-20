<?php
// public/api/file/share.php

/**
 * @OA\Get(
 *   path="/api/file/share.php",
 *   summary="Open a shared file by token",
 *   description="If the link is password-protected and no password is supplied, an HTML password form is returned. Otherwise the file is streamed.",
 *   operationId="shareFile",
 *   tags={"Shares"},
 *   @OA\Parameter(name="token", in="query", required=true, @OA\Schema(type="string")),
 *   @OA\Parameter(name="pass", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(
 *     response=200,
 *     description="Binary file (or HTML password form when missing password)",
 *     content={
 *       "application/octet-stream": @OA\MediaType(
 *         mediaType="application/octet-stream",
 *         @OA\Schema(type="string", format="binary")
 *       ),
 *       "text/html": @OA\MediaType(mediaType="text/html")
 *     }
 *   ),
 *   @OA\Response(response=400, description="Missing token / invalid input"),
 *   @OA\Response(response=403, description="Expired or invalid password"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->shareFile();