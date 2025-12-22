<?php
// public/api/upload/upload.php

/**
 * @OA\Post(
 *   path="/api/upload/upload.php",
 *   summary="Upload a file (supports chunked + full uploads)",
 *   description="Requires a session (cookie) and a CSRF token (header preferred; falls back to form field). Checks user/account flags and folder-level WRITE ACL, then delegates to the model. Returns JSON for chunked uploads; full uploads may redirect after success.",
 *   operationId="handleUpload",
 *   tags={"Uploads"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(
 *     name="X-CSRF-Token", in="header", required=false,
 *     description="CSRF token for this session (preferred). If omitted, send as form field `csrf_token`.",
 *     @OA\Schema(type="string")
 *   ),
 *   @OA\RequestBody(
 *     required=true,
 *     content={
 *       "multipart/form-data": @OA\MediaType(
 *         mediaType="multipart/form-data",
 *         @OA\Schema(
 *           type="object",
 *           required={"fileToUpload"},
 *           @OA\Property(
 *             property="fileToUpload", type="string", format="binary",
 *             description="File or chunk payload."
 *           ),
 *           @OA\Property(
 *             property="folder", type="string", example="root",
 *             description="Target folder (defaults to 'root' if omitted)."
 *           ),
 *           @OA\Property(property="csrf_token", type="string", description="CSRF token (form fallback)."),
 *           @OA\Property(property="upload_token", type="string", description="Legacy alias for CSRF token (accepted by server)."),
 *           @OA\Property(property="resumableChunkNumber", type="integer"),
 *           @OA\Property(property="resumableTotalChunks", type="integer"),
 *           @OA\Property(property="resumableChunkSize", type="integer"),
 *           @OA\Property(property="resumableCurrentChunkSize", type="integer"),
 *           @OA\Property(property="resumableTotalSize", type="integer"),
 *           @OA\Property(property="resumableType", type="string"),
 *           @OA\Property(property="resumableIdentifier", type="string"),
 *           @OA\Property(property="resumableFilename", type="string"),
 *           @OA\Property(property="resumableRelativePath", type="string")
 *         )
 *       )
 *     }
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="JSON result (success, chunk status, or CSRF refresh).",
 *     @OA\JsonContent(
 *       oneOf={
 *         @OA\Schema(
 *           type="object",
 *           @OA\Property(property="success", type="string", example="File uploaded successfully"),
 *           @OA\Property(property="newFilename", type="string", example="5f2d7c123a_example.png")
 *         ),
 *         @OA\Schema(
 *           type="object",
 *           @OA\Property(property="status", type="string", example="chunk uploaded")
 *         ),
 *         @OA\Schema(
 *           type="object",
 *           @OA\Property(property="csrf_expired", type="boolean", example=true),
 *           @OA\Property(property="csrf_token", type="string", example="b1c2...f9")
 *         )
 *       }
 *     )
 *   ),
 *   @OA\Response(
 *     response=302,
 *     description="Redirect after a successful full upload.",
 *     @OA\Header(header="Location", description="Where the client is redirected", @OA\Schema(type="string"))
 *   ),
 *   @OA\Response(response=400, description="Bad request (missing/invalid fields, model error)"),
 *   @OA\Response(response=401, description="Unauthorized (no session)"),
 *   @OA\Response(response=403, description="Forbidden (upload disabled or no WRITE to folder)"),
 *   @OA\Response(response=500, description="Server error while processing upload")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UploadController.php';

$uploadController = new UploadController();
$uploadController->handleUpload();
