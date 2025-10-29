<?php
// src/controllers/AdminController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';

class AdminController
{ 
    public function getConfig(): void
{
    header('Content-Type: application/json');

    // Load raw config (no disclosure yet)
    $config = AdminModel::getConfig();
    if (isset($config['error'])) {
        http_response_code(500);
        echo json_encode(['error' => $config['error']]);
        exit;
    }

    // Minimal, safe subset for all callers (unauth users and regular users)
    $public = [
        'header_title'        => $config['header_title'] ?? 'FileRise',
        'loginOptions'        => [
            // expose only what the login page / header needs
            'disableFormLogin'  => (bool)($config['loginOptions']['disableFormLogin']  ?? false),
            'disableBasicAuth'  => (bool)($config['loginOptions']['disableBasicAuth']  ?? false),
            'disableOIDCLogin'  => (bool)($config['loginOptions']['disableOIDCLogin']  ?? false),
        ],
        'globalOtpauthUrl'    => $config['globalOtpauthUrl'] ?? '',
        'enableWebDAV'        => (bool)($config['enableWebDAV'] ?? false),
        'sharedMaxUploadSize' => (int)($config['sharedMaxUploadSize'] ?? 0),

        'oidc' => [
            'providerUrl' => (string)($config['oidc']['providerUrl'] ?? ''),
            'redirectUri' => (string)($config['oidc']['redirectUri'] ?? ''),
            // never expose clientId / clientSecret
        ],
    ];

    $isAdmin = !empty($_SESSION['authenticated']) && !empty($_SESSION['isAdmin']);

    if ($isAdmin) {
        // Add admin-only fields (used by Admin Panel UI)
        $adminExtra = [
            'loginOptions' => array_merge($public['loginOptions'], [
                'authBypass'     => (bool)($config['loginOptions']['authBypass']     ?? false),
                'authHeaderName' => (string)($config['loginOptions']['authHeaderName'] ?? 'X-Remote-User'),
            ]),
        ];
        echo json_encode(array_merge($public, $adminExtra));
        return;
    }

    // Non-admins / unauthenticated: only the public subset
    echo json_encode($public);
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