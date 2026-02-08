<?php
// public/api/folder/shareFolder.php

/**
 * @OA\Get(
 *   path="/api/folder/shareFolder.php",
 *   summary="Open a shared folder by token (HTML UI)",
 *   description="If the share is password-protected and no password is supplied, an HTML password form is returned. Otherwise renders an HTML listing with optional upload form.",
 *   operationId="shareFolder",
 *   tags={"Shared Folders"},
 *   @OA\Parameter(name="token", in="query", required=true, @OA\Schema(type="string")),
 *   @OA\Parameter(name="pass", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="path", in="query", required=false, @OA\Schema(type="string"), description="Subfolder path within the shared folder"),
 *   @OA\Parameter(name="page", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=1),
 *   @OA\Response(
 *     response=200,
 *     description="HTML page (password form or folder listing)",
 *     content={"text/html": @OA\MediaType(mediaType="text/html")}
 *   ),
 *   @OA\Response(response=400, description="Missing/invalid token"),
 *   @OA\Response(response=403, description="Forbidden or wrong password")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$folderController = new \FileRise\Http\Controllers\FolderController();
$folderController->shareFolder();
