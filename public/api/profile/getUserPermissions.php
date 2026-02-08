<?php
// public/api/profile/getUserPermissions.php

    /**
     * @OA\Get(
     *     path="/api/profile/getUserPermissions.php",
     *     summary="Retrieve user permissions",
     *     description="Returns the permissions for the current user, or all permissions if the user is an admin.",
     *     operationId="getUserPermissions",
     *     tags={"Users"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Response(
     *         response=200,
     *         description="Successful response with user permissions",
     *         @OA\JsonContent(type="object")
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     )
     * )
     */

require_once __DIR__ . '/../../../config/config.php';

$userController = new \FileRise\Http\Controllers\UserController();
$userController->getUserPermissions();
