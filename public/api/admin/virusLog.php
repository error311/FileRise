<?php
// public/api/admin/virusLog.php
/**
 * @OA\Get(
 *   path="/api/admin/virusLog.php",
 *   summary="Fetch virus detections log",
 *   description="Returns virus detections as JSON or CSV (Pro only).",
 *   operationId="adminVirusLog",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=200),
 *   @OA\Parameter(name="format", in="query", required=false, @OA\Schema(type="string", enum={"json","csv"}), example="json"),
 *   @OA\Response(response=200, description="Log entries or CSV"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

AdminController::virusLog();
