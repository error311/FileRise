<?php
// public/api/file/getTrashItems.php

/**
 * @OA\Get(
 *   path="/api/file/getTrashItems.php",
 *   summary="List items in Trash (admin only)",
 *   operationId="getTrashItems",
 *   tags={"Trash"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Trash contents (model-defined JSON)"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Admin only"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->getTrashItems();