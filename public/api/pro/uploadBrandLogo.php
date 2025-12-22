<?php
// public/api/pro/uploadBrandLogo.php
/**
 * @OA\Post(
 *   path="/api/pro/uploadBrandLogo.php",
 *   summary="Upload branding logo",
 *   description="Uploads a branding logo image (admin only, Pro).",
 *   operationId="proUploadBrandLogo",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\MediaType(
 *       mediaType="multipart/form-data",
 *       @OA\Schema(
 *         required={"brand_logo"},
 *         @OA\Property(property="brand_logo", type="string", format="binary")
 *       )
 *     )
 *   ),
 *   @OA\Response(response=200, description="Upload result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

header('Content-Type: application/json; charset=utf-8');

// Pro-only gate
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error'   => 'FileRise Pro is not active on this instance.'
    ]);
    exit;
}

try {
    $ctrl = new UserController();
    $ctrl->uploadBrandLogo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Exception: ' . $e->getMessage(),
    ]);
}
