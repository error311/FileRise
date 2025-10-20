<?php
// public/api/totp_setup.php

    /**
     * @OA\Get(
     *     path="/api/totp_setup.php",
     *     summary="Set up TOTP and generate a QR code",
     *     description="Generates (or retrieves) the TOTP secret for the user and builds a QR code image for scanning.",
     *     operationId="setupTOTP",
     *     tags={"TOTP"},
     *     @OA\Response(
     *         response=200,
     *         description="QR code image for TOTP setup",
     *         @OA\MediaType(
     *             mediaType="image/png"
     *         )
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Unauthorized or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->setupTOTP();