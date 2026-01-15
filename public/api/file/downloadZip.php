<?php
// public/api/file/downloadZip.php


/**
 * @OA\Post(
 *   path="/api/file/downloadZip.php",
 *   summary="Queue an archive download",
 *   description="Queues a background archive build. Requires view access (or own-only with ownership). May be gated by account flag.",
 *   operationId="downloadZip",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","files"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="files", type="array", @OA\Items(type="string"), example={"a.jpg","b.png"}),
 *       @OA\Property(property="format", type="string", example="zip", enum={"zip","7z"}, description="Archive format")
 *     )
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="Archive job queued",
 *     @OA\JsonContent(
 *       @OA\Property(property="ok", type="boolean", example=true),
 *       @OA\Property(property="token", type="string"),
 *       @OA\Property(property="statusUrl", type="string"),
 *       @OA\Property(property="downloadUrl", type="string")
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
$fileController->downloadZip();
