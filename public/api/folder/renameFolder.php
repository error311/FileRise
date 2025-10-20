<?php
// public/api/folder/renameFolder.php

/**
 * @OA\Post(
 *   path="/api/folder/renameFolder.php",
 *   summary="Rename or move a folder",
 *   description="Requires authentication, CSRF token, scope checks on old and new paths, and (for non-admins) ownership of the source folder.",
 *   operationId="renameFolder",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"oldFolder","newFolder"},
 *       @OA\Property(property="oldFolder", type="string", example="team/q1"),
 *       @OA\Property(property="newFolder", type="string", example="team/quarter-1")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Rename result (model-defined JSON)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->renameFolder();