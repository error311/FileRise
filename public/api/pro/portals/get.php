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

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    $slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
    fr_pro_emit_result(\FileRise\Domain\ProPortalsApiService::getPortal($slug));
} catch (Throwable $e) {
    fr_pro_json(404, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
