<?php
// public/api/admin/getConfig.php

/**
 * @OA\Get(
 *   path="/api/admin/getConfig.php",
 *   tags={"Admin"},
 *   summary="Get UI configuration",
 *   description="Returns a public subset for everyone; authenticated admins receive additional loginOptions fields.",
 *   operationId="getAdminConfig",
 *   @OA\Response(
 *     response=200,
 *     description="Configuration loaded",
 *     @OA\JsonContent(
 *       oneOf={
 *         @OA\Schema(ref="#/components/schemas/AdminGetConfigPublic"),
 *         @OA\Schema(ref="#/components/schemas/AdminGetConfigAdmin")
 *       }
 *     )
 *   ),
 *   @OA\Response(response=500, description="Server error")
 * )
 *
 * Retrieves the admin configuration settings and outputs JSON.
 * @return void
 */

require_once __DIR__ . '/../../../config/config.php';

$adminController = new \FileRise\Http\Controllers\AdminController();
$adminController->getConfig();