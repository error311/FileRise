<?php
session_start();
header('Content-Type: application/json');

$usersFile = 'users.txt';

// Only allow admins to add users
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true || !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Get input data
$data = json_decode(file_get_contents("php://input"), true);
$newUsername = trim($data["username"] ?? "");
$newPassword = trim($data["password"] ?? "");
$isAdmin = !empty($data["isAdmin"]) ? "1" : "0"; // Store as "1" for admin, "0" for user

// Validate input
if (!$newUsername || !$newPassword) {
    echo json_encode(["error" => "Username and password required"]);
    exit;
}

// Check if username already exists
$existingUsers = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
foreach ($existingUsers as $line) {
    list($storedUser, $storedHash, $storedRole) = explode(':', trim($line));
    if ($newUsername === $storedUser) {
        echo json_encode(["error" => "User already exists"]);
        exit;
    }
}

// Hash the password
$hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);

// Append new user to users.txt
$newUserLine = $newUsername . ":" . $hashedPassword . ":" . $isAdmin . PHP_EOL;
file_put_contents($usersFile, $newUserLine, FILE_APPEND);

echo json_encode(["success" => "User added successfully"]);
?>
