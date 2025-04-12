<?php
// disableTOTP.php

require_once 'vendor/autoload.php';
require_once 'config.php';

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(403);
    echo json_encode(["error" => "Not authenticated"]);
    exit;
}

// Verify CSRF token from request headers.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$csrfHeader = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if (!isset($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
    respond('error', 403, 'Invalid CSRF token');
}

header('Content-Type: application/json');

$username = $_SESSION['username'] ?? '';
if (empty($username)) {
    http_response_code(400);
    echo json_encode(["error" => "Username not found in session"]);
    exit;
}

/**
 * Removes the TOTP secret for the given user in users.txt.
 *
 * @param string $username
 * @return bool True on success, false otherwise.
 */
function removeUserTOTPSecret($username) {
    global $encryptionKey;
    $usersFile = USERS_DIR . USERS_FILE;
    if (!file_exists($usersFile)) {
        return false;
    }
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $modified = false;
    $newLines = [];
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) < 3) {
            $newLines[] = $line;
            continue;
        }
        if ($parts[0] === $username) {
            // Remove the TOTP secret by setting it to an empty string.
            if (count($parts) >= 4) {
                $parts[3] = "";
            }
            $modified = true;
            $newLines[] = implode(":", $parts);
        } else {
            $newLines[] = $line;
        }
    }
    if ($modified) {
        file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX);
    }
    return $modified;
}

if (removeUserTOTPSecret($username)) {
    echo json_encode(["success" => true, "message" => "TOTP disabled successfully."]);
} else {
    http_response_code(500);
    echo json_encode(["error" => "Failed to disable TOTP."]);
}
?>