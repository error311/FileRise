<?php
// public/api/profile/totp_setup.php

    /**
     * @OA\Get(
     *     path="/api/profile/totp_setup.php",
     *     summary="Set up TOTP and generate a QR code",
     *     description="Generates a new TOTP secret for an authenticated user and builds a QR code image for scanning.",
     *     operationId="setupTOTP",
     *     tags={"TOTP"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\Response(
     *         response=200,
     *         description="QR code image for TOTP setup",
     *         @OA\MediaType(
     *             mediaType="image/png"
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Missing username"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Not authorized or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=409,
     *         description="TOTP is already configured"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error"
     *     )
     * )
     */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';

$userController = new \FileRise\Http\Controllers\UserController();
$userController->setupTOTP();
