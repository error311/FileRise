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

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';

try {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();
    \FileRise\Http\Controllers\AdminController::requireAdmin();

    $ctrl    = new \FileRise\Http\Controllers\AdminController();
    $portals = $ctrl->getProPortals();

    echo json_encode([
        'success' => true,
        'portals' => $portals,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $code = $e instanceof InvalidArgumentException ? 400 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
