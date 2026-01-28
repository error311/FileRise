<?php
// public/api/folder/downloadSharedFile.php

/**
 * @OA\Get(
 *   path="/api/folder/downloadSharedFile.php",
 *   summary="Download a file from a shared folder (by token)",
 *   description="Public endpoint; validates token and file name, then streams the file.",
 *   operationId="downloadSharedFile",
 *   tags={"Shared Folders"},
 *   @OA\Parameter(name="token", in="query", required=true, @OA\Schema(type="string")),
 *   @OA\Parameter(name="pass", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="file", in="query", required=false, @OA\Schema(type="string"), example="report.pdf"),
 *   @OA\Parameter(name="path", in="query", required=false, @OA\Schema(type="string"), example="subfolder/report.pdf"),
 *   @OA\Parameter(name="inline", in="query", required=false, @OA\Schema(type="integer", enum={0,1}), description="Allow inline rendering for safe types"),
 *   @OA\Response(
 *     response=200,
 *     description="Binary file",
 *     content={
 *       "application/octet-stream": @OA\MediaType(
 *         mediaType="application/octet-stream",
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
require_once PROJECT_ROOT . '/src/controllers/FolderController.php';

$folderController = new FolderController();
$folderController->downloadSharedFile();
