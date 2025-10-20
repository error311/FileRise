<?php

/**
 * @OA\Get(
 *   path="/api/folder/getShareFolderLinks.php",
 *   summary="List active shared-folder links (admin only)",
 *   description="Returns all non-expired shared-folder links. Admin-only.",
 *   operationId="getShareFolderLinks",
 *   tags={"Shared Folders","Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Active share-folder links (model-defined JSON)"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Admin only")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController =  new FolderController();
$folderController->getShareFolderLinks();