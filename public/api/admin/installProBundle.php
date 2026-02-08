<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/admin/installProBundle.php",
 *   summary="Install Pro bundle",
 *   description="Uploads and installs a FileRise Pro bundle zip.",
 *   operationId="adminInstallProBundle",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\MediaType(
 *       mediaType="multipart/form-data",
 *       @OA\Schema(
 *         required={"bundle"},
 *         @OA\Property(property="bundle", type="string", format="binary")
 *       )
 *     )
 *   ),
 *   @OA\Response(response=200, description="Install result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=413, description="Bundle too large"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$controller = new \FileRise\Http\Controllers\AdminController();
$controller->installProBundle();
