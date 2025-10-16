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

        // Require authenticated admin to read config (prevents information disclosure)
        if (
            empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
            empty($_SESSION['isAdmin'])
        ) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized access.']);
            exit;
        }

        $config = AdminModel::getConfig();
        if (isset($config['error'])) {
            http_response_code(500);
            echo json_encode(['error' => $config['error']]);
            exit;
        }
    
        // Build a safe subset for the front-end
        $safe = [
          'header_title'        => $config['header_title'] ?? '',
          'loginOptions'        => $config['loginOptions'] ?? [],
          'globalOtpauthUrl'    => $config['globalOtpauthUrl'] ?? '',
          'enableWebDAV'        => $config['enableWebDAV'] ?? false,
          'sharedMaxUploadSize' => $config['sharedMaxUploadSize'] ?? 0,
          'oidc' => [
            'providerUrl' => $config['oidc']['providerUrl'] ?? '',
            'redirectUri' => $config['oidc']['redirectUri'] ?? '',
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
        $receivedToken = trim($headersArr['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));
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
        if (isset($existing['error'])) {
            http_response_code(500);
            echo json_encode(['error' => $existing['error']]);
            exit;
        }

        // —– start merge with existing as base —–
        // Ensure minimal structure if the file was partially missing.
        $merged = $existing + [
            'header_title'        => '',
            'loginOptions'        => [
                'disableFormLogin' => false,
                'disableBasicAuth' => false,
                'disableOIDCLogin' => true,
                'authBypass'       => false,
                'authHeaderName'   => 'X-Remote-User'
            ],
            'globalOtpauthUrl'    => '',
            'enableWebDAV'        => false,
            'sharedMaxUploadSize' => 0,
            'oidc'                => [
                'providerUrl' => '',
                'clientId'    => '',
                'clientSecret'=> '',
                'redirectUri' => ''
            ],
        ];

        // header_title (cap length and strip control chars)
        if (array_key_exists('header_title', $data)) {
            $title = trim((string)$data['header_title']);
            $title = preg_replace('/[\x00-\x1F\x7F]/', '', $title);
            if (mb_strlen($title) > 100) { // hard cap
                $title = mb_substr($title, 0, 100);
            }
            $merged['header_title'] = $title;
        }

        // loginOptions: inherit existing then override if provided
        foreach (['disableFormLogin','disableBasicAuth','disableOIDCLogin','authBypass'] as $flag) {
            if (isset($data['loginOptions'][$flag])) {
                $merged['loginOptions'][$flag] = filter_var(
                    $data['loginOptions'][$flag],
                    FILTER_VALIDATE_BOOLEAN
                );
            }
        }
        if (isset($data['loginOptions']['authHeaderName'])) {
            $hdr = trim((string)$data['loginOptions']['authHeaderName']);
            // very restrictive header-name pattern: letters, numbers, dashes
            if ($hdr !== '' && preg_match('/^[A-Za-z0-9\-]+$/', $hdr)) {
                $merged['loginOptions']['authHeaderName'] = $hdr;
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid authHeaderName.']);
                exit;
            }
        }

        // globalOtpauthUrl
        if (array_key_exists('globalOtpauthUrl', $data)) {
            $merged['globalOtpauthUrl'] = trim((string)$data['globalOtpauthUrl']);
        }

        // enableWebDAV
        if (array_key_exists('enableWebDAV', $data)) {
            $merged['enableWebDAV'] = filter_var($data['enableWebDAV'], FILTER_VALIDATE_BOOLEAN);
        }

        // sharedMaxUploadSize
        if (array_key_exists('sharedMaxUploadSize', $data)) {
            $sms = filter_var($data['sharedMaxUploadSize'], FILTER_VALIDATE_INT);
            if ($sms === false || $sms < 0) {
                http_response_code(400);
                echo json_encode(['error' => 'sharedMaxUploadSize must be a non-negative integer (bytes).']);
                exit;
            }
            // Clamp to PHP limits to avoid confusing UX
            $maxPost  = self::iniToBytes(ini_get('post_max_size'));
            $maxFile  = self::iniToBytes(ini_get('upload_max_filesize'));
            $phpCap   = min($maxPost ?: PHP_INT_MAX, $maxFile ?: PHP_INT_MAX);
            if ($phpCap !== PHP_INT_MAX && $sms > $phpCap) {
                $sms = $phpCap;
            }
            $merged['sharedMaxUploadSize'] = $sms;
        }

        // oidc: only overwrite non-empty inputs; validate when enabling OIDC
        foreach (['providerUrl','clientId','clientSecret','redirectUri'] as $f) {
            if (!empty($data['oidc'][$f])) {
                $val = trim((string)$data['oidc'][$f]);
                if ($f === 'providerUrl' || $f === 'redirectUri') {
                    $val = filter_var($val, FILTER_SANITIZE_URL);
                }
                $merged['oidc'][$f] = $val;
            }
        }

        // If OIDC login is enabled, ensure required fields are present and sane
        $oidcEnabled = !empty($merged['loginOptions']['disableOIDCLogin']) ? false : true;
        if ($oidcEnabled) {
            $prov = $merged['oidc']['providerUrl'] ?? '';
            $rid  = $merged['oidc']['redirectUri'] ?? '';
            $cid  = $merged['oidc']['clientId'] ?? '';
            // clientSecret may be empty for some PKCE-only flows, but commonly needed for code flow.
            if ($prov === '' || $rid === '' || $cid === '') {
                http_response_code(400);
                echo json_encode(['error' => 'OIDC is enabled but providerUrl, redirectUri, and clientId are required.']);
                exit;
            }
            // Require https except for localhost development
            $httpsOk = function(string $url): bool {
                if ($url === '') return false;
                $parts = parse_url($url);
                if (!$parts || empty($parts['scheme'])) return false;
                if ($parts['scheme'] === 'https') return true;
                if ($parts['scheme'] === 'http' && (isset($parts['host']) && ($parts['host'] === 'localhost' || $parts['host'] === '127.0.0.1'))) {
                    return true;
                }
                return false;
            };
            if (!$httpsOk($prov) || !$httpsOk($rid)) {
                http_response_code(400);
                echo json_encode(['error' => 'providerUrl and redirectUri must be https (or http on localhost)']);
                exit;
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

    /** Convert php.ini shorthand like "128M" to bytes */
    private static function iniToBytes($val)
    {
        if ($val === false || $val === null || $val === '') return 0;
        $val = trim((string)$val);
        $last = strtolower($val[strlen($val)-1]);
        $num = (int)$val;
        switch ($last) {
            case 'g': $num *= 1024;
            case 'm': $num *= 1024;
            case 'k': $num *= 1024;
        }
        return $num;
    }
}
?>