<?php
// public/api/file/restoreFiles.php

/**
 * @OA\Post(
 *   path="/api/file/restoreFiles.php",
 *   summary="Restore files from Trash (admin only)",
 *   operationId="restoreFiles",
 *   tags={"Trash"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"files"},
 *       @OA\Property(property="files", type="array", @OA\Items(type="string"), example={"trash/12345.json"})
 *     )
 *   ),
 *   @OA\Response(response=200, description="Restore result (model-defined)"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Admin only"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->restoreFiles();