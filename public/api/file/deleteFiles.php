<?php
// public/api/file/deleteFiles.php

/**
 * @OA\Post(
 *   path="/api/file/deleteFiles.php",
 *   summary="Delete files to Trash",
 *   description="Requires write access on the folder and (for non-admins) ownership of the files.",
 *   operationId="deleteFiles",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(
 *     name="X-CSRF-Token", in="header", required=true,
 *     @OA\Schema(type="string")
 *   ),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","files"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="files", type="array", @OA\Items(type="string"), example={"old.docx","draft.md"})
 *     )
 *   ),
 *   @OA\Response(response=200, description="Delete result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->deleteFiles();