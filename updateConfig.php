<?php
require 'config.php';
header('Content-Type: application/json');

// Verify that the user is authenticated and is an admin.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true || 
    !isset($_SESSION['isAdmin']) || !$_SESSION['isAdmin']) {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized access.']);
    exit;
}

// Validate CSRF token.
$receivedToken = '';
if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
    $receivedToken = trim($_SERVER['HTTP_X_CSRF_TOKEN']);
} else {
    $headers = array_change_key_case(getallheaders(), CASE_LOWER);
    $receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
}
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

// Validate and sanitize OIDC configuration.
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

// Validate login option booleans.
$disableFormLogin = isset($data['disableFormLogin']) ? filter_var($data['disableFormLogin'], FILTER_VALIDATE_BOOLEAN) : false;
$disableBasicAuth = isset($data['disableBasicAuth']) ? filter_var($data['disableBasicAuth'], FILTER_VALIDATE_BOOLEAN) : false;
$disableOIDCLogin = isset($data['disableOIDCLogin']) ? filter_var($data['disableOIDCLogin'], FILTER_VALIDATE_BOOLEAN) : false;

// Retrieve the global OTPAuth URL (new field). If not provided, default to an empty string.
$globalOtpauthUrl = isset($data['globalOtpauthUrl']) ? trim($data['globalOtpauthUrl']) : "";

// Prepare configuration array.
$configUpdate = [
    'oidc' => [
        'providerUrl'  => $oidcProviderUrl,
        'clientId'     => $oidcClientId,
        'clientSecret' => $oidcClientSecret,
        'redirectUri'  => $oidcRedirectUri,
    ],
    'loginOptions' => [
        'disableFormLogin' => $disableFormLogin,
        'disableBasicAuth' => $disableBasicAuth,
        'disableOIDCLogin' => $disableOIDCLogin,
    ],
    'globalOtpauthUrl' => $globalOtpauthUrl
];

// Define the configuration file path.
$configFile = USERS_DIR . 'adminConfig.json';

// Convert and encrypt configuration.
$plainTextConfig = json_encode($configUpdate, JSON_PRETTY_PRINT);
$encryptedContent = encryptData($plainTextConfig, $encryptionKey);
if (file_put_contents($configFile, $encryptedContent, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to update configuration.']);
    exit;
}

echo json_encode(['success' => 'Configuration updated successfully.']);
?>