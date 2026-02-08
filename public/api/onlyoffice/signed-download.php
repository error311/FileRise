<?php
/**
 * @OA\Get(
 *   path="/api/onlyoffice/signed-download.php",
 *   summary="Serve a signed file blob to ONLYOFFICE",
 *   tags={"ONLYOFFICE"},
 *   @OA\Parameter(name="tok", in="query", required=true, @OA\Schema(type="string")),
 *   @OA\Response(response=200, description="File stream"),
 *   @OA\Response(response=403, description="Signature/expiry invalid")
 * )
 */
declare(strict_types=1);
require_once __DIR__ . '/../../../config/config.php';
(new \FileRise\Http\Controllers\OnlyOfficeController())->signedDownload();