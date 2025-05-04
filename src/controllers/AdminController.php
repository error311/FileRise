<?php
// src/controllers/AdminController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';

class AdminController
{

    /**
     * @OA\Get(
     *     path="/api/admin/getConfig.php",
     *     summary="Retrieve admin configuration",
     *     description="Returns the admin configuration settings, decrypting the configuration file and providing default values if not set.",
     *     operationId="getAdminConfig",
     *     tags={"Admin"},
     *     @OA\Response(
     *         response=200,
     *         description="Configuration retrieved successfully",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="header_title", type="string", example="FileRise"),
     *             @OA\Property(
     *                 property="oidc",
     *                 type="object",
     *                 @OA\Property(property="providerUrl", type="string", example="https://your-oidc-provider.com"),
     *                 @OA\Property(property="clientId", type="string", example="YOUR_CLIENT_ID"),
     *                 @OA\Property(property="clientSecret", type="string", example="YOUR_CLIENT_SECRET"),
     *                 @OA\Property(property="redirectUri", type="string", example="https://yourdomain.com/auth.php?oidc=callback")
     *             ),
     *             @OA\Property(
     *                 property="loginOptions",
     *                 type="object",
     *                 @OA\Property(property="disableFormLogin", type="boolean", example=false),
     *                 @OA\Property(property="disableBasicAuth", type="boolean", example=false),
     *                 @OA\Property(property="disableOIDCLogin", type="boolean", example=false)
     *             ),
     *             @OA\Property(property="globalOtpauthUrl", type="string", example=""),
     *             @OA\Property(property="enableWebDAV", type="boolean", example=false),
     *             @OA\Property(property="sharedMaxUploadSize", type="integer", example=52428800)
     *         )
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Failed to decrypt configuration or server error"
     *     )
     * )
     *
     * Retrieves the admin configuration settings.
     *
     * @return void Outputs a JSON response with configuration data.
     */
    public function getConfig(): void
    {
        header('Content-Type: application/json');
        $config = AdminModel::getConfig();

        // If an error was encountered, send a 500 status.
        if (isset($config['error'])) {
            http_response_code(500);
        }
        echo json_encode($config);
        exit;
    }

    /**
     * @OA\Put(
     *     path="/api/admin/updateConfig.php",
     *     summary="Update admin configuration",
     *     description="Updates the admin configuration settings. Requires admin privileges and a valid CSRF token.",
     *     operationId="updateAdminConfig",
     *     tags={"Admin"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"header_title", "oidc", "loginOptions"},
     *             @OA\Property(property="header_title", type="string", example="FileRise"),
     *             @OA\Property(
     *                 property="oidc",
     *                 type="object",
     *                 @OA\Property(property="providerUrl", type="string", example="https://your-oidc-provider.com"),
     *                 @OA\Property(property="clientId", type="string", example="YOUR_CLIENT_ID"),
     *                 @OA\Property(property="clientSecret", type="string", example="YOUR_CLIENT_SECRET"),
     *                 @OA\Property(property="redirectUri", type="string", example="https://yourdomain.com/api/auth/auth.php?oidc=callback")
     *             ),
     *             @OA\Property(
     *                 property="loginOptions",
     *                 type="object",
     *                 @OA\Property(property="disableFormLogin", type="boolean", example=false),
     *                 @OA\Property(property="disableBasicAuth", type="boolean", example=false),
     *                 @OA\Property(property="disableOIDCLogin", type="boolean", example=false)
     *             ),
     *             @OA\Property(property="globalOtpauthUrl", type="string", example=""),
     *             @OA\Property(property="enableWebDAV", type="boolean", example=false),
     *             @OA\Property(property="sharedMaxUploadSize", type="integer", example=52428800)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Configuration updated successfully",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="success", type="string", example="Configuration updated successfully.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., invalid input, incomplete OIDC configuration)"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Unauthorized (user not admin or invalid CSRF token)"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error (failed to write configuration file)"
     *     )
     * )
     *
     * Updates the admin configuration settings.
     *
     * @return void Outputs a JSON response indicating success or failure.
     */
    public function updateConfig(): void
    {
        header('Content-Type: application/json');

        // Ensure the user is authenticated and is an admin.
        if (
            !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
            !isset($_SESSION['isAdmin']) || !$_SESSION['isAdmin']
        ) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized access.']);
            exit;
        }

