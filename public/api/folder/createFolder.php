<?php
// public/api/folder/createFolder.php

/**
 * @OA\Post(
 *   path="/api/folder/createFolder.php",
 *   summary="Create a new folder",
 *   description="Requires authentication, CSRF token, and write access to the parent folder. Seeds ACL owner.",
 *   operationId="createFolder",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(
 *     name="X-CSRF-Token", in="header", required=true,
 *     description="CSRF token from the current session",
 *     @OA\Schema(type="string")
 *   ),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folderName"},
 *       @OA\Property(property="folderName", type="string", example="reports"),
 *       @OA\Property(property="parent", type="string", nullable=true, example="root",
 *         description="Parent folder (default root)")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Creation result (model-defined JSON)"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->createFolder();