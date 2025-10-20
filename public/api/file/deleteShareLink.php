<?php


/**
 * @OA\Post(
 *   path="/api/file/deleteShareLink.php",
 *   summary="Delete a share link by token",
 *   description="Deletes a share token. NOTE: Current implementation does not require authentication.",
 *   operationId="deleteShareLink",
 *   tags={"Shares"},
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"token"},
 *       @OA\Property(property="token", type="string", example="abc123")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Deletion result (success or not found)")
 * )
 */


require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->deleteShareLink();