<?php
// changePassword.php
require_once 'config.php';
header('Content-Type: application/json');

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$username = $_SESSION['username'] ?? '';
if (!$username) {
    echo json_encode(["error" => "No username in session"]);
    exit;
}

// CSRF token check.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

// Get POST data.
$data = json_decode(file_get_contents("php://input"), true);
$oldPassword = trim($data["oldPassword"] ?? "");
$newPassword = trim($data["newPassword"] ?? "");
$confirmPassword = trim($data["confirmPassword"] ?? "");

// Validate input.
if (!$oldPassword || !$newPassword || !$confirmPassword) {
    echo json_encode(["error" => "All fields are required."]);
    exit;
}
if ($newPassword !== $confirmPassword) {
    echo json_encode(["error" => "New passwords do not match."]);
    exit;
}

// Path to users file.
$usersFile = USERS_DIR . USERS_FILE;
if (!file_exists($usersFile)) {
    echo json_encode(["error" => "Users file not found"]);
    exit;
}

// Read current users.
$lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$userFound = false;
$newLines = [];

foreach ($lines as $line) {
    $parts = explode(':', trim($line));
    // Expect at least 3 parts: username, hashed password, and role.
    if (count($parts) < 3) {
        // Skip invalid lines.
        $newLines[] = $line;
        continue;
    }
    $storedUser = $parts[0];
    $storedHash = $parts[1];
    $storedRole = $parts[2];
    // Preserve TOTP secret if it exists.
    $totpSecret = (count($parts) >= 4) ? $parts[3] : "";
    
    if ($storedUser === $username) {
        $userFound = true;
        // Verify the old password.
        if (!password_verify($oldPassword, $storedHash)) {
            echo json_encode(["error" => "Old password is incorrect."]);
            exit;
        }
        // Hash the new password.
        $newHashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);
        // Rebuild the line with the new hash and preserve TOTP secret if present.
        if ($totpSecret !== "") {
            $newLines[] = $username . ":" . $newHashedPassword . ":" . $storedRole . ":" . $totpSecret;
        } else {
            $newLines[] = $username . ":" . $newHashedPassword . ":" . $storedRole;
        }
    } else {
        $newLines[] = $line;
    }
}

if (!$userFound) {
    echo json_encode(["error" => "User not found."]);
    exit;
}

// Save updated users file.
if (file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL)) {
    echo json_encode(["success" => "Password updated successfully."]);
} else {
    echo json_encode(["error" => "Could not update password."]);
}
?>