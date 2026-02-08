<?php
// public/api/pro/portals/get.php
/**
 * @OA\Get(
 *   path="/api/pro/portals/get.php",
 *   summary="Get portal by slug",
 *   description="Returns portal metadata (public).",
 *   operationId="proPortalsGet",
 *   tags={"Pro"},
 *   @OA\Parameter(name="slug", in="query", required=true, @OA\Schema(type="string"), example="client-portal"),
 *   @OA\Response(response=200, description="Portal payload"),
 *   @OA\Response(response=404, description="Portal not found")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';

try {
    $slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';

    // For v1: we do NOT require auth here; this is just metadata,
    // real ACL/access control must still be enforced at upload/download endpoints.
    $portal = \FileRise\Http\Controllers\PortalController::getPortalBySlug($slug);

    echo json_encode([
        'success' => true,
        'portal'  => $portal,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
