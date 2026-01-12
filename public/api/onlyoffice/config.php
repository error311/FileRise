<?php
/**
 * @OA\Get(
 *   path="/api/onlyoffice/config.php",
 *   summary="Get editor config for a file (signed URLs, callback)",
 *   tags={"ONLYOFFICE"},
 *   @OA\Parameter(name="folder", in="query", @OA\Schema(type="string")),
 *   @OA\Parameter(name="file",   in="query", @OA\Schema(type="string")),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="Editor config"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=404, description="Disabled / Not found")
 * )
 */
declare(strict_types=1);
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/OnlyOfficeController.php';
(new OnlyOfficeController())->config();
