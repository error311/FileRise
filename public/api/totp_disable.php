<?php
// public/api/totp_disable.php

    /**
     * @OA\Put(
     *     path="/api/totp_disable.php",
     *     summary="Disable TOTP for the authenticated user",
     *     description="Clears the TOTP secret from the users file for the current user.",
     *     operationId="disableTOTP",
     *     tags={"TOTP"},
     *     @OA\Response(
     *         response=200,
     *         description="TOTP disabled successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true),
     *             @OA\Property(property="message", type="string", example="TOTP disabled successfully.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Not authenticated or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Failed to disable TOTP"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->disableTOTP();