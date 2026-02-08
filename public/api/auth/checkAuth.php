<?php
// public/api/auth/checkAuth.php

/**
 * @OA\Get(
 *   path="/api/auth/checkAuth.php",
 *   summary="Check authentication status",
 *   operationId="checkAuth",
 *   tags={"Auth"},
 *   @OA\Response(
 *     response=200,
 *     description="Authenticated status or setup flag",
 *     @OA\JsonContent(
 *       oneOf={
 *         @OA\Schema(
 *           type="object",
 *           @OA\Property(property="authenticated", type="boolean", example=true),
 *           @OA\Property(property="isAdmin", type="boolean", example=true),
 *           @OA\Property(property="totp_enabled", type="boolean", example=false),
 *           @OA\Property(property="username", type="string", example="johndoe"),
 *           @OA\Property(property="folderOnly", type="boolean", example=false)
 *         ),
 *         @OA\Schema(
 *           type="object",
 *           @OA\Property(property="setup", type="boolean", example=true)
 *         )
 *       }
 *     )
 *   )
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$authController = new \FileRise\Http\Controllers\AuthController();
$authController->checkAuth();