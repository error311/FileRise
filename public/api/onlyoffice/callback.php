<?php
/**
 * @OA\Post(
 *   path="/api/onlyoffice/callback.php",
 *   summary="ONLYOFFICE save callback",
 *   tags={"ONLYOFFICE"},
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="OK / error JSON")
 * )
 */
declare(strict_types=1);
require_once __DIR__ . '/../../../config/config.php';
(new \FileRise\Http\Controllers\OnlyOfficeController())->callback();
