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
        if (isset($config['error'])) {
            http_response_code(500);
            echo json_encode(['error' => $config['error']]);
            exit;
        }
    
        // Build a safe subset for the front-end
        $safe = [
          'header_title'        => $config['header_title'],
          'loginOptions'        => $config['loginOptions'],
          'globalOtpauthUrl'    => $config['globalOtpauthUrl'],
          'enableWebDAV'        => $config['enableWebDAV'],
          'sharedMaxUploadSize' => $config['sharedMaxUploadSize'],
          'oidc' => [
            'providerUrl' => $config['oidc']['providerUrl'],
            'redirectUri' => $config['oidc']['redirectUri'],
            // clientSecret and clientId never exposed here
          ],
        ];
    
        echo json_encode($safe);
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

    // —– auth & CSRF checks —–
    if (
        !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
        !isset($_SESSION['isAdmin'])      || !$_SESSION['isAdmin']
    ) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized access.']);
        exit;
    }
    $headersArr    = array_change_key_case(getallheaders(), CASE_LOWER);
    $receivedToken = trim($headersArr['x-csrf-token'] ?? '');
    if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
        http_response_code(403);
        echo json_encode(['error' => 'Invalid CSRF token.']);
        exit;
    }

    // —– fetch payload —–
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid input.']);
        exit;
    }

    // —– load existing on-disk config —–
    $existing = AdminModel::getConfig();

    // —– start merge with existing as base —–
    $merged = $existing;

    // header_title
    if (array_key_exists('header_title', $data)) {
        $merged['header_title'] = trim($data['header_title']);
    }

    // loginOptions: inherit existing then override if provided
    $merged['loginOptions'] = $existing['loginOptions'] ?? [
      'disableFormLogin' => false,
      'disableBasicAuth' => false,
      'disableOIDCLogin'=> false,
      'authBypass'      => false,
      'authHeaderName'  => 'X-Remote-User'
    ];
    foreach (['disableFormLogin','disableBasicAuth','disableOIDCLogin','authBypass'] as $flag) {
        if (isset($data['loginOptions'][$flag])) {
            $merged['loginOptions'][$flag] = filter_var(
                $data['loginOptions'][$flag],
                FILTER_VALIDATE_BOOLEAN
            );
        }
    }
    if (isset($data['loginOptions']['authHeaderName'])) {
        $hdr = trim($data['loginOptions']['authHeaderName']);
        if ($hdr !== '') {
            $merged['loginOptions']['authHeaderName'] = $hdr;
        }
    }

    // globalOtpauthUrl
    if (array_key_exists('globalOtpauthUrl', $data)) {
        $merged['globalOtpauthUrl'] = trim($data['globalOtpauthUrl']);
    }

    // enableWebDAV
    if (array_key_exists('enableWebDAV', $data)) {
        $merged['enableWebDAV'] = filter_var($data['enableWebDAV'], FILTER_VALIDATE_BOOLEAN);
    }

    // sharedMaxUploadSize
    if (array_key_exists('sharedMaxUploadSize', $data)) {
        $sms = filter_var($data['sharedMaxUploadSize'], FILTER_VALIDATE_INT);
        if ($sms !== false) {
            $merged['sharedMaxUploadSize'] = $sms;
        }
    }

    // oidc: only overwrite non-empty inputs
    $merged['oidc'] = $existing['oidc'] ?? [
      'providerUrl'=>'','clientId'=>'','clientSecret'=>'','redirectUri'=>''
    ];
    foreach (['providerUrl','clientId','clientSecret','redirectUri'] as $f) {
        if (!empty($data['oidc'][$f])) {
            $val = trim($data['oidc'][$f]);
            if ($f === 'providerUrl' || $f === 'redirectUri') {
                $val = filter_var($val, FILTER_SANITIZE_URL);
            }
            $merged['oidc'][$f] = $val;
        }
    }

    // —– persist merged config —–
    $result = AdminModel::updateConfig($merged);
    if (isset($result['error'])) {
        http_response_code(500);
    }
    echo json_encode($result);
    exit;
}
}