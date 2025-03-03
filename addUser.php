<?php
require 'config.php';
session_start();
header('Content-Type: application/json');

$usersFile = USERS_FILE;

// Determine if we are in setup mode:
// - Query parameter setup=1 is passed
// - And users.txt is either missing or empty
$isSetup = (isset($_GET['setup']) && $_GET['setup'] == '1');
if ($isSetup && (!file_exists($usersFile) || trim(file_get_contents($usersFile)) === '')) {
    // Allow initial admin creation without session checks.
    $setupMode = true;
} else {
    $setupMode = false;
    // Only allow admins to add users normally.
    if (
        !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
        !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true
    ) {
        echo json_encode(["error" => "Unauthorized"]);
        exit;
    }
}

// Get input data from JSON
$data = json_decode(file_get_contents("php://input"), true);
$newUsername = trim($data["username"] ?? "");
$newPassword = trim($data["password"] ?? "");

// In setup mode, force the new user to be admin.
if ($setupMode) {
    $isAdmin = "1";
} else {
    $isAdmin = !empty($data["isAdmin"]) ? "1" : "0"; // "1" for admin, "0" for regular user.
}

// Validate input
if (!$newUsername || !$newPassword) {
    echo json_encode(["error" => "Username and password required"]);
    exit;
}

// Ensure users.txt exists
if (!file_exists($usersFile)) {
    file_put_contents($usersFile, '');
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

// Prepare new user line
$newUserLine = $newUsername . ":" . $hashedPassword . ":" . $isAdmin . PHP_EOL;

// In setup mode, overwrite users.txt; otherwise, append to it.
if ($setupMode) {
    file_put_contents($usersFile, $newUserLine);
} else {
    file_put_contents($usersFile, $newUserLine, FILE_APPEND);
}

echo json_encode(["success" => "User added successfully"]);
?>
