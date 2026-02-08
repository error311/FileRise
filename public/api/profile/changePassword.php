<?php
// public/api/profile/changePassword.php

    /**
     * @OA\Post(
     *     path="/api/profile/changePassword.php",
     *     summary="Change user password",
     *     description="Allows an authenticated user to change their password by verifying the old password and updating to a new one.",
     *     operationId="changePassword",
     *     tags={"Users"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
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
     *     ),
     *     @OA\Response(
     *         response=405,
     *         description="Method not allowed"
     *     )
     * )
     */

require_once __DIR__ . '/../../../config/config.php';

$userController = new \FileRise\Http\Controllers\UserController();
$userController->changePassword();
