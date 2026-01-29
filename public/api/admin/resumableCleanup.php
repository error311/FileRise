<?php
// public/api/admin/resumableCleanup.php
/**
 * @OA\Post(
 *   path="/api/admin/resumableCleanup.php",
 *   summary="Run resumable upload cleanup sweep",
 *   description="Deletes expired resumable upload temp folders using the configured TTL.",
 *   operationId="adminResumableCleanup",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}, "CsrfHeader": {}}},
 *
 *   @OA\RequestBody(
 *     required=false,
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="all", type="boolean", example=true, description="Sweep all sources when supported"),
 *       @OA\Property(property="purgeAll", type="boolean", example=true, description="Remove all resumable temp folders, ignoring TTL"),
 *       @OA\Property(property="sourceId", type="string", example="local", description="Optional source id to sweep")
 *     )
 *   ),
 *
 *   @OA\Response(
 *     response=200,
 *     description="Cleanup results",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="success", type="boolean", example=true),
 *       @OA\Property(property="checked", type="integer", example=12),
 *       @OA\Property(property="removed", type="integer", example=3),
 *       @OA\Property(property="remaining", type="integer", example=2),
 *       @OA\Property(property="sources", type="integer", example=1)
 *     )
 *   ),
 *   @OA\Response(response=400, description="Bad request"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

AdminController::resumableCleanup();
