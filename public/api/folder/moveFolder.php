<?php
// public/api/folder/moveFolder.php
/**
 * @OA\Post(
 *   path="/api/folder/moveFolder.php",
 *   summary="Move or copy a folder",
 *   description="Moves (default) or copies a folder into a destination folder.",
 *   operationId="moveFolder",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"source","destination"},
 *       @OA\Property(property="source", type="string", example="team/q1"),
 *       @OA\Property(property="destination", type="string", example="archive"),
 *       @OA\Property(property="mode", type="string", example="move"),
 *       @OA\Property(property="sourceId", type="string", example="local"),
 *       @OA\Property(property="destSourceId", type="string", example="s3-main")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Move result (model-defined JSON)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$controller = new FolderController();
$controller->moveFolder();
