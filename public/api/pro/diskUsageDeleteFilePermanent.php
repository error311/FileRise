<?php

// public/api/pro/diskUsageDeleteFilePermanent.php
/**
 * @OA@Post(
 *   path="/api/pro/diskUsageDeleteFilePermanent.php",
 *   summary="Permanently delete a file",
 *   description="Deletes a single file from storage explorer (Pro, admin).",
 *   operationId="proDiskUsageDeleteFilePermanent",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"name"},
 *       @OA\Property(property="folder", type="string", example="root"),
 *       @OA\Property(property="name", type="string", example="large.zip"),
 *       @OA\Property(property="sourceId", type="string", example="local")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Delete result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProDiskUsageApiService.php';

try {
    fr_pro_require_active([], defined('FR_PRO_API_REQUIRE_DISK_USAGE') ? (int)FR_PRO_API_REQUIRE_DISK_USAGE : null);
    fr_pro_guard_method('POST');
    fr_pro_guard_auth(true, true);

    fr_pro_emit_result(\FileRise\Domain\ProDiskUsageApiService::deleteFile(fr_pro_read_json()));
} catch (Throwable $e) {
    fr_pro_emit_result(\FileRise\Domain\ProDiskUsageApiService::fromThrowable($e, 'Internal error'));
}
