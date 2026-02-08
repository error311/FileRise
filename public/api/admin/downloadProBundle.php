<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/admin/downloadProBundle.php",
 *   summary="Download and install latest Pro bundle",
 *   description="Downloads the latest FileRise Pro bundle from filerise.net and installs it.",
 *   operationId="adminDownloadProBundle",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Install result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=413, description="Bundle too large"),
 *   @OA\Response(response=502, description="Remote download failed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';

$controller = new \FileRise\Http\Controllers\AdminController();
$controller->downloadProBundle();
