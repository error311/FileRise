<?php
// public/api/folder/deleteFolder.php

/**
 * @OA\Post(
 *   path="/api/folder/deleteFolder.php",
 *   summary="Delete a folder",
 *   description="Requires authentication, CSRF token, write scope, and (for non-admins) folder ownership.",
 *   operationId="deleteFolder",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder"},
 *       @OA\Property(property="folder", type="string", example="userA/reports")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Deletion result (model-defined JSON)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->deleteFolder();