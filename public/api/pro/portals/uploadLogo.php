<?php

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

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
    fr_pro_json(403, [
        'success' => false,
        'error' => 'FileRise Pro is not active on this instance.',
    ]);
}

try {
    \FileRise\Domain\ProPortalsApiService::uploadPortalLogo();
} catch (Throwable $e) {
    fr_pro_json(500, [
        'success' => false,
        'error' => 'Exception: ' . $e->getMessage(),
    ]);
}
