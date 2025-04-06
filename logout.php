<?php
require_once 'config.php';

// Retrieve headers and check CSRF token.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

// Log CSRF mismatch but proceed with logout.
if (isset($_SESSION['csrf_token']) && $receivedToken !== $_SESSION['csrf_token']) {
    error_log("CSRF token mismatch on logout. Proceeding with logout.");
}

// Remove the remember_me token.
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
    // Ensure $secure is defined; for example:
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
}

// Clear session data and remove session cookie.
$_SESSION = [];

// Clear the session cookie.
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// Destroy the session.
session_destroy();

header("Location: index.html?logout=1");
exit;
?>