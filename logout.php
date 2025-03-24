<?php
require 'config.php';

// Retrieve headers and check CSRF token.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

// If there's a mismatch, log it but continue with logout.
if (isset($_SESSION['csrf_token']) && $receivedToken !== $_SESSION['csrf_token']) {
    error_log("CSRF token mismatch on logout. Proceeding with logout.");
}

// If the remember me token is set, remove it from the persistent tokens file.
if (isset($_COOKIE['remember_me_token'])) {
    $token = $_COOKIE['remember_me_token'];
    $persistentTokensFile = USERS_DIR . 'persistent_tokens.json';
    if (file_exists($persistentTokensFile)) {
        $encryptedContent = file_get_contents($persistentTokensFile);
        $decryptedContent = decryptData($encryptedContent, $encryptionKey);
        $persistentTokens = json_decode($decryptedContent, true);
        if (is_array($persistentTokens) && isset($persistentTokens[$token])) {
            unset($persistentTokens[$token]);
            $newEncryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $encryptionKey);
            file_put_contents($persistentTokensFile, $newEncryptedContent, LOCK_EX);
        }
    }
    // Clear the cookie.
    setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
}

// Clear session data and destroy the session.
$_SESSION = [];
session_destroy();

header('Content-Type: application/json');
echo json_encode(["success" => "Logged out"]);
exit;
?>