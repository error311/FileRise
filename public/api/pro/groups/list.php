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

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';

try {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();
    \FileRise\Http\Controllers\AdminController::requireAdmin();

    $ctrl   = new \FileRise\Http\Controllers\AdminController();
    $groups = $ctrl->getProGroups();

    echo json_encode([
        'success' => true,
        'groups'  => $groups,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $code = $e instanceof InvalidArgumentException ? 400 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => 'Error loading groups: ' . $e->getMessage(),
    ]);
}
