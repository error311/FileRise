<?php

declare(strict_types=1);

// public/api/pro/audit/list.php
/**
 * @OA\Get(
 *   path="/api/pro/audit/list.php",
 *   summary="List audit log entries",
 *   description="Returns audit log entries for admins, or for a specific folder when non-admin.",
 *   operationId="proAuditList",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="team"),
 *   @OA\Parameter(name="user", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="action", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="source", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="storage", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="from", in="query", required=false, @OA\Schema(type="string"), description="ISO timestamp or epoch"),
 *   @OA\Parameter(name="to", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1, maximum=500), example=200),
 *   @OA\Response(response=200, description="Audit list payload"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden or Pro required")
 * )
 */

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProAuditApiService.php';

try {
    fr_pro_guard_method('GET');
    fr_pro_start_session();
    if (empty($_SESSION['authenticated'])) {
        fr_pro_json(401, ['ok' => false, 'error' => 'Unauthorized']);
    }
    fr_pro_require_active(
        ['ProAudit', \FileRise\Domain\ProAuditApiService::class],
        defined('FR_PRO_API_REQUIRE_AUDIT') ? (int)FR_PRO_API_REQUIRE_AUDIT : null,
        'pro_required'
    );

    $ctx = fr_pro_current_user_context();
    @session_write_close();

    $result = \FileRise\Domain\ProAuditApiService::list(
        $_GET,
        $ctx['username'],
        $ctx['permissions']
    );

    fr_pro_emit_result($result);
} catch (Throwable $e) {
    fr_pro_json(500, ['ok' => false, 'error' => 'server_error']);
}
