<?php

// public/api/pro/groups/list.php
/**
 * @OA\Get(
 *   path="/api/pro/groups/list.php",
 *   summary="List Pro groups",
 *   description="Returns user groups defined in FileRise Pro.",
 *   operationId="proGroupsList",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Groups payload"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProGroupsApiService.php';

try {
    fr_pro_guard_auth(true, false);
    fr_pro_emit_result(\FileRise\Domain\ProGroupsApiService::listGroups());
} catch (Throwable $e) {
    $status = $e instanceof InvalidArgumentException ? 400 : 500;
    fr_pro_json($status, [
        'success' => false,
        'error' => 'Error loading groups: ' . $e->getMessage(),
    ]);
}
