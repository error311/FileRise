<?php

// public/api/pro/portals/publicMeta.php
/**
 * @OA\Get(
 *   path="/api/pro/portals/publicMeta.php",
 *   summary="Get public portal metadata",
 *   description="Returns the public metadata needed for the portal login page.",
 *   operationId="proPortalsPublicMeta",
 *   tags={"Pro"},
 *   @OA\Parameter(name="slug", in="query", required=true, @OA\Schema(type="string"), example="client-portal"),
 *   @OA\Response(response=200, description="Public portal payload"),
 *   @OA\Response(response=400, description="Missing slug"),
 *   @OA\Response(response=404, description="Portal not found or Pro inactive"),
 *   @OA\Response(response=410, description="Portal expired"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    $slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
    fr_pro_emit_result(\FileRise\Domain\ProPortalsApiService::publicMeta($slug));
} catch (Throwable $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 599) {
        $status = 500;
    }

    fr_pro_json($status, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
