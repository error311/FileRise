<?php
// public/api/totp_recover.php

    /**
     * @OA\Post(
     *     path="/api/totp_recover.php",
     *     summary="Recover TOTP",
     *     description="Verifies a recovery code to disable TOTP and finalize login.",
     *     operationId="recoverTOTP",
     *     tags={"TOTP"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"recovery_code"},
     *             @OA\Property(property="recovery_code", type="string", example="ABC123DEF456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Recovery successful",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid input or recovery code"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=405,
     *         description="Method not allowed"
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many attempts"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->recoverTOTP();
