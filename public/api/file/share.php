<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/file/share.php",
 *   summary="Download a shared file",
 *   description="Returns a shared file stream. If a password is required, an HTML prompt is returned.",
 *   operationId="shareFileDownload",
 *   tags={"Shares"},
 *   @OA\Parameter(name="token", in="query", required=true, @OA\Schema(type="string"), description="Share token"),
 *   @OA\Parameter(name="pass", in="query", required=false, @OA\Schema(type="string"), description="Share password"),
 *   @OA\Parameter(name="view", in="query", required=false, @OA\Schema(type="integer", enum={0,1}), description="Render share landing page when set to 1"),
 *   @OA\Parameter(name="inline", in="query", required=false, @OA\Schema(type="integer", enum={0,1}), description="Allow inline rendering for safe types"),
 *   @OA\Response(
 *     response=200,
 *     description="File stream or password prompt",
 *     content={
 *       "application/octet-stream": @OA\MediaType(mediaType="application/octet-stream"),
 *       "text/html": @OA\MediaType(mediaType="text/html")
 *     }
 *   ),
 *   @OA\Response(response=400, description="Missing/invalid token"),
 *   @OA\Response(response=403, description="Forbidden or expired"),
 *   @OA\Response(response=404, description="Not found")
 * )
 */

// Buffer any accidental output so headers still work
if (ob_get_level() === 0) {
    ob_start();
}

// Never leak notices/warnings into the response (breaks headers + can leak paths)
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');

// Avoid deprecated notices being emitted at all (Termux/PHP 8.4+)
error_reporting(E_ALL & ~E_DEPRECATED);

require_once __DIR__ . '/../../../config/config.php';

(new \FileRise\Http\Controllers\FileController())->shareFile();
