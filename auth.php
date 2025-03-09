<?php
require 'config.php';
header('Content-Type: application/json');

$usersFile = USERS_DIR . USERS_FILE;

// Function to authenticate user
function authenticate($username, $password) {
    global $usersFile;

    if (!file_exists($usersFile)) {
        return false;
    }

    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        list($storedUser, $storedPass, $storedRole) = explode(':', trim($line), 3);
        if ($username === $storedUser && password_verify($password, $storedPass)) {
            return $storedRole; // Return the user's role
        }
    }
    return false;
}

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);
$username = trim($data["username"] ?? "");
$password = trim($data["password"] ?? "");

// Validate input: ensure both fields are provided.
if (!$username || !$password) {
    echo json_encode(["error" => "Username and password are required"]);
    exit;
}

// Validate username format: allow only letters, numbers, underscores, dashes, and spaces.
if (!preg_match('/^[A-Za-z0-9_\- ]+$/', $username)) {
    echo json_encode(["error" => "Invalid username format. Only letters, numbers, underscores, dashes, and spaces are allowed."]);
    exit;
}

// Authenticate user
$userRole = authenticate($username, $password);
if ($userRole !== false) {
    $_SESSION["authenticated"] = true;
    $_SESSION["username"] = $username;
    $_SESSION["isAdmin"] = ($userRole === "1"); // "1" indicates admin

    echo json_encode(["success" => "Login successful", "isAdmin" => $_SESSION["isAdmin"]]);
} else {
    echo json_encode(["error" => "Invalid credentials"]);
}
?>