<?php
// public/api/auth/token.php

    /**
     * @OA\Get(
     *     path="/api/auth/token.php",
     *     summary="Retrieve CSRF token and share URL",
     *     description="Returns the current CSRF token along with the configured share URL.",
     *     operationId="getToken",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=200,
     *         description="CSRF token and share URL",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="csrf_token", type="string", example="0123456789abcdef..."),
     *             @OA\Property(property="share_url", type="string", example="https://yourdomain.com/share.php")
     *         )
     *     )
     * )
     *
     * Returns the CSRF token and share URL.
     *
     * @return void Outputs the JSON response.
     */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AuthController.php';

$authController = new AuthController();
$authController->getToken();