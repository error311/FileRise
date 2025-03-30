<?php
// updateUserPanel.php
require 'config.php';
header('Content-Type: application/json');

session_start();

// Ensure the user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(403);
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Verify the CSRF token from headers.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$csrfToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
if (!isset($_SESSION['csrf_token']) || $csrfToken !== $_SESSION['csrf_token']) {
    http_response_code(403);
    echo json_encode(["error" => "Invalid CSRF token"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid input"]);
    exit;
}

$username = $_SESSION['username'] ?? '';
if (!$username) {
    http_response_code(400);
    echo json_encode(["error" => "No username in session"]);
    exit;
}

$totp_enabled = isset($data['totp_enabled']) ? filter_var($data['totp_enabled'], FILTER_VALIDATE_BOOLEAN) : false;
$usersFile = USERS_DIR . USERS_FILE;

/**
 * Clears the TOTP secret for a given user by removing or emptying the fourth field.
 *
 * @param string $username
 */
function disableUserTOTP($username) {
    global $usersFile;
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $newLines = [];
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        // If the line doesn't have at least three parts, leave it alone.
        if (count($parts) < 3) {
            $newLines[] = $line;
            continue;
        }
        if ($parts[0] === $username) {
            // If a fourth field exists, clear it; otherwise, append an empty field.
            if (count($parts) >= 4) {
                $parts[3] = "";
            } else {
                $parts[] = "";
            }
            $newLines[] = implode(':', $parts);
        } else {
            $newLines[] = $line;
        }
    }
    file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX);
}

// If TOTP is disabled, clear the user's TOTP secret.
if (!$totp_enabled) {
    disableUserTOTP($username);
    echo json_encode(["success" => "User panel updated: TOTP disabled"]);
    exit;
} else {
    // If TOTP is enabled, do not change the stored secret.
    echo json_encode(["success" => "User panel updated: TOTP remains enabled"]);
    exit;
}
?>