<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/admin/setEncryptionKey.php",
 *   summary="Configure encryption master key",
 *   description="Generates or clears the encryption master key file.",
 *   operationId="adminSetEncryptionKey",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"action"},
 *       @OA\Property(property="action", type="string", enum={"generate","clear"}),
 *       @OA\Property(property="force", type="boolean", example=false)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Operation result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=409, description="Conflict"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

$ctrl = new AdminController();
$ctrl->setEncryptionKey();
