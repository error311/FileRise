<?php

// public/api/admin/diskUsageTriggerScan.php
/**
 * @OA@Post(
 *   path="/api/admin/diskUsageTriggerScan.php",
 *   summary="Trigger disk usage scan",
 *   description="Starts a background disk usage scan to build a new snapshot.",
 *   operationId="adminDiskUsageTriggerScan",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\RequestBody(
 *     required=false,
 *     @OA\JsonContent(
 *       @OA\Property(property="sourceId", type="string", example="local")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Scan started"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

fr_admin_start_session();
$body = fr_admin_read_json();
$result = \FileRise\Domain\AdminDiskUsageApiService::triggerScan($_SERVER, $_SESSION, $_GET, $body);
fr_admin_emit_result($result);
