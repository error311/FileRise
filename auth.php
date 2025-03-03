<?php
require 'config.php';
session_start();
header('Content-Type: application/json');

$usersFile = UPLOAD_DIR . USERS_FILE;

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
            return $storedRole; // 
        }
    }

    return false;
}

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);
$username = $data["username"] ?? "";
$password = $data["password"] ?? "";

// Authenticate user
$userRole = authenticate($username, $password);
if ($userRole !== false) {
    $_SESSION["authenticated"] = true;
    $_SESSION["username"] = $username;
    $_SESSION["isAdmin"] = ($userRole === "1"); // correctly recognize admin status

    echo json_encode(["success" => "Login successful", "isAdmin" => $_SESSION["isAdmin"]]);
} else {
    echo json_encode(["error" => "Invalid credentials"]);
}
?>
