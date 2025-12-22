<?php
// public/api/siteConfig.php
/**
 * @OA\Get(
 *   path="/api/siteConfig.php",
 *   summary="Get public site configuration",
 *   description="Returns the public site configuration used by the frontend.",
 *   operationId="getSiteConfig",
 *   tags={"Config"},
 *   @OA\Response(response=200, description="Site config payload"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */


require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->siteConfig();
