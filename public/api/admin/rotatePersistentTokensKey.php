<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/admin/rotatePersistentTokensKey.php",
 *   summary="Rotate persistent tokens key",
 *   description="Generates a new persistent tokens key, re-encrypts stored secrets, and expires remember-me sessions. Requires an authenticated admin session and CSRF token.",
 *   operationId="adminRotatePersistentTokensKey",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"confirmRememberMeExpiry","confirmMaintenanceWindow"},
 *       @OA\Property(property="confirmRememberMeExpiry", type="boolean", example=true),
 *       @OA\Property(property="confirmMaintenanceWindow", type="boolean", example=true)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Rotation result"),
 *   @OA\Response(response=400, description="Missing confirmation"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=409, description="Rotation not allowed in current deployment mode"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$ctrl = new \FileRise\Http\Controllers\AdminController();
$ctrl->rotatePersistentTokensKey();
