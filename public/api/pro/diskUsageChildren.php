<?php

// public/api/pro/diskUsageChildren.php
/**
 * @OA\Get(
 *   path="/api/pro/diskUsageChildren.php",
 *   summary="Get disk usage children",
 *   description="Returns per-folder usage children for the storage explorer (Pro).",
 *   operationId="proDiskUsageChildren",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="root"),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Children payload"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=404, description="Snapshot not found"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProDiskUsageApiService.php';

try {
    fr_pro_guard_method('GET');

    fr_pro_start_session();
    $ctx = fr_pro_current_user_context();
    if ($ctx['username'] === '' || !$ctx['isAdmin']) {
        fr_pro_json(403, ['ok' => false, 'error' => 'Forbidden']);
    }
    @session_write_close();

    fr_pro_require_active(
        ['ProDiskUsage', \FileRise\Domain\ProDiskUsageApiService::class],
        defined('FR_PRO_API_REQUIRE_DISK_USAGE') ? (int)FR_PRO_API_REQUIRE_DISK_USAGE : null
    );

    fr_pro_emit_result(\FileRise\Domain\ProDiskUsageApiService::children($_GET));
} catch (Throwable $e) {
    fr_pro_emit_result(\FileRise\Domain\ProDiskUsageApiService::fromThrowable($e, 'Internal error'));
}
