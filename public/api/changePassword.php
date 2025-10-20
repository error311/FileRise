<?php
// public/api/changePassword.php

    /**
     * @OA\Post(
     *     path="/api/changePassword.php",
     *     summary="Change user password",
     *     description="Allows an authenticated user to change their password by verifying the old password and updating to a new one.",
     *     operationId="changePassword",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"oldPassword", "newPassword", "confirmPassword"},
     *             @OA\Property(property="oldPassword", type="string", example="oldpass123"),
     *             @OA\Property(property="newPassword", type="string", example="newpass456"),
     *             @OA\Property(property="confirmPassword", type="string", example="newpass456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Password updated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Password updated successfully.")
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
     *         description="Invalid CSRF token"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->changePassword();