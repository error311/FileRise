<?php
// public/api/admin/oidcTest.php
/**
 * @OA\Post(
 *   path="/api/admin/oidcTest.php",
 *   summary="Test OIDC discovery",
 *   description="Fetches the discovery document for a provider URL.",
 *   operationId="adminOidcTest",
 *   tags={"Admin"},
 *   @OA\RequestBody(
 *     required=false,
 *     @OA\JsonContent(
 *       @OA\Property(property="providerUrl", type="string", example="https://issuer.example.com")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Discovery result"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

try {
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        $body = [];
    }

    $controller = new AdminController();
    $result = $controller->testOidcConfig($body);

    echo json_encode(
        $result,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $e) {
    error_log('[OIDC test] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Internal error during OIDC test.',
    ]);
}
