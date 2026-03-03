<?php

declare(strict_types=1);

// public/api/pro/audit/exportCsv.php
/**
 * @OA\Get(
 *   path="/api/pro/audit/exportCsv.php",
 *   summary="Export audit log as CSV",
 *   description="Exports audit log entries as CSV.",
 *   operationId="proAuditExportCsv",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="folder", in="query", required=false, @OA\Schema(type="string"), example="team"),
 *   @OA\Parameter(name="user", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="action", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="source", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="storage", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="from", in="query", required=false, @OA\Schema(type="string"), description="ISO timestamp or epoch"),
 *   @OA\Parameter(name="to", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1, maximum=5000), example=1000),
 *   @OA\Response(
 *     response=200,
 *     description="CSV stream",
 *     content={"text/csv": @OA\MediaType(mediaType="text/csv")}
 *   ),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
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

    $prepared = \FileRise\Domain\ProAuditApiService::prepareCsvExport(
        $_GET,
        $ctx['username'],
        $ctx['permissions']
    );

    if (($prepared['status'] ?? 500) !== 200) {
        fr_pro_emit_result($prepared);
    }

    $payload = $prepared['payload'] ?? [];
    if (!is_array($payload) || empty($payload['ok'])) {
        fr_pro_json(500, ['ok' => false, 'error' => 'export_failed']);
    }

    $filters = isset($payload['filters']) && is_array($payload['filters']) ? $payload['filters'] : [];
    $limit = isset($payload['limit']) ? (int)$payload['limit'] : 1000;

    header_remove('Content-Type');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="filerise-audit.csv"');

    $result = \FileRise\Domain\ProAuditApiService::exportCsv($filters, $limit);
    if (empty($result['ok'])) {
        fr_pro_json(500, [
            'ok' => false,
            'error' => $result['error'] ?? 'export_failed',
        ]);
    }
} catch (Throwable $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 599) {
        $status = 500;
    }

    fr_pro_json($status, [
        'ok' => false,
        'error' => $e->getMessage(),
    ]);
}
