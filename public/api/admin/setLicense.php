<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/admin/setLicense.php",
 *   summary="Set Pro license key",
 *   description="Stores the FileRise Pro license key.",
 *   operationId="adminSetLicense",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"license"},
 *       @OA\Property(property="license", type="string", example="FRPRO-XXXX-XXXX")
 *     )
 *   ),
 *   @OA\Response(response=200, description="License stored"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

$ctrl = new AdminController();
$ctrl->setLicense();
