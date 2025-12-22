<?php
// public/api/totp_saveCode.php

    /**
     * @OA\Post(
     *     path="/api/totp_saveCode.php",
     *     summary="Generate and save a new TOTP recovery code",
     *     description="Generates a new TOTP recovery code for the authenticated user, stores its hash, and returns the plain text recovery code.",
     *     operationId="totpSaveCode",
     *     tags={"TOTP"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\Response(
     *         response=200,
     *         description="Recovery code generated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok"),
     *             @OA\Property(property="recoveryCode", type="string", example="ABC123DEF456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or unauthorized"
     *     ),
     *     @OA\Response(
     *         response=405,
     *         description="Method not allowed"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->saveTOTPRecoveryCode();
