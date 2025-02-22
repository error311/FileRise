<?php
session_start();
header('Content-Type: application/json');

// Check if users.txt is empty or doesn't exist
$usersFile = __DIR__ . '/users.txt';
if (!file_exists($usersFile) || trim(file_get_contents($usersFile)) === '') {
    // Return JSON indicating setup mode
    echo json_encode(["setup" => true]);
    exit();
}

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["authenticated" => false]);
    exit;
}

echo json_encode([
    "authenticated" => true,
    "isAdmin" => isset($_SESSION["isAdmin"]) ? $_SESSION["isAdmin"] : false
]);
?>
