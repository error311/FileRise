<?php

// public/api/pro/portals/save.php
/**
 * @OA\Post(
 *   path="/api/pro/portals/save.php",
 *   summary="Save portals",
 *   description="Saves portal definitions (admin only, Pro).",
 *   operationId="proPortalsSave",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"portals"},
 *       @OA\Property(property="portals", type="object")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Save result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    fr_pro_guard_method('POST');
    fr_pro_guard_auth(true, true);

    $actor = isset($_SESSION['username']) ? (string)$_SESSION['username'] : '';
    fr_pro_emit_result(\FileRise\Domain\ProPortalsApiService::savePortals(fr_pro_read_json(), $actor));
} catch (Throwable $e) {
    $status = $e instanceof InvalidArgumentException ? 400 : 500;
    fr_pro_json($status, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
