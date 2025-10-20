<?php
// public/api/file/copyFiles.php

/**
 * @OA\Post(
 *   path="/api/file/copyFiles.php",
 *   summary="Copy files between folders",
 *   description="Requires read access on source and write access on destination. Enforces folder scope and ownership.",
 *   operationId="copyFiles",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(
 *     name="X-CSRF-Token", in="header", required=true,
 *     description="CSRF token from the current session",
 *     @OA\Schema(type="string")
 *   ),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"source","destination","files"},
 *       @OA\Property(property="source", type="string", example="root"),
 *       @OA\Property(property="destination", type="string", example="userA/projects"),
 *       @OA\Property(property="files", type="array", @OA\Items(type="string"), example={"report.pdf","notes.txt"})
 *     )
 *   ),
 *   @OA\Response(response=200, description="Copy result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid request or folder name"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->copyFiles();