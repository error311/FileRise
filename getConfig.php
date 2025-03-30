<?php
require 'config.php';
header('Content-Type: application/json');

$configFile = USERS_DIR . 'adminConfig.json';
if (file_exists($configFile)) {
    $encryptedContent = file_get_contents($configFile);
    $decryptedContent = decryptData($encryptedContent, $encryptionKey);
    if ($decryptedContent === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to decrypt configuration.']);
        exit;
    }
    // Decode the configuration and ensure globalOtpauthUrl is set
    $config = json_decode($decryptedContent, true);
    if (!isset($config['globalOtpauthUrl'])) {
        $config['globalOtpauthUrl'] = "";
    }
    echo json_encode($config);
} else {
    echo json_encode([
        'oidc' => [
            'providerUrl'  => 'https://your-oidc-provider.com',
            'clientId'     => 'YOUR_CLIENT_ID',
            'clientSecret' => 'YOUR_CLIENT_SECRET',
            'redirectUri'  => 'https://yourdomain.com/auth.php?oidc=callback'
        ],
        'loginOptions' => [
            'disableFormLogin' => false,
            'disableBasicAuth' => false,
            'disableOIDCLogin' => false
        ],
        'globalOtpauthUrl' => ""
    ]);
}
?>