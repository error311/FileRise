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

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();
    AdminController::requireCsrf();

    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
        return;
    }

    $portals = $body['portals'] ?? null;
    if (!is_array($portals)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid or missing "portals" payload']);
        return;
    }

    $ctrl = new AdminController();
    $result = $ctrl->saveProPortals($portals);

    $payload = ['success' => true];
    if (is_array($result) && !empty($result['portalUsers'])) {
        $payload['portalUsers'] = $result['portalUsers'];
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $code = $e instanceof InvalidArgumentException ? 400 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
