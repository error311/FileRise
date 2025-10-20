<?php
// public/api/removeUser.php

    /**
     * @OA\Delete(
     *     path="/api/removeUser.php",
     *     summary="Remove a user",
     *     description="Removes the specified user from the system. Cannot remove the currently logged-in user.",
     *     operationId="removeUser",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"username"},
     *             @OA\Property(property="username", type="string", example="johndoe")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User removed successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User removed successfully")
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
$userController->removeUser();