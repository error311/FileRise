<?php
/**
 * @OA\Get(
 *   path="/api/onlyoffice/status.php",
 *   summary="ONLYOFFICE availability & supported extensions",
 *   tags={"ONLYOFFICE"},
 *   @OA\Response(response=200, description="Status JSON")
 * )
 */
declare(strict_types=1);
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/OnlyOfficeController.php';
(new OnlyOfficeController())->status();