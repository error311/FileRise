<?php
require 'config.php';
header('Content-Type: application/json');

// Check if users.txt is empty or doesn't exist
$usersFile = USERS_DIR . USERS_FILE;
if (!file_exists($usersFile) || trim(file_get_contents($usersFile)) === '') {
    // Return JSON indicating setup mode
    echo json_encode(["setup" => true]);
    exit();
}

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["authenticated" => false]);
    exit;
}

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

echo json_encode([
    "authenticated" => true,
    "isAdmin" => isset($_SESSION["isAdmin"]) ? $_SESSION["isAdmin"] : false,
    "totp_enabled" => $totp_enabled
]);
?>