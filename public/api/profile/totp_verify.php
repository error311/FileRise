<?php
// public/api/profile/totp_verify.php

    /**
     * @OA\Post(
     *     path="/api/profile/totp_verify.php",
     *     summary="Verify TOTP code",
     *     description="Verifies a TOTP code and completes login for pending users or validates TOTP for setup verification.",
     *     operationId="verifyTOTP",
     *     tags={"TOTP"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"totp_code"},
     *             @OA\Property(property="totp_code", type="string", example="123456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="TOTP successfully verified",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok"),
     *             @OA\Property(property="message", type="string", example="Login successful")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., invalid input)"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Not authenticated or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many attempts. Try again later."
     *     )
     * )
     */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';

$userController = new \FileRise\Http\Controllers\UserController();
$userController->verifyTOTP();
