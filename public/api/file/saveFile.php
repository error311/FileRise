<?php
// public/api/file/saveFile.php

/**
 * @OA\Put(
 *   path="/api/file/saveFile.php",
 *   summary="Create or overwrite a file’s content",
 *   description="Requires write access. Overwrite enforces ownership for non-admins. Certain executable extensions are denied.",
 *   operationId="saveFile",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","fileName","content"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="fileName", type="string", example="readme.txt"),
 *       @OA\Property(property="content", type="string", example="Hello world")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Save result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid input or disallowed extension"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->saveFile();