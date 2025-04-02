<?php
require_once 'config.php';
header('Content-Type: application/json');

// Check if the user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$permissionsFile = USERS_DIR . "userPermissions.json";
$permissionsArray = [];

// Load permissions file if it exists.
if (file_exists($permissionsFile)) {
    $content = file_get_contents($permissionsFile);
    // Attempt to decrypt the content.
    $decryptedContent = decryptData($content, $encryptionKey);
    if ($decryptedContent === false) {
        // If decryption fails, assume the file is plain JSON.
        $permissionsArray = json_decode($content, true);
    } else {
        $permissionsArray = json_decode($decryptedContent, true);
    }
    if (!is_array($permissionsArray)) {
        $permissionsArray = [];
    }
}

// If the user is an admin, return all permissions.
if (isset($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) {
    echo json_encode($permissionsArray);
    exit;
}

// Otherwise, return only the current user's permissions.
$username = $_SESSION['username'] ?? '';
foreach ($permissionsArray as $storedUsername => $data) {
    if (strcasecmp($storedUsername, $username) === 0) {
        echo json_encode($data);
        exit;
    }
}

// If no permissions are found for the current user, return an empty object.
echo json_encode(new stdClass());
?>