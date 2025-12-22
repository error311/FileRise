<?php
// public/api/updateUserPanel.php

    /**
     * @OA\Put(
     *     path="/api/updateUserPanel.php",
     *     summary="Update user panel settings",
     *     description="Updates user panel settings. Accessible to authenticated users. Accepts PUT or POST.",
     *     operationId="updateUserPanel",
     *     tags={"Users"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"totp_enabled"},
     *             @OA\Property(property="totp_enabled", type="boolean", example=false)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User panel updated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User panel updated: TOTP disabled")
     *         )
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
     *         response=400,
     *         description="Bad Request"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->updateUserPanel();
