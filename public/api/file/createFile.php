<?php
// public/api/file/createFile.php

/**
 * @OA\Post(
 *   path="/api/file/createFile.php",
 *   summary="Create an empty file",
 *   description="Requires write access on the target folder. Enforces folder-only scope.",
 *   operationId="createFile",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","name"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="name", type="string", example="new.txt")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Creation result (model-defined)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

header('Content-Type: application/json');
if (empty($_SESSION['authenticated'])) {
  http_response_code(401);
  echo json_encode(['success'=>false,'error'=>'Unauthorized']);
  exit;
}

$fc = new \FileRise\Http\Controllers\FileController();
$fc->createFile();