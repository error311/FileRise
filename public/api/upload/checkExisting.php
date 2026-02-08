<?php
// public/api/upload/checkExisting.php

/**
 * @OA\Post(
 *   path="/api/upload/checkExisting.php",
 *   summary="Check for existing files before upload",
 *   description="Checks whether the provided relative paths already exist in the target folder.",
 *   operationId="checkUploadExisting",
 *   tags={"Uploads"},
 *   security={{"cookieAuth": {}}},
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\MediaType(
 *       mediaType="application/json",
 *       @OA\Schema(
 *         required={"folder","files"},
 *         @OA\Property(property="folder", type="string", example="root"),
 *         @OA\Property(property="sourceId", type="string", example="local"),
 *         @OA\Property(
 *           property="files",
 *           type="array",
 *           @OA\Items(
 *             type="object",
 *             required={"path"},
 *             @OA\Property(property="path", type="string", example="team/reports/report.pdf"),
 *             @OA\Property(property="size", type="integer", format="int64", example=123456)
 *           )
 *         )
 *       )
 *     )
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="Existing files",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(
 *         property="existing",
 *         type="array",
 *         @OA\Items(
 *           type="object",
 *           @OA\Property(property="path", type="string"),
 *           @OA\Property(property="size", type="integer", format="int64", nullable=true),
 *           @OA\Property(property="sameSize", type="boolean", nullable=true)
 *         )
 *       )
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Invalid CSRF token")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$uploadController = new \FileRise\Http\Controllers\UploadController();
$uploadController->checkExisting();
