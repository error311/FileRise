<?php
require_once 'config.php';
header('Content-Type: application/json');

$usersFile = USERS_DIR . USERS_FILE;
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

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

// Optional: Validate the username format (allow letters, numbers, underscores, dashes, and spaces)
if (!preg_match('/^[\p{L}\p{N}_\- ]+$/u', $usernameToRemove)) {
    echo json_encode(["error" => "Invalid username format"]);
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

// Also update the userPermissions.json file
$permissionsFile = USERS_DIR . "userPermissions.json";
if (file_exists($permissionsFile)) {
    $permissionsJson = file_get_contents($permissionsFile);
    $permissionsArray = json_decode($permissionsJson, true);
    if (is_array($permissionsArray) && isset($permissionsArray[$usernameToRemove])) {
        unset($permissionsArray[$usernameToRemove]);
        file_put_contents($permissionsFile, json_encode($permissionsArray, JSON_PRETTY_PRINT));
    }
}

echo json_encode(["success" => "User removed successfully"]);
?>