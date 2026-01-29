<?php
// src/openapi/Components.php

use OpenApi\Annotations as OA;

/**
 * @OA\Info(
 *   title="FileRise API",
 *   version="2.11.1"
 * )
 *
 * @OA\Server(
 *   url="/",
 *   description="Same-origin server"
 * )
 *
 * @OA\Tag(
 *   name="Admin",
 *   description="Admin endpoints"
 * )
 *
 * @OA\Components(
 *   @OA\SecurityScheme(
 *     securityScheme="cookieAuth",
 *     type="apiKey",
 *     in="cookie",
 *     name="PHPSESSID",
 *     description="Session cookie used for authenticated endpoints"
 *   ),
 *   @OA\SecurityScheme(
 *     securityScheme="CsrfHeader",
 *     type="apiKey",
 *     in="header",
 *     name="X-CSRF-Token",
 *     description="CSRF token header required for state-changing requests"
 *   ),
 *
 *   @OA\Response(
 *     response="Unauthorized",
 *     description="Unauthorized (no session)",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="error", type="string", example="Unauthorized")
 *     )
 *   ),
 *   @OA\Response(
 *     response="Forbidden",
 *     description="Forbidden (not enough privileges)",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="error", type="string", example="Invalid CSRF token.")
 *     )
 *   ),
 *
 *   @OA\Schema(
 *     schema="SimpleSuccess",
 *     type="object",
 *     @OA\Property(property="success", type="boolean", example=true)
 *   ),
 *   @OA\Schema(
 *     schema="SimpleError",
 *     type="object",
 *     @OA\Property(property="error", type="string", example="Something went wrong")
 *   ),
 *
 *   @OA\Schema(
 *     schema="ShareLinkEntry",
 *     type="object",
 *     @OA\Property(property="folder", type="string", example="root"),
 *     @OA\Property(property="file", type="string", example="invoice.pdf"),
 *     @OA\Property(property="expires", type="integer", format="int64", example=1735689600),
 *     @OA\Property(property="password", type="string", nullable=true, example="***"),
 *     @OA\Property(property="token", type="string", example="0123456789abcdef0123456789abcdef"),
 *     @OA\Property(property="sourceId", type="string", example="local"),
 *     @OA\Property(property="sourceName", type="string", example="Local")
 *   ),
 *   @OA\Schema(
 *     schema="ShareLinksMap",
 *     type="object",
 *     additionalProperties=@OA\AdditionalProperties(ref="#/components/schemas/ShareLinkEntry")
 *   ),
 *
 *   @OA\Schema(
 *     schema="ShareFolderLinkEntry",
 *     type="object",
 *     @OA\Property(property="folder", type="string", example="shared/reports"),
 *     @OA\Property(property="expires", type="integer", format="int64", example=1735689600),
 *     @OA\Property(property="password", type="string", nullable=true, example="***"),
 *     @OA\Property(property="allowUpload", type="integer", example=1),
 *     @OA\Property(property="token", type="string", example="0123456789abcdef0123456789abcdef"),
 *     @OA\Property(property="sourceId", type="string", example="local"),
 *     @OA\Property(property="sourceName", type="string", example="Local")
 *   ),
 *   @OA\Schema(
 *     schema="ShareFolderLinksMap",
 *     type="object",
 *     additionalProperties=@OA\AdditionalProperties(ref="#/components/schemas/ShareFolderLinkEntry")
 *   ),
 *
 *   @OA\Schema(
 *     schema="LoginOptionsPublic",
 *     type="object",
 *     @OA\Property(property="disableFormLogin", type="boolean"),
 *     @OA\Property(property="disableBasicAuth", type="boolean"),
 *     @OA\Property(property="disableOIDCLogin", type="boolean")
 *   ),
 *   @OA\Schema(
 *     schema="LoginOptionsAdminExtra",
 *     type="object",
 *     @OA\Property(property="authBypass", type="boolean", nullable=true),
 *     @OA\Property(property="authHeaderName", type="string", nullable=true, example="X-Remote-User")
 *   ),
 *   @OA\Schema(
 *     schema="OIDCConfigPublic",
 *     type="object",
 *     @OA\Property(property="providerUrl", type="string", example="https://accounts.example.com"),
 *     @OA\Property(property="redirectUri", type="string", example="https://your.filerise.app/callback")
 *   ),
 *
 *   @OA\Schema(
 *     schema="AdminGetConfigPublic",
 *     type="object",
 *     required={"header_title","loginOptions","globalOtpauthUrl","enableWebDAV","sharedMaxUploadSize","uploads","oidc"},
 *     @OA\Property(property="header_title", type="string", example="FileRise"),
 *     @OA\Property(property="loginOptions", ref="#/components/schemas/LoginOptionsPublic"),
 *     @OA\Property(property="globalOtpauthUrl", type="string"),
 *     @OA\Property(property="enableWebDAV", type="boolean"),
 *     @OA\Property(property="sharedMaxUploadSize", type="integer", format="int64"),
 *     @OA\Property(
 *       property="uploads",
 *       type="object",
 *       additionalProperties=false,
 *       @OA\Property(property="resumableChunkMb", type="number", format="float", minimum=0.5, maximum=100, example=1.5),
 *       @OA\Property(property="resumableTtlHours", type="number", format="float", minimum=0.5, maximum=168, example=6)
 *     ),
 *     @OA\Property(property="oidc", ref="#/components/schemas/OIDCConfigPublic")
 *   ),
 *   @OA\Schema(
 *     schema="AdminGetConfigAdmin",
 *     allOf={
 *       @OA\Schema(ref="#/components/schemas/AdminGetConfigPublic"),
 *       @OA\Schema(
 *         type="object",
 *         @OA\Property(
 *           property="loginOptions",
 *           allOf={
 *             @OA\Schema(ref="#/components/schemas/LoginOptionsPublic"),
 *             @OA\Schema(ref="#/components/schemas/LoginOptionsAdminExtra")
 *           }
 *         )
 *       )
 *     }
 *   ),
 *
 *   @OA\Schema(
 *     schema="AdminUpdateConfigRequest",
 *     type="object",
 *     additionalProperties=false,
 *     @OA\Property(property="header_title", type="string", maxLength=100, example="FileRise"),
 *     @OA\Property(
 *       property="loginOptions",
 *       type="object",
 *       additionalProperties=false,
 *       @OA\Property(property="disableFormLogin", type="boolean", example=false),
 *       @OA\Property(property="disableBasicAuth", type="boolean", example=false),
 *       @OA\Property(property="disableOIDCLogin", type="boolean", example=true, description="false = OIDC enabled"),
 *       @OA\Property(property="authBypass", type="boolean", example=false),
 *       @OA\Property(
 *         property="authHeaderName",
 *         type="string",
 *         pattern="^[A-Za-z0-9\\-]+$",
 *         example="X-Remote-User",
 *         description="Letters/numbers/dashes only"
 *       )
 *     ),
 *     @OA\Property(property="globalOtpauthUrl", type="string", example="otpauth://totp/{label}?secret={secret}&issuer=FileRise"),
 *     @OA\Property(property="enableWebDAV", type="boolean", example=false),
 *     @OA\Property(property="sharedMaxUploadSize", type="integer", format="int64", minimum=0, example=52428800),
 *     @OA\Property(
 *       property="uploads",
 *       type="object",
 *       additionalProperties=false,
 *       @OA\Property(property="resumableChunkMb", type="number", format="float", minimum=0.5, maximum=100, example=1.5),
 *       @OA\Property(property="resumableTtlHours", type="number", format="float", minimum=0.5, maximum=168, example=6)
 *     ),
 *     @OA\Property(
 *       property="oidc",
 *       type="object",
 *       additionalProperties=false,
 *       description="When disableOIDCLogin=false (OIDC enabled), providerUrl, redirectUri, and clientId are required.",
 *       @OA\Property(property="providerUrl", type="string", format="uri", example="https://issuer.example.com"),
 *       @OA\Property(property="clientId", type="string", example="my-client-id"),
 *       @OA\Property(property="clientSecret", type="string", writeOnly=true, example="***"),
 *       @OA\Property(property="redirectUri", type="string", format="uri", example="https://app.example.com/auth/callback")
 *     )
 *   )
 * )
 *
 * @OA\RequestBody(
 *   request="MoveFilesRequest",
 *   required=true,
 *   @OA\JsonContent(
 *     type="object",
 *     required={"source","destination","files"},
 *     @OA\Property(property="source", type="string", example="inbox"),
 *     @OA\Property(property="destination", type="string", example="archive"),
 *     @OA\Property(property="files", type="array", @OA\Items(type="string"))
 *   )
 * )
 */
final class OpenAPIComponents {}
