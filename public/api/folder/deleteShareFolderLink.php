<?php

/**
 * @OA\Post(
 *   path="/api/folder/deleteShareFolderLink.php",
 *   summary="Delete a shared-folder link by token (admin only)",
 *   description="Requires authentication, CSRF token, and admin privileges.",
 *   operationId="deleteShareFolderLink",
 *   tags={"Shared Folders","Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"token"},
 *       @OA\Property(property="token", type="string", example="sf_abc123")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Deleted"),
 *   @OA\Response(response=400, description="No token provided"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Admin only"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->deleteShareFolderLink();