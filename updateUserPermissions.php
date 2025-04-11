<?php
require_once 'config.php';
header('Content-Type: application/json');

// Only admins should update user permissions.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
    !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// Verify the CSRF token from headers.
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$csrfToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
if (!isset($_SESSION['csrf_token']) || $csrfToken !== $_SESSION['csrf_token']) {
    http_response_code(403);
    echo json_encode(["error" => "Invalid CSRF token"]);
    exit;
}

// Read the POST input.
$input = json_decode(file_get_contents("php://input"), true);
if (!isset($input['permissions']) || !is_array($input['permissions'])) {
    echo json_encode(["error" => "Invalid input"]);
    exit;
}

$permissions = $input['permissions'];
$permissionsFile = USERS_DIR . "userPermissions.json";

// Load existing permissions if available and decrypt.
if (file_exists($permissionsFile)) {
    $encryptedContent = file_get_contents($permissionsFile);
    $json = decryptData($encryptedContent, $encryptionKey);
    $existingPermissions = json_decode($json, true);
    if (!is_array($existingPermissions)) {
        $existingPermissions = [];
    }
} else {
    $existingPermissions = [];
}

// Load user roles from the users file (similar to getUsers.php)
$usersFile = USERS_DIR . USERS_FILE;
$userRoles = [];
if (file_exists($usersFile)) {
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) >= 3) {
            // Validate username format:
            if (preg_match(REGEX_USER, $parts[0])) {
                // Use a lowercase key for consistency.
                $userRoles[strtolower($parts[0])] = trim($parts[2]);
            }
        }
    }
}

// Loop through each permission update.
foreach ($permissions as $perm) {
    // Ensure username is provided.
    if (!isset($perm['username'])) continue;
    $username = $perm['username'];
    
    // Look up the user's role from the users file.
    $role = isset($userRoles[strtolower($username)]) ? $userRoles[strtolower($username)] : null;
    
    // Skip updating permissions for admin users.
    if ($role === "1") {
        continue;
    }
    
    // Update permissions: default any missing value to false.
    $existingPermissions[strtolower($username)] = [
        'folderOnly'    => isset($perm['folderOnly']) ? (bool)$perm['folderOnly'] : false,
        'readOnly'      => isset($perm['readOnly']) ? (bool)$perm['readOnly'] : false,
        'disableUpload' => isset($perm['disableUpload']) ? (bool)$perm['disableUpload'] : false
    ];
}

// Convert the permissions array to JSON.
$plainText = json_encode($existingPermissions, JSON_PRETTY_PRINT);
// Encrypt the JSON data.
$encryptedData = encryptData($plainText, $encryptionKey);
// Save encrypted permissions back to the JSON file.
$result = file_put_contents($permissionsFile, $encryptedData);
if ($result === false) {
    echo json_encode(["error" => "Failed to save user permissions."]);
    exit;
}

echo json_encode(["success" => "User permissions updated successfully."]);
?>