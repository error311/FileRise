<?php
require 'config.php';
header('Content-Type: application/json');

$usersFile = USERS_DIR . USERS_FILE;

// --- Brute Force Protection Settings ---
$maxAttempts = 5;
$lockoutTime = 30 * 60; // 30 minutes in seconds
$attemptsFile = USERS_DIR . 'failed_logins.json'; // JSON file for tracking failed login attempts
$failedLogFile = USERS_DIR . 'failed_login.log';   // Plain text log for fail2ban

// Load failed attempts data from file.
function loadFailedAttempts($file) {
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (is_array($data)) {
            return $data;
        }
    }
    return [];
}

// Save failed attempts data to file.
function saveFailedAttempts($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

// Get current IP address.
$ip = $_SERVER['REMOTE_ADDR'];
$currentTime = time();

// Load failed attempts.
$failedAttempts = loadFailedAttempts($attemptsFile);

// Check if this IP is currently locked out.
if (isset($failedAttempts[$ip])) {
    $attemptData = $failedAttempts[$ip];
    if ($attemptData['count'] >= $maxAttempts && ($currentTime - $attemptData['last_attempt']) < $lockoutTime) {
        echo json_encode(["error" => "Too many failed login attempts. Please try again later."]);
        exit;
    }
}

// --- Authentication Function ---
function authenticate($username, $password)
{
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

// Get JSON input.
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

// Attempt to authenticate the user.
$userRole = authenticate($username, $password);
if ($userRole !== false) {
    // On successful login, reset failed attempts for this IP.
    if (isset($failedAttempts[$ip])) {
        unset($failedAttempts[$ip]);
        saveFailedAttempts($attemptsFile, $failedAttempts);
    }
    // Regenerate session ID to mitigate session fixation attacks.
    session_regenerate_id(true);
    $_SESSION["authenticated"] = true;
    $_SESSION["username"] = $username;
    $_SESSION["isAdmin"] = ($userRole === "1"); // "1" indicates admin

    echo json_encode(["success" => "Login successful", "isAdmin" => $_SESSION["isAdmin"]]);
} else {
    // On failed login, update failed attempts.
    if (isset($failedAttempts[$ip])) {
        $failedAttempts[$ip]['count']++;
        $failedAttempts[$ip]['last_attempt'] = $currentTime;
    } else {
        $failedAttempts[$ip] = ['count' => 1, 'last_attempt' => $currentTime];
    }
    saveFailedAttempts($attemptsFile, $failedAttempts);

    // Log the failed attempt to the plain text log for fail2ban.
    $logLine = date('Y-m-d H:i:s') . " - Failed login attempt for username: " . $username . " from IP: " . $ip . PHP_EOL;
    file_put_contents($failedLogFile, $logLine, FILE_APPEND);

    echo json_encode(["error" => "Invalid credentials"]);
}
?>