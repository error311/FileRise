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
 *     @OA\MediaType(
 *       mediaType="application/x-www-form-urlencoded",
 *       @OA\Schema(
 *         required={"token"},
 *         @OA\Property(property="token", type="string", example="abc123")
 *       )
 *     )
 *   ),
 *   @OA\Response(response=200, description="Deletion result (success or not found)")
 * )
 */


require_once __DIR__ . '/../../../config/config.php';

$fileController = new \FileRise\Http\Controllers\FileController();
$fileController->deleteShareLink();
