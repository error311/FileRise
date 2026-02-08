<?php
// public/api/profile/totp_disable.php

    /**
     * @OA\Put(
     *     path="/api/profile/totp_disable.php",
     *     summary="Disable TOTP for the authenticated user",
     *     description="Clears the TOTP secret from the users file for the current user. Accepts PUT or POST.",
     *     operationId="disableTOTP",
     *     tags={"TOTP"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\Response(
     *         response=200,
     *         description="TOTP disabled successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true),
     *             @OA\Property(property="message", type="string", example="TOTP disabled successfully.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Missing username"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Not authenticated or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=405,
     *         description="Method not allowed"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Failed to disable TOTP"
     *     )
     * )
     */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';

$userController = new \FileRise\Http\Controllers\UserController();
$userController->disableTOTP();
