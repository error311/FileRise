<?php
// verifyTOTPSetup.php

require_once 'vendor/autoload.php';
require_once 'config.php';

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(403);
    echo json_encode(["error" => "Not authenticated"]);
    exit;
}

// Verify CSRF token from request headers.
$csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!isset($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
    http_response_code(403);
    echo json_encode(["error" => "Invalid CSRF token"]);
    exit;
}

// Ensure Content-Type is JSON.
header('Content-Type: application/json');

// Read and decode the JSON request body.
$input = json_decode(file_get_contents("php://input"), true);
if (!isset($input['totp_code']) || strlen(trim($input['totp_code'])) !== 6 || !ctype_digit(trim($input['totp_code']))) {
    http_response_code(400);
    echo json_encode(["error" => "A valid 6-digit TOTP code is required"]);
    exit;
}

$totpCode = trim($input['totp_code']);
$username = $_SESSION['username'] ?? '';
if (empty($username)) {
    http_response_code(400);
    echo json_encode(["error" => "Username not found in session"]);
    exit;
}

/**
 * Retrieves the current user's TOTP secret from users.txt.
 *
 * @param string $username
 * @return string|null The decrypted TOTP secret or null if not found.
 */
function getUserTOTPSecret($username) {
    global $encryptionKey;
    // Define the path to your users file.
    $usersFile = USERS_DIR . USERS_FILE;
    if (!file_exists($usersFile)) {
        return null;
    }
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        // Assuming format: username:hashedPassword:role:encryptedTOTPSecret
        if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
            return decryptData($parts[3], $encryptionKey);
        }
    }
    return null;
}

// Retrieve the user's TOTP secret.
$totpSecret = getUserTOTPSecret($username);
if (!$totpSecret) {
    http_response_code(500);
    echo json_encode(["error" => "TOTP secret not found. Please try setting up TOTP again."]);
    exit;
}

// Verify the provided TOTP code.
$tfa = new \RobThree\Auth\TwoFactorAuth('FileRise');
if (!$tfa->verifyCode($totpSecret, $totpCode)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid TOTP code."]);
    exit;
}

// If needed, you could update a flag or store the confirmation in the user record here.

// Return a successful response.
echo json_encode(["success" => true, "message" => "TOTP successfully verified."]);
?>