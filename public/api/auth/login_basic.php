<?php
// public/api/auth/login_basic.php

    /**
     * @OA\Get(
     *     path="/api/auth/login_basic.php",
     *     summary="Authenticate using HTTP Basic Authentication",
     *     description="Performs HTTP Basic authentication. If credentials are missing, sends a 401 response prompting for Basic auth. On valid credentials, optionally handles TOTP verification and finalizes session login.",
     *     operationId="loginBasic",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=200,
     *         description="Login successful; redirects to index.html",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="success", type="string", example="Login successful")
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized due to missing credentials or invalid credentials."
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many failed login attempts."
     *     )
     * )
     *
     * Handles HTTP Basic authentication (with optional TOTP) and logs the user in.
     *
     * @return void Redirects on success or sends a 401 header.
     */

require_once __DIR__ . '/../../../config/config.php';

$authController = new \FileRise\Http\Controllers\AuthController();
$authController->loginBasic();
