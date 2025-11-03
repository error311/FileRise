<?php
/**
 * @OA\Post(
 *   path="/api/onlyoffice/callback.php",
 *   summary="ONLYOFFICE save callback",
 *   tags={"ONLYOFFICE"},
 *   @OA\Response(response=200, description="OK / error JSON")
 * )
 */
declare(strict_types=1);
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/OnlyOfficeController.php';
(new OnlyOfficeController())->callback();