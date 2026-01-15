<?php
// public/api/file/extractZip.php

/**
 * @OA\Post(
 *   path="/api/file/extractZip.php",
 *   summary="Extract archive file(s) into a folder",
 *   description="Supports ZIP/7Z and RAR extraction via server tools. Requires write access on the target folder.",
 *   operationId="extractZip",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","files"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="files", type="array", @OA\Items(type="string"), example={"archive.zip","archive.7z"})
 *     )
 *   ),
 *   @OA\Response(response=200, description="Extraction result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->extractZip();
