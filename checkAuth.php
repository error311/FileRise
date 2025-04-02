<?php
require_once 'config.php';
header('Content-Type: application/json');

// Check if users.txt is empty or doesn't exist.
$usersFile = USERS_DIR . USERS_FILE;
if (!file_exists($usersFile) || trim(file_get_contents($usersFile)) === '') {
    // In production, you might log that the system is in setup mode.
    error_log("checkAuth: users file not found or empty; entering setup mode.");
    echo json_encode(["setup" => true]);
    exit();
}

// Check session authentication.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["authenticated" => false]);
    exit();
}

/**
 * Helper function to get a user's role from users.txt.
 * Returns the role as a string (e.g. "1") or null if not found.
 */
function getUserRole($username) {
    global $usersFile;
    if (file_exists($usersFile)) {
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $parts = explode(":", trim($line));
            if (count($parts) >= 3 && $parts[0] === $username) {
                return trim($parts[2]);
            }
        }
    }
    return null;
}

// Determine if TOTP is enabled by checking users.txt.
$totp_enabled = false;
$username = $_SESSION['username'] ?? '';
if ($username) {
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(":", trim($line));
        // Assuming first field is username and fourth (if exists) is the TOTP secret.
        if ($parts[0] === $username) {
            if (isset($parts[3]) && trim($parts[3]) !== "") {
                $totp_enabled = true;
            }
            break;
        }
    }
}

// Use getUserRole() to determine admin status.
// We cast the role to an integer so that "1" (string) is treated as true.
$userRole = getUserRole($username);
$isAdmin = ((int)$userRole === 1);

// Build and return the JSON response.
$response = [
    "authenticated" => true,
    "isAdmin"       => $isAdmin,
    "totp_enabled"  => $totp_enabled,
    "username"      => $username,
    "folderOnly"    => isset($_SESSION["folderOnly"]) ? $_SESSION["folderOnly"] : false
];

echo json_encode($response);
?>