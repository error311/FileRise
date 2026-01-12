<?php
// public/api/folder/getFolderList.php


/**
 * @OA\Get(
 *   path="/api/folder/getFolderList.php",
 *   summary="List folders (optionally under a parent)",
 *   description="Requires authentication. Non-admins see folders for which they have full view or own-only access.",
 *   operationId="getFolderList",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(
 *     name="folder", in="query", required=false,
 *     description="Parent folder to include and descend (default all); use 'root' for top-level",
 *     @OA\Schema(type="string"), example="root"
 *   ),
 *   @OA\Parameter(
 *     name="sourceId", in="query", required=false,
 *     description="Optional source id (admin can target disabled sources)",
 *     @OA\Schema(type="string"), example="local"
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="List of folders",
 *     @OA\JsonContent(
 *       type="array",
 *       @OA\Items(
 *         type="object",
 *         @OA\Property(property="folder", type="string", example="team/reports"),
 *         @OA\Property(property="fileCount", type="integer", example=12),
 *         @OA\Property(property="metadataFile", type="string", example="/path/to/meta.json")
 *       )
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid folder"),
 *   @OA\Response(response=401, description="Unauthorized")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->getFolderList();
