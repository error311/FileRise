<?php
require_once 'config.php';

$usersFile = USERS_DIR . USERS_FILE;  // Make sure the users file path is defined

// Reuse the same authentication function
function authenticate($username, $password)
{
    global $usersFile;
    if (!file_exists($usersFile)) {
        error_log("authenticate(): users file not found");
        return false;
    }
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        list($storedUser, $storedPass, $storedRole) = explode(':', trim($line), 3);
        if ($username === $storedUser && password_verify($password, $storedPass)) {
            return $storedRole; // Return the user's role
        }
    }
    error_log("authenticate(): authentication failed for '$username'");
    return false;
}

// Define helper function to get a user's role from users.txt
function getUserRole($username) {
    global $usersFile;
    if (file_exists($usersFile)) {
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $parts = explode(":", trim($line));
            if (count($parts) >= 3 && $parts[0] === $username) {
                return trim($parts[2]);
            }
        }
    }
    return null;
}

// Add the loadFolderPermission function here:
function loadFolderPermission($username) {
    global $encryptionKey;
    $permissionsFile = USERS_DIR . 'userPermissions.json';
    if (file_exists($permissionsFile)) {
        $content = file_get_contents($permissionsFile);
        // Try to decrypt the content.
        $decryptedContent = decryptData($content, $encryptionKey);
        if ($decryptedContent !== false) {
            $permissions = json_decode($decryptedContent, true);
        } else {
            $permissions = json_decode($content, true);
        }
        if (is_array($permissions)) {
            // Use case-insensitive comparison.
            foreach ($permissions as $storedUsername => $data) {
                if (strcasecmp($storedUsername, $username) === 0 && isset($data['folderOnly'])) {
                    return (bool)$data['folderOnly'];
                }
            }
        }
    }
    return false; // Default if not set.
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
    $roleFromAuth = authenticate($username, $password);
    if ($roleFromAuth !== false) {
        // Use getUserRole() to determine the user's role from the file
        $actualRole = getUserRole($username);
        session_regenerate_id(true);
        $_SESSION["authenticated"] = true;
        $_SESSION["username"] = $username;
        $_SESSION["isAdmin"] = ($actualRole === "1");
        // Set the folderOnly flag based on userPermissions.json.
        $_SESSION["folderOnly"] = loadFolderPermission($username);

        // Redirect to the main page (or output JSON for testing)
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