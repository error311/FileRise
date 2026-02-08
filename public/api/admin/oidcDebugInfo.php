<?php
// public/api/admin/oidcDebugInfo.php
/**
 * @OA\Get(
 *   path="/api/admin/oidcDebugInfo.php",
 *   summary="Get OIDC debug info",
 *   description="Returns OIDC diagnostics for admins.",
 *   operationId="adminOidcDebugInfo",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Debug info"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';

if (
    empty($_SESSION['authenticated'])
    || $_SESSION['authenticated'] !== true
    || empty($_SESSION['isAdmin'])
) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error'   => 'Forbidden – admin only',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $cfg = \FileRise\Domain\AdminModel::getConfig();
    if (isset($cfg['error'])) {
        throw new RuntimeException($cfg['error']);
    }

    $oidcCfg = is_array($cfg['oidc'] ?? null) ? $cfg['oidc'] : [];

    // Client ID / secret presence flags (never leak actual values)
    $clientId     = $oidcCfg['clientId']     ?? ($cfg['oidc_client_id'] ?? null);
    $clientSecret = $oidcCfg['clientSecret'] ?? ($cfg['oidc_client_secret'] ?? null);
    $publicClient = !empty($oidcCfg['publicClient']);

    $clientIdMode = 'unset';
    if ($clientId !== null && $clientId !== '') {
        $clientIdMode = 'present';
    }

    $clientSecretMode = $publicClient ? 'public_client' : 'none';
    if (!$publicClient && $clientSecret !== null && $clientSecret !== '') {
        $clientSecretMode = 'present';
    }

    // Optional override for token endpoint auth method
    $tokenAuthMethod = null;
    if (defined('OIDC_TOKEN_ENDPOINT_AUTH_METHOD') && OIDC_TOKEN_ENDPOINT_AUTH_METHOD) {
        $tokenAuthMethod = OIDC_TOKEN_ENDPOINT_AUTH_METHOD;
    }
    if ($publicClient || $clientSecret === null || $clientSecret === '') {
        $tokenAuthMethod = 'none';
    } elseif (!$tokenAuthMethod) {
        $tokenAuthMethod = 'client_secret_basic';
    }

    $loginOptions = is_array($cfg['loginOptions'] ?? null) ? $cfg['loginOptions'] : [];

    $envGroupClaim = getenv('FR_OIDC_GROUP_CLAIM');
    $cfgGroupClaim = isset($oidcCfg['groupClaim']) ? trim((string)$oidcCfg['groupClaim']) : '';
    $groupClaimSource = 'default';
    $groupClaimEffective = (defined('FR_OIDC_GROUP_CLAIM') && trim((string)FR_OIDC_GROUP_CLAIM) !== '')
        ? trim((string)FR_OIDC_GROUP_CLAIM)
        : 'groups';
    if ($envGroupClaim !== false && trim((string)$envGroupClaim) !== '') {
        $groupClaimEffective = trim((string)$envGroupClaim);
        $groupClaimSource = 'env';
    } elseif ($cfgGroupClaim !== '') {
        $groupClaimEffective = $cfgGroupClaim;
        $groupClaimSource = 'config';
    }

    $envExtraScopes = getenv('FR_OIDC_EXTRA_SCOPES');
    $cfgExtraScopes = isset($oidcCfg['extraScopes']) ? trim((string)$oidcCfg['extraScopes']) : '';
    $extraScopesSource = 'none';
    $extraScopesEffective = '';
    if ($envExtraScopes !== false && trim((string)$envExtraScopes) !== '') {
        $extraScopesEffective = trim((string)$envExtraScopes);
        $extraScopesSource = 'env';
    } elseif ($cfgExtraScopes !== '') {
        $extraScopesEffective = $cfgExtraScopes;
        $extraScopesSource = 'config';
    }

    $scopes = ['openid', 'profile', 'email'];
    if ($extraScopesEffective !== '') {
        foreach (preg_split('/[,\s]+/', $extraScopesEffective) ?: [] as $scope) {
            $scope = trim($scope);
            if ($scope !== '') {
                $scopes[] = $scope;
            }
        }
    }
    $scopeSet = [];
    foreach ($scopes as $scope) {
        $key = strtolower($scope);
        if (!isset($scopeSet[$key])) {
            $scopeSet[$key] = $scope;
        }
    }
    $scopes = array_values($scopeSet);

    $info = [
        'providerUrl' => $oidcCfg['providerUrl'] ?? ($cfg['oidc_provider_url'] ?? null),
        'redirectUri' => $oidcCfg['redirectUri'] ?? ($cfg['oidc_redirect_uri'] ?? null),

        'clientIdMode'     => $clientIdMode,
        'clientSecretMode' => $clientSecretMode,
        'publicClient'     => $publicClient,

        'debugFlag' => [
            'FR_OIDC_DEBUG' => defined('FR_OIDC_DEBUG') ? (bool)FR_OIDC_DEBUG : false,
            // updated to look at debugLogging instead of debug
            'configDebug'   => !empty($oidcCfg['debugLogging'])
                               || !empty($cfg['oidc_debugLogging'])
                               || !empty($cfg['oidc_debug']),
        ],

        'tokenEndpointAuthMethod' => $tokenAuthMethod ?: '(library default)',
        'groupClaim' => $groupClaimEffective,
        'groupClaimSource' => $groupClaimSource,
        'extraScopes' => $extraScopesEffective,
        'extraScopesSource' => $extraScopesSource,
        'scopes' => $scopes,

        'loginOptions' => [
            'disableFormLogin' => !empty($loginOptions['disableFormLogin']),
            'disableBasicAuth' => !empty($loginOptions['disableBasicAuth']),
            'disableOIDCLogin' => !empty($loginOptions['disableOIDCLogin']),
            'authBypass'       => !empty($loginOptions['authBypass']),
            'authHeaderName'   => $loginOptions['authHeaderName'] ?? 'X-Remote-User',
        ],

        'env' => [
            'https'               => $_SERVER['HTTPS']               ?? null,
            'serverPort'          => $_SERVER['SERVER_PORT']         ?? null,
            'httpHost'            => $_SERVER['HTTP_HOST']           ?? null,
            'httpXForwardedProto' => $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null,
            'requestUri'          => $_SERVER['REQUEST_URI']         ?? null,
        ],
    ];

    echo json_encode([
        'success' => true,
        'info'    => $info,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
} catch (\Throwable $e) {
    error_log('OIDC debug info error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Internal error: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
