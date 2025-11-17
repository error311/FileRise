<?php
// src/controllers/AdminController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';

class AdminController
{

            /** Enforce authentication (401). */
            private static function requireAuth(): void
            {
                if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
                    http_response_code(401);
                    header('Content-Type: application/json');
                    echo json_encode(['error' => 'Unauthorized']);
                    exit;
                }
            }
        
            /** Enforce admin (401). */
            private static function requireAdmin(): void
        {
            self::requireAuth();
        
            // Prefer the session flag
            $isAdmin = (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true);
        
            // Fallback: check the user’s role in storage (e.g., users.txt/DB)
            if (!$isAdmin) {
                $u = $_SESSION['username'] ?? '';
                if ($u) {
                    try {
                        // UserModel::getUserRole($u) should return '1' for admins
                        $isAdmin = (UserModel::getUserRole($u) === '1');
                        if ($isAdmin) {
                            // Normalize session so downstream ACL checks see admin
                            $_SESSION['isAdmin'] = true;
                        }
                    } catch (\Throwable $e) {
                        // ignore and continue to deny
                    }
                }
            }
        
            if (!$isAdmin) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Admin privileges required.']);
                exit;
            }
        }
            /** Get headers in lowercase, robust across SAPIs. */
            private static function headersLower(): array
            {
                $headers = function_exists('getallheaders') ? getallheaders() : [];
                $out = [];
                foreach ($headers as $k => $v) {
                    $out[strtolower($k)] = $v;
                }
                // Fallbacks from $_SERVER if needed
                foreach ($_SERVER as $k => $v) {
                    if (strpos($k, 'HTTP_') === 0) {
                        $h = strtolower(str_replace('_', '-', substr($k, 5)));
                        if (!isset($out[$h])) $out[$h] = $v;
                    }
                }
                return $out;
            }
        
            /** Enforce CSRF using X-CSRF-Token header (or csrfToken param as fallback). */
            private static function requireCsrf(): void
            {
                $h = self::headersLower();
                $token = trim($h['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));
                if (empty($_SESSION['csrf_token']) || $token !== $_SESSION['csrf_token']) {
                    http_response_code(403);
                    header('Content-Type: application/json');
                    echo json_encode(['error' => 'Invalid CSRF token']);
                    exit;
                }
            }
        
            /** Read JSON body (empty array if not valid). */
            private static function readJson(): array
            {
                $raw = file_get_contents('php://input');
                $data = json_decode($raw, true);
                return is_array($data) ? $data : [];
            }

            public function getConfig(): void
            {
                header('Content-Type: application/json; charset=utf-8');
            
                $config = AdminModel::getConfig();
                if (isset($config['error'])) {
                    http_response_code(500);
                    header('Cache-Control: no-store');
                    echo json_encode(['error' => $config['error']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    return;
                }
            
                // ---- Effective ONLYOFFICE values (constants override adminConfig) ----
                $ooCfg      = is_array($config['onlyoffice'] ?? null) ? $config['onlyoffice'] : [];
                $effEnabled = defined('ONLYOFFICE_ENABLED')
                    ? (bool) ONLYOFFICE_ENABLED
                    : (bool) ($ooCfg['enabled'] ?? false);
            
                $effDocs = (defined('ONLYOFFICE_DOCS_ORIGIN') && ONLYOFFICE_DOCS_ORIGIN !== '')
                    ? (string) ONLYOFFICE_DOCS_ORIGIN
                    : (string) ($ooCfg['docsOrigin'] ?? '');
            
                $hasSecret = defined('ONLYOFFICE_JWT_SECRET')
                    ? (ONLYOFFICE_JWT_SECRET !== '')
                    : (!empty($ooCfg['jwtSecret']));
            
                $publicOriginCfg = (string) ($ooCfg['publicOrigin'] ?? '');
            
                // ---- Pro / license info (all guarded for clean core installs) ----
                $licenseString = null;
                if (defined('PRO_LICENSE_FILE') && PRO_LICENSE_FILE && @is_file(PRO_LICENSE_FILE)) {
                    $json = @file_get_contents(PRO_LICENSE_FILE);
                    if ($json !== false) {
                        $decoded = json_decode($json, true);
                        if (is_array($decoded) && !empty($decoded['license'])) {
                            $licenseString = (string) $decoded['license'];
                        }
                    }
                }
            
                $proActive = defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE;
            
                // FR_PRO_INFO is only defined when bootstrap_pro.php has run; guard it
                $proPayload = [];
                if (defined('FR_PRO_INFO') && is_array(FR_PRO_INFO)) {
                    $p = FR_PRO_INFO['payload'] ?? null;
                    if (is_array($p)) {
                        $proPayload = $p;
                    }
                }
            
                $proType    = $proPayload['type']  ?? null;
                $proEmail   = $proPayload['email'] ?? null;
                $proVersion = defined('FR_PRO_BUNDLE_VERSION') ? FR_PRO_BUNDLE_VERSION : null;
            
                // Whitelisted public subset only (+ ONLYOFFICE enabled flag)
                $public = [
                    'header_title'        => (string)($config['header_title'] ?? 'FileRise'),
                    'loginOptions'        => [
                        'disableFormLogin' => (bool)($config['loginOptions']['disableFormLogin'] ?? false),
                        'disableBasicAuth' => (bool)($config['loginOptions']['disableBasicAuth'] ?? false),
                        'disableOIDCLogin' => (bool)($config['loginOptions']['disableOIDCLogin'] ?? false),
                    ],
                    'globalOtpauthUrl'    => (string)($config['globalOtpauthUrl'] ?? ''),
                    'enableWebDAV'        => (bool)($config['enableWebDAV'] ?? false),
                    'sharedMaxUploadSize' => (int)($config['sharedMaxUploadSize'] ?? 0),
                    'oidc' => [
                        'providerUrl' => (string)($config['oidc']['providerUrl'] ?? ''),
                        'redirectUri' => (string)($config['oidc']['redirectUri'] ?? ''),
                        // never include clientId/clientSecret
                    ],
                    'onlyoffice' => [
                        // Public only needs to know if it’s on; no secrets/origins here.
                        'enabled' => $effEnabled,
                    ],
                    'branding' => [
                        'customLogoUrl' => (string)($config['branding']['customLogoUrl'] ?? ''),
                        'headerBgLight' => (string)($config['branding']['headerBgLight'] ?? ''),
                        'headerBgDark'  => (string)($config['branding']['headerBgDark'] ?? ''),
                    ],
                    'pro' => [
                        'active'  => $proActive,
                        'type'    => $proType,
                        'email'   => $proEmail,
                        'version' => $proVersion,
                        'license' => $licenseString,
                    ],
                ];
            
                $isAdmin = !empty($_SESSION['authenticated']) && !empty($_SESSION['isAdmin']);
            
                if ($isAdmin) {
                    // admin-only extras: presence flags + proxy options + ONLYOFFICE effective view
                    $adminExtra = [
                        'loginOptions' => array_merge($public['loginOptions'], [
                            'authBypass'     => (bool)($config['loginOptions']['authBypass'] ?? false),
                            'authHeaderName' => (string)($config['loginOptions']['authHeaderName'] ?? 'X-Remote-User'),
                        ]),
                        'oidc' => array_merge($public['oidc'], [
                            'hasClientId'     => !empty($config['oidc']['clientId']),
                            'hasClientSecret' => !empty($config['oidc']['clientSecret']),
                        ]),
                        'onlyoffice' => [
                            'enabled'      => $effEnabled,
                            'docsOrigin'   => $effDocs,         // effective (constants win)
                            'publicOrigin' => $publicOriginCfg, // optional override from adminConfig
                            'hasJwtSecret' => (bool)$hasSecret, // boolean only; never leak secret
                            'lockedByPhp'  => (
                                defined('ONLYOFFICE_ENABLED')
                                || defined('ONLYOFFICE_DOCS_ORIGIN')
                                || defined('ONLYOFFICE_JWT_SECRET')
                                || defined('ONLYOFFICE_PUBLIC_ORIGIN')
                            ),
                        ],
                    ];
            
                    header('Cache-Control: no-store'); // don’t cache admin config
                    echo json_encode(array_merge($public, $adminExtra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    return;
                }
            
                // Non-admins / unauthenticated: only the public subset
                header('Cache-Control: no-store');
                echo json_encode($public, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }

public function setLicense(): void
{
    // Always respond JSON
    header('Content-Type: application/json; charset=utf-8');

    try {
        // Same guards as other admin endpoints
        self::requireAuth();
        self::requireAdmin();
        self::requireCsrf();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw ?: '{}', true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
            return;
        }

        $license = isset($data['license']) ? trim((string)$data['license']) : '';

        // Store license + updatedAt in JSON file
        if (!defined('PRO_LICENSE_FILE')) {
            // Fallback if constant not defined for some reason
            define('PRO_LICENSE_FILE', PROJECT_ROOT . '/users/proLicense.json');
        }

        $payload = [
            'license'   => $license,
            'updatedAt' => gmdate('c'),
        ];

        $dir = dirname(PRO_LICENSE_FILE);
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to create license dir']);
            return;
        }

        $json = json_encode($payload, JSON_PRETTY_PRINT);
        if ($json === false || file_put_contents(PRO_LICENSE_FILE, $json) === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to write license file']);
            return;
        }

        echo json_encode(['success' => true]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error'   => 'Exception: ' . $e->getMessage(),
        ]);
    }
}

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
                'disableBasicAuth' => true,
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
            'branding'            => [
                'customLogoUrl' => '',
                'headerBgLight'   => '',
                'headerBgDark'    => '',
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
                // ---- ONLYOFFICE: merge from payload (unless locked by PHP defines) ----
                $ooLockedByPhp = (
                    defined('ONLYOFFICE_ENABLED') ||
                    defined('ONLYOFFICE_DOCS_ORIGIN') ||
                    defined('ONLYOFFICE_JWT_SECRET') ||
                    defined('ONLYOFFICE_PUBLIC_ORIGIN')
                );
        
                if (!$ooLockedByPhp && isset($data['onlyoffice']) && is_array($data['onlyoffice'])) {
                    $ooExisting = (isset($existing['onlyoffice']) && is_array($existing['onlyoffice']))
                        ? $existing['onlyoffice'] : [];
        
                    $oo = $ooExisting;
        
                    if (array_key_exists('enabled', $data['onlyoffice'])) {
                        $oo['enabled'] = filter_var($data['onlyoffice']['enabled'], FILTER_VALIDATE_BOOLEAN);
                    }
                    if (isset($data['onlyoffice']['docsOrigin'])) {
                        $oo['docsOrigin'] = (string)$data['onlyoffice']['docsOrigin'];
                    }
                    if (isset($data['onlyoffice']['publicOrigin'])) {
                        $oo['publicOrigin'] = (string)$data['onlyoffice']['publicOrigin'];
                    }
                    // Allow setting/changing the secret when NOT locked by PHP
                    if (isset($data['onlyoffice']['jwtSecret'])) {
                        $js = trim((string)$data['onlyoffice']['jwtSecret']);
                        if ($js !== '') {
                            $oo['jwtSecret'] = $js; // stored encrypted by AdminModel
                        }
                        // If blank, we leave existing secret unchanged (no implicit wipe).
                    }
        
                    $merged['onlyoffice'] = $oo;
                }
                // Branding: pass through raw strings; AdminModel enforces Pro + sanitization.
            if (isset($data['branding']) && is_array($data['branding'])) {
            if (!isset($merged['branding']) || !is_array($merged['branding'])) {
                $merged['branding'] = [
                    'customLogoUrl'   => '',
                    'headerBgLight'   => '',
                    'headerBgDark'    => '',
                ];
            }
            foreach (['customLogoUrl', 'headerBgLight', 'headerBgDark'] as $key) {
                if (array_key_exists($key, $data['branding'])) {
                    $merged['branding'][$key] = (string)$data['branding'][$key];
                }
            }
        }

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