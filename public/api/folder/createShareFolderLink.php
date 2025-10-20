<?php
// public/api/folder/createShareFolderLink.php

/**
 * @OA\Post(
 *   path="/api/folder/createShareFolderLink.php",
 *   summary="Create a share link for a folder",
 *   description="Requires authentication, CSRF token, and share permission. Non-admins must own the folder (unless bypass) and cannot share root.",
 *   operationId="createShareFolderLink",
 *   tags={"Shared Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder"},
 *       @OA\Property(property="folder", type="string", example="team/reports"),
 *       @OA\Property(property="expirationValue", type="integer", example=60),
 *       @OA\Property(property="expirationUnit", type="string", enum={"seconds","minutes","hours","days"}, example="minutes"),
 *       @OA\Property(property="password", type="string", example=""),
 *       @OA\Property(property="allowUpload", type="integer", enum={0,1}, example=0)
 *     )
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="Share folder link created",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="token", type="string", example="sf_abc123"),
 *       @OA\Property(property="url", type="string", example="/api/folder/shareFolder.php?token=sf_abc123"),
 *       @OA\Property(property="expires", type="integer", example=1700000000)
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->createShareFolderLink();