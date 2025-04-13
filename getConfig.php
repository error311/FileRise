<?php
require_once 'config.php';
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
    // Decode the configuration and ensure required fields are set
    $config = json_decode($decryptedContent, true);
    
    // Ensure globalOtpauthUrl is set
    if (!isset($config['globalOtpauthUrl'])) {
        $config['globalOtpauthUrl'] = "";
    }
    
    // NEW: Ensure header_title is set.
    if (!isset($config['header_title']) || empty($config['header_title'])) {
        $config['header_title'] = "FileRise"; // default value
    }
    
    echo json_encode($config);
} else {
    // If no config file exists, provide defaults
    echo json_encode([
        'header_title' => "FileRise",
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