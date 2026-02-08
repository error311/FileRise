<?php
// public/api/folder/downloadSharedFolder.php

/**
 * @OA\Get(
 *   path="/api/folder/downloadSharedFolder.php",
 *   summary="Download a shared folder as a ZIP",
 *   description="Public endpoint; validates token/path and streams a ZIP archive.",
 *   operationId="downloadSharedFolder",
 *   tags={"Shared Folders"},
 *   @OA\Parameter(name="token", in="query", required=true, @OA\Schema(type="string")),
 *   @OA\Parameter(name="pass", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="path", in="query", required=false, @OA\Schema(type="string"), description="Subfolder path within the shared folder"),
 *   @OA\Response(
 *     response=200,
 *     description="ZIP archive",
 *     content={
 *       "application/zip": @OA\MediaType(
 *         mediaType="application/zip",
 *         @OA\Schema(type="string", format="binary")
 *       )
 *     }
 *   ),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Password required"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$folderController = new \FileRise\Http\Controllers\FolderController();
$folderController->downloadSharedFolder();
