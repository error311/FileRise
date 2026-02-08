<?php
// public/api/admin/changeUserPassword.php
/**
 * @OA\Post(
 *   path="/api/admin/changeUserPassword.php",
 *   summary="Admin reset user password",
 *   description="Resets a user's password (admin only).",
 *   operationId="adminChangeUserPassword",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"username","newPassword"},
 *       @OA\Property(property="username", type="string", example="johndoe"),
 *       @OA\Property(property="newPassword", type="string", example="newpass123")
 *     )
 *   ),
 *   @OA\Response(response=200, description="Password updated"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=422, description="Validation error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';

$controller = new \FileRise\Http\Controllers\UserController();
$controller->adminChangeUserPassword();
