<?php

// public/api/admin/diskUsageDeleteSnapshot.php
/**
 * @OA\Post(
 *   path="/api/admin/diskUsageDeleteSnapshot.php",
 *   summary="Delete disk usage snapshot",
 *   description="Deletes the cached disk usage snapshot file.",
 *   operationId="adminDiskUsageDeleteSnapshot",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=false, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=false,
 *     @OA\JsonContent(
 *       @OA\Property(property="sourceId", type="string", example="local")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Snapshot deleted"),
 *   @OA\Response(response=400, description="CSRF mismatch"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

fr_admin_start_session();
$body = fr_admin_read_json();
$result = \FileRise\Domain\AdminDiskUsageApiService::deleteSnapshot($_SERVER, $_SESSION, $_GET, $body);
fr_admin_emit_result($result);
