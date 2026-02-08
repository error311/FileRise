<?php
// public/api/file/getFileTag.php

/**
 * @OA\Get(
 *   path="/api/file/getFileTag.php",
 *   summary="Get global file tags",
 *   description="Returns tag metadata for the authenticated session.",
 *   operationId="getFileTag",
 *   tags={"Tags"},
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string"), description="Optional source id (Pro sources)."),
 *   @OA\Response(response=200, description="Tags map (model-defined JSON)")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->getFileTags();
