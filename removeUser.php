<?php
require 'config.php';
session_start();
header('Content-Type: application/json');

$usersFile = USERS_DIR . USERS_FILE;

// Only allow admins to remove users
if (
    !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
    !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true
) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Get input data from JSON
$data = json_decode(file_get_contents("php://input"), true);
$usernameToRemove = trim($data["username"] ?? "");

if (!$usernameToRemove) {
    echo json_encode(["error" => "Username is required"]);
    exit;
}

// Prevent removal of the currently logged-in user
if (isset($_SESSION['username']) && $_SESSION['username'] === $usernameToRemove) {
    echo json_encode(["error" => "Cannot remove yourself"]);
    exit;
}

// Read existing users from the file
if (!file_exists($usersFile)) {
    echo json_encode(["error" => "Users file not found"]);
    exit;
}

$existingUsers = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$newUsers = [];
$userFound = false;

// Remove the user with the specified username
foreach ($existingUsers as $line) {
    $parts = explode(':', trim($line));
    if (count($parts) < 3) {
        continue;
    }
    $storedUser = $parts[0];
    if ($storedUser === $usernameToRemove) {
        $userFound = true;
        continue; // Skip this user
    }
    $newUsers[] = $line;
}

if (!$userFound) {
    echo json_encode(["error" => "User not found"]);
    exit;
}

// Write the updated list back to users.txt
file_put_contents($usersFile, implode(PHP_EOL, $newUsers) . PHP_EOL);
echo json_encode(["success" => "User removed successfully"]);
?>
