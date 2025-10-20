<?php
// public/api/addUser.php

    /**
     * @OA\Post(
     *     path="/api/addUser.php",
     *     summary="Add a new user",
     *     description="Adds a new user to the system. In setup mode, the new user is automatically made admin.",
     *     operationId="addUser",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"username", "password"},
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="password", type="string", example="securepassword"),
     *             @OA\Property(property="isAdmin", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User added successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User added successfully")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
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
$userController->addUser();