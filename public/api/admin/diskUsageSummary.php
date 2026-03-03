<?php

// public/api/admin/diskUsageSummary.php
/**
 * @OA\Get(
 *   path="/api/admin/diskUsageSummary.php",
 *   summary="Get disk usage snapshot summary",
 *   description="Returns snapshot summary and optional scan log tail.",
 *   operationId="adminDiskUsageSummary",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="topFolders", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=5),
 *   @OA\Parameter(name="topFiles", in="query", required=false, @OA\Schema(type="integer", minimum=0), example=0),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Summary payload"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=404, description="Snapshot not found"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

fr_admin_start_session();
$result = \FileRise\Domain\AdminDiskUsageApiService::summary($_GET, $_SESSION);
fr_admin_emit_result($result);
