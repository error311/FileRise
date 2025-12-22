<?php
// public/api/admin/updateConfig.php

/**
 * @OA\Put(
 *   path="/api/admin/updateConfig.php",
 *   summary="Update admin configuration",
 *   description="Merges the provided settings into the on-disk configuration and persists them. Requires an authenticated admin session and a valid CSRF token. When OIDC is enabled (disableOIDCLogin=false), `providerUrl`, `redirectUri`, and `clientId` are required and must be HTTPS (HTTP allowed only for localhost).",
 *   operationId="updateAdminConfig",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}, "CsrfHeader": {}}},
 *
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(ref="#/components/schemas/AdminUpdateConfigRequest")
 *   ),
 *
 *   @OA\Response(
 *     response=200,
 *     description="Configuration updated",
 *     @OA\JsonContent(ref="#/components/schemas/SimpleSuccess")
 *   ),
 *   @OA\Response(
 *     response=400,
 *     description="Validation error (e.g., bad authHeaderName, missing OIDC fields when enabled, or negative upload limit)",
 *     @OA\JsonContent(ref="#/components/schemas/SimpleError")
 *   ),
 *   @OA\Response(
 *     response=403,
 *     description="Unauthorized access or invalid CSRF token",
 *     @OA\JsonContent(ref="#/components/schemas/SimpleError")
 *   ),
 *   @OA\Response(
 *     response=500,
 *     description="Server error while loading or saving configuration",
 *     @OA\JsonContent(ref="#/components/schemas/SimpleError")
 *   )
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

$adminController = new AdminController();
$adminController->updateConfig();
