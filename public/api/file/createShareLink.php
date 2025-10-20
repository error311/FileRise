<?php
// public/api/file/createShareLink.php

/**
 * @OA\Post(
 *   path="/api/file/createShareLink.php",
 *   summary="Create a share link for a file",
 *   description="Requires share permission on the folder. Non-admins must own the file unless bypassOwnership.",
 *   operationId="createShareLink",
 *   tags={"Shares"},
 *   security={{"cookieAuth": {}}},
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","file"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="file", type="string", example="invoice.pdf"),
 *       @OA\Property(property="expirationValue", type="integer", example=60),
 *       @OA\Property(property="expirationUnit", type="string", enum={"seconds","minutes","hours","days"}, example="minutes"),
 *       @OA\Property(property="password", type="string", example="")
 *     )
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="Share link created",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="token", type="string", example="abc123"),
 *       @OA\Property(property="url", type="string", example="/api/file/share.php?token=abc123"),
 *       @OA\Property(property="expires", type="integer", example=1700000000)
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$fileController = new FileController();
$fileController->createShareLink();