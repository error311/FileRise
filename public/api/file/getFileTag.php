<?php
// public/api/file/getFileTag.php

/**
 * @OA\Get(
 *   path="/api/file/getFileTags.php",
 *   summary="Get global file tags",
 *   description="Returns tag metadata (no auth in current implementation).",
 *   operationId="getFileTags",
 *   tags={"Tags"},
 *   @OA\Response(response=200, description="Tags map (model-defined JSON)")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->getFileTags();