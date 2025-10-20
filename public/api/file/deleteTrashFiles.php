<?php
// public/api/file/deleteTrashFiles.php

/**
 * @OA\Post(
 *   path="/api/file/deleteTrashFiles.php",
 *   summary="Permanently delete Trash items (admin only)",
 *   operationId="deleteTrashFiles",
 *   tags={"Trash"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       oneOf={
 *         @OA\Schema(
 *           required={"deleteAll"},
 *           @OA\Property(property="deleteAll", type="boolean", example=true)
 *         ),
 *         @OA\Schema(
 *           required={"files"},
 *           @OA\Property(property="files", type="array", @OA\Items(type="string"), example={"trash/abc","trash/def"})
 *         )
 *       }
 *     )
 *   ),
 *   @OA\Response(response=200, description="Deletion result (model-defined)"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Admin only"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->deleteTrashFiles();