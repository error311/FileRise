<?php

declare(strict_types=1);

// Pro Search Everywhere query endpoint
/**
 * @OA\Get(
 *   path="/api/pro/search/query.php",
 *   summary="Search files (Pro)",
 *   description="Searches across folders using the Pro search index.",
 *   operationId="proSearchQuery",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="q", in="query", required=false, @OA\Schema(type="string"), description="Search query"),
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=50),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string"), description="Source id or 'all'"),
 *   @OA\Parameter(name="force", in="query", required=false, @OA\Schema(type="boolean"), description="Admins only: force refresh"),
 *   @OA\Response(response=200, description="Search results"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=503, description="Search disabled")
 * )
 */

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProSearchApiService.php';

try {
    fr_pro_guard_method('GET');
    fr_pro_start_session();
    if (empty($_SESSION['authenticated'])) {
        fr_pro_json(401, ['ok' => false, 'error' => 'Unauthorized']);
    }
    fr_pro_require_active(
        ['ProSearch', \FileRise\Domain\ProSearchApiService::class],
        defined('FR_PRO_API_REQUIRE_SEARCH') ? (int)FR_PRO_API_REQUIRE_SEARCH : null
    );

    $ctx = fr_pro_current_user_context();
    @session_write_close();

    fr_pro_emit_result(
        \FileRise\Domain\ProSearchApiService::query(
            $_GET,
            $ctx['username'],
            $ctx['permissions']
        )
    );
} catch (Throwable $e) {
    fr_pro_json(500, ['ok' => false, 'error' => 'Internal error']);
}
