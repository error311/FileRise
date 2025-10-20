<?php
// public/api/getUsers.php

    /**
     * @OA\Get(
     *     path="/api/getUsers.php",
     *     summary="Retrieve a list of users",
     *     description="Returns a JSON array of users. Only available to authenticated admin users.",
     *     operationId="getUsers",
     *     tags={"Users"},
     *     @OA\Response(
     *         response=200,
     *         description="Successful response with an array of users",
     *         @OA\JsonContent(
     *             type="array",
     *             @OA\Items(
     *                 type="object",
     *                 @OA\Property(property="username", type="string", example="johndoe"),
     *                 @OA\Property(property="role", type="string", example="admin")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized: the user is not authenticated or is not an admin"
     *     )
     * )
     */

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->getUsers(); // This will output the JSON response