<?php
// public/api/file/saveFileTag.php

/**
 * @OA\Post(
 *   path="/api/file/saveFileTag.php",
 *   summary="Save tags for a file (or delete one)",
 *   description="Requires write access and (for non-admins) ownership when modifying.",
 *   operationId="saveFileTag",
 *   tags={"Tags"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","file"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="file", type="string", example="doc.md"),
 *       @OA\Property(property="tags", type="array", @OA\Items(type="string"), example={"work","urgent"}),
 *       @OA\Property(property="deleteGlobal", type="boolean", example=false),
 *       @OA\Property(property="tagToDelete", type="string", nullable=true, example=null)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Save result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->saveFileTag();