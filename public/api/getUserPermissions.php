<?php
// public/api/getUserPermissions.php

    /**
     * @OA\Get(
     *     path="/api/getUserPermissions.php",
     *     summary="Retrieve user permissions",
     *     description="Returns the permissions for the current user, or all permissions if the user is an admin.",
     *     operationId="getUserPermissions",
     *     tags={"Users"},
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

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->getUserPermissions();