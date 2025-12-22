<?php
// public/api/updateUserPermissions.php

   /**
     * @OA\Put(
     *     path="/api/updateUserPermissions.php",
     *     summary="Update user permissions",
     *     description="Updates permissions for users. Only available to authenticated admin users. Accepts PUT or POST.",
     *     operationId="updateUserPermissions",
     *     tags={"Users"},
     *     security={{"cookieAuth": {}}},
     *     @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"permissions"},
     *             @OA\Property(
     *                 property="permissions",
     *                 type="array",
     *                 @OA\Items(
     *                     type="object",
     *                     @OA\Property(property="username", type="string", example="johndoe"),
     *                     @OA\Property(property="folderOnly", type="boolean", example=true),
     *                     @OA\Property(property="readOnly", type="boolean", example=false),
     *                     @OA\Property(property="disableUpload", type="boolean", example=false)
     *                 )
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User permissions updated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User permissions updated successfully.")
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
$userController->updateUserPermissions();
