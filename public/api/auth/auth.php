<?php
// public/api/auth/auth.php

/**
     * @OA\Post(
     *     path="/api/auth/auth.php",
     *     summary="Authenticate user",
     *     description="Handles user authentication via OIDC or form-based credentials. For OIDC flows, processes callbacks; otherwise, performs standard authentication with optional TOTP verification.",
     *     operationId="authUser",
     *     tags={"Auth"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"username", "password"},
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="password", type="string", example="secretpassword"),
     *             @OA\Property(property="remember_me", type="boolean", example=true),
     *             @OA\Property(property="totp_code", type="string", example="123456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Login successful; returns user info and status",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok"),
     *             @OA\Property(property="success", type="string", example="Login successful"),
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="isAdmin", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., missing credentials)"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized (e.g., invalid credentials, too many attempts)"
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many failed login attempts"
     *     )
     * )
     *
     * Handles user authentication via OIDC or form-based login.
     *
     * @return void Redirects on success or outputs JSON error.
     */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';

$authController = new \FileRise\Http\Controllers\AuthController();
$authController->auth();