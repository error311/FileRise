<?php
require_once 'config.php';
header('Content-Type: application/json');

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
    !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$usersFile = USERS_DIR . USERS_FILE;
$users = [];

if (file_exists($usersFile)) {
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) >= 3) {
            // Validate username format:
            if (preg_match('/^[\p{L}\p{N}_\- ]+$/u', $parts[0])) {
                $users[] = [
                    "username" => $parts[0],
                    "role" => trim($parts[2])
                ];
            }
        }
    }
}

echo json_encode($users);
?>