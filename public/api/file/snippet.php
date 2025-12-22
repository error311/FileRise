<?php
// public/api/file/snippet.php
declare(strict_types=1);

/**
 * @OA\Get(
 *   path="/api/file/snippet.php",
 *   summary="Get a small text snippet from a file for hover previews",
 *   description="Returns a short UTF-8 text snippet from supported file types (txt, md, csv, code, DOCX, XLSX, PPTX, etc.) for use in quick previews.",
 *   operationId="getFileSnippet",
 *   tags={"Files"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(
 *     name="folder",
 *     in="query",
 *     required=false,
 *     description="Logical folder path (e.g. root, clients/acme)",
 *     @OA\Schema(type="string")
 *   ),
 *   @OA\Parameter(
 *     name="file",
 *     in="query",
 *     required=true,
 *     description="File name",
 *     @OA\Schema(type="string")
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="Snippet JSON",
 *     @OA\JsonContent(
 *       @OA\Property(property="snippet", type="string"),
 *       @OA\Property(property="truncated", type="boolean")
 *     )
 *   ),
 *   @OA\Response(response=400, description="Missing/invalid input"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=404, description="File not found"),
 *   @OA\Response(response=500, description="Internal error")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

$controller = new FileController();
$controller->snippet();
