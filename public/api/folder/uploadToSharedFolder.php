<?php
// public/api/folder/uploadToSharedFolder.php

/**
 * @OA\Post(
 *   path="/api/folder/uploadToSharedFolder.php",
 *   summary="Upload a file into a shared folder (by token)",
 *   description="Public form-upload endpoint. Only allowed when the share link has uploads enabled. On success responds with a redirect to the share page.",
 *   operationId="uploadToSharedFolder",
 *   tags={"Shared Folders"},
 *   @OA\RequestBody(
 *     required=true,
 *     content={
 *       "multipart/form-data": @OA\MediaType(
 *         mediaType="multipart/form-data",
 *         @OA\Schema(
 *           type="object",
 *           required={"token","fileToUpload"},
 *           @OA\Property(property="token", type="string", description="Share token"),
 *           @OA\Property(property="pass", type="string", description="Share password (if required)"),
 *           @OA\Property(property="path", type="string", description="Optional subfolder path within the shared folder"),
 *           @OA\Property(property="fileToUpload", type="string", format="binary", description="File to upload")
 *         )
 *       )
 *     }
 *   ),
 *   @OA\Response(response=302, description="Redirect to /api/folder/shareFolder.php?token=..."),
 *   @OA\Response(response=400, description="Upload error or invalid input"),
 *   @OA\Response(response=405, description="Method not allowed")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$folderController = new \FileRise\Http\Controllers\FolderController();
$folderController->uploadToSharedFolder();
