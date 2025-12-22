<?php
// public/api/upload/removeChunks.php

/**
 * @OA\Post(
 *   path="/api/upload/removeChunks.php",
 *   summary="Remove temporary chunk directory",
 *   description="Deletes the temporary directory used for a chunked upload. Requires a valid CSRF token in the form field.",
 *   operationId="removeChunks",
 *   tags={"Uploads"},
 *   security={{"cookieAuth": {}}},
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\MediaType(
 *       mediaType="application/x-www-form-urlencoded",
 *       @OA\Schema(
 *         required={"folder","csrf_token"},
 *         @OA\Property(property="folder", type="string", example="resumable_myupload123"),
 *         @OA\Property(property="csrf_token", type="string", description="CSRF token for this session")
 *       )
 *     )
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="Removal result",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="success", type="boolean", example=true),
 *       @OA\Property(property="message", type="string", example="Temporary folder removed.")
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Invalid CSRF token")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UploadController.php';

$uploadController = new UploadController();
$uploadController->removeChunks();
