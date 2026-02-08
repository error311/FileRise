<?php
// public/api/file/renameFile.php

/**
 * @OA\Put(
 *   path="/api/file/renameFile.php",
 *   summary="Rename a file",
 *   description="Requires write access; non-admins must own the file.",
 *   operationId="renameFile",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","oldName","newName"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="oldName", type="string", example="old.pdf"),
 *       @OA\Property(property="newName", type="string", example="new.pdf")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Rename result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->renameFile();