        // Validate CSRF token.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid CSRF token.']);
            exit;
        }

        // Retrieve and decode JSON input.
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid input.']);
            exit;
        }

        // Prepare existing settings
        $headerTitle = isset($data['header_title']) ? trim($data['header_title']) : "";
        $oidc = isset($data['oidc']) ? $data['oidc'] : [];
        $oidcProviderUrl = isset($oidc['providerUrl']) ? filter_var($oidc['providerUrl'], FILTER_SANITIZE_URL) : '';
        $oidcClientId    = isset($oidc['clientId']) ? trim($oidc['clientId']) : '';
        $oidcClientSecret = isset($oidc['clientSecret']) ? trim($oidc['clientSecret']) : '';
        $oidcRedirectUri = isset($oidc['redirectUri']) ? filter_var($oidc['redirectUri'], FILTER_SANITIZE_URL) : '';
        if (!$oidcProviderUrl || !$oidcClientId || !$oidcClientSecret || !$oidcRedirectUri) {
            http_response_code(400);
            echo json_encode(['error' => 'Incomplete OIDC configuration.']);
            exit;
        }

        $disableFormLogin = false;
        if (isset($data['loginOptions']['disableFormLogin'])) {
            $disableFormLogin = filter_var($data['loginOptions']['disableFormLogin'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['disableFormLogin'])) {
            $disableFormLogin = filter_var($data['disableFormLogin'], FILTER_VALIDATE_BOOLEAN);
        }
        $disableBasicAuth = false;
        if (isset($data['loginOptions']['disableBasicAuth'])) {
            $disableBasicAuth = filter_var($data['loginOptions']['disableBasicAuth'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['disableBasicAuth'])) {
            $disableBasicAuth = filter_var($data['disableBasicAuth'], FILTER_VALIDATE_BOOLEAN);
        }

        $disableOIDCLogin = false;
        if (isset($data['loginOptions']['disableOIDCLogin'])) {
            $disableOIDCLogin = filter_var($data['loginOptions']['disableOIDCLogin'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['disableOIDCLogin'])) {
            $disableOIDCLogin = filter_var($data['disableOIDCLogin'], FILTER_VALIDATE_BOOLEAN);
        }
        $globalOtpauthUrl = isset($data['globalOtpauthUrl']) ? trim($data['globalOtpauthUrl']) : "";

        // ── NEW: enableWebDAV flag ──────────────────────────────────────
        $enableWebDAV = false;
        if (array_key_exists('enableWebDAV', $data)) {
            $enableWebDAV = filter_var($data['enableWebDAV'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['features']['enableWebDAV'])) {
            $enableWebDAV = filter_var($data['features']['enableWebDAV'], FILTER_VALIDATE_BOOLEAN);
        }

        // ── NEW: sharedMaxUploadSize ──────────────────────────────────────
        $sharedMaxUploadSize = null;
        if (array_key_exists('sharedMaxUploadSize', $data)) {
            $sharedMaxUploadSize = filter_var($data['sharedMaxUploadSize'], FILTER_VALIDATE_INT);
        } elseif (isset($data['features']['sharedMaxUploadSize'])) {
            $sharedMaxUploadSize = filter_var($data['features']['sharedMaxUploadSize'], FILTER_VALIDATE_INT);
        }

        $configUpdate = [
            'header_title'         => $headerTitle,
            'oidc'                 => [
                'providerUrl'      => $oidcProviderUrl,
                'clientId'         => $oidcClientId,
                'clientSecret'     => $oidcClientSecret,
                'redirectUri'      => $oidcRedirectUri,
            ],
            'loginOptions'         => [
                'disableFormLogin' => $disableFormLogin,
                'disableBasicAuth' => $disableBasicAuth,
                'disableOIDCLogin' => $disableOIDCLogin,
            ],
            'globalOtpauthUrl'     => $globalOtpauthUrl,
            'enableWebDAV'         => $enableWebDAV,          
            'sharedMaxUploadSize'  => $sharedMaxUploadSize   // ← NEW
        ];

        // Delegate to the model.
        $result = AdminModel::updateConfig($configUpdate);
        if (isset($result['error'])) {
            http_response_code(500);
        }
        echo json_encode($result);
        exit;
    }
}