<?php

// public/api/pro/portals/list.php
/**
 * @OA\Get(
 *   path="/api/pro/portals/list.php",
 *   summary="List portals",
 *   description="Returns all portals (admin only, Pro).",
 *   operationId="proPortalsList",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Portals payload"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    fr_pro_guard_auth(true, false);
    fr_pro_emit_result(\FileRise\Domain\ProPortalsApiService::listPortals());
} catch (Throwable $e) {
    $status = $e instanceof InvalidArgumentException ? 400 : 500;
    fr_pro_json($status, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
