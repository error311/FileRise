<?php
require 'config.php';
session_start();

$usersFile = USERS_DIR . USERS_FILE;

// Reuse the same authentication function
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

// Check if the user has sent HTTP Basic auth credentials.
if (!isset($_SERVER['PHP_AUTH_USER'])) {
    header('WWW-Authenticate: Basic realm="FileRise Login"');
    header('HTTP/1.0 401 Unauthorized');
    echo 'Authorization Required';
    exit;
} else {
    $username = trim($_SERVER['PHP_AUTH_USER']);
    $password = trim($_SERVER['PHP_AUTH_PW']);

    // Validate username format (optional)
    if (!preg_match('/^[A-Za-z0-9_\- ]+$/', $username)) {
        header('WWW-Authenticate: Basic realm="FileRise Login"');
        header('HTTP/1.0 401 Unauthorized');
        echo 'Invalid username format';
        exit;
    }

    // Attempt authentication
    $userRole = authenticate($username, $password);
    if ($userRole !== false) {
        // Successful login
        session_regenerate_id(true);
        $_SESSION["authenticated"] = true;
        $_SESSION["username"] = $username;
        $_SESSION["isAdmin"] = ($userRole === "1"); // Assuming "1" means admin

        // Redirect to the main page
        header("Location: index.html");
        exit;
    } else {
        // Invalid credentials; prompt again
        header('WWW-Authenticate: Basic realm="FileRise Login"');
        header('HTTP/1.0 401 Unauthorized');
        echo 'Invalid credentials';
        exit;
    }
}
?>