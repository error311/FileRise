<?php
// public/api/pro/portals/uploadLogo.php

declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/pro/portals/uploadLogo.php",
 *   summary="Upload portal logo",
 *   description="Uploads a portal logo image (admin only, Pro).",
 *   operationId="proPortalsUploadLogo",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\MediaType(
 *       mediaType="multipart/form-data",
 *       @OA\Schema(
 *         required={"portal_logo"},
 *         @OA\Property(property="portal_logo", type="string", format="binary"),
 *         @OA\Property(property="slug", type="string", example="client-portal")
 *       )
 *     )
 *   ),
 *   @OA\Response(response=200, description="Upload result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../../config/config.php';
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
    $ctrl->uploadPortalLogo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Exception: ' . $e->getMessage(),
    ]);
}
