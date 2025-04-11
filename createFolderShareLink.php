<?php
// createFolderShareLink.php

require_once 'config.php';

// Get POST input.
$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    echo json_encode(["error" => "Invalid input."]);
    exit;
}

$username = $_SESSION['username'] ?? '';
$userPermissions = loadUserPermissions($username);
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to create shared folders."]);
        exit();
    }
}

$folder = isset($input['folder']) ? trim($input['folder']) : "";
$expirationMinutes = isset($input['expirationMinutes']) ? intval($input['expirationMinutes']) : 60;
$password = isset($input['password']) ? $input['password'] : "";
$allowUpload = isset($input['allowUpload']) ? intval($input['allowUpload']) : 0;

// Validate folder name using regex.
// Allow letters, numbers, underscores, hyphens, spaces and slashes.
if ($folder !== 'root' && !preg_match('/^[\p{L}\p{N}_\-\s\/\\\\]+$/u', $folder)) {
    echo json_encode(["error" => "Invalid folder name."]);
    exit;
}

// Generate a secure token.
try {
    $token = bin2hex(random_bytes(16)); // 32 hex characters.
} catch (Exception $e) {
    echo json_encode(["error" => "Could not generate token."]);
    exit;
}

// Calculate expiration time (Unix timestamp).
$expires = time() + ($expirationMinutes * 60);

// Hash password if provided.
$hashedPassword = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : "";

// Define the file to store share folder links.
$shareFile = META_DIR . "share_folder_links.json";
$shareLinks = [];
if (file_exists($shareFile)) {
    $data = file_get_contents($shareFile);
    $shareLinks = json_decode($data, true);
    if (!is_array($shareLinks)) {
        $shareLinks = [];
    }
}

// Clean up expired share links.
$currentTime = time();
foreach ($shareLinks as $key => $link) {
    if (isset($link["expires"]) && $link["expires"] < $currentTime) {
        unset($shareLinks[$key]);
    }
}

// Add the new share record.
$shareLinks[$token] = [
    "folder" => $folder,
    "expires" => $expires,
    "password" => $hashedPassword,
    "allowUpload" => $allowUpload
];

// Save the share links.
if (file_put_contents($shareFile, json_encode($shareLinks, JSON_PRETTY_PRINT))) {
// Determine base URL.
if (defined('BASE_URL') && !empty(BASE_URL) && strpos(BASE_URL, 'yourwebsite') === false) {
    $baseUrl = rtrim(BASE_URL, '/');
} else {
    // Prefer HTTP_HOST over SERVER_ADDR.
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    // Use HTTP_HOST if set; fallback to gethostbyname if needed.
    $host = !empty($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : gethostbyname($_SERVER['SERVER_ADDR'] ?? 'localhost');
    $baseUrl = $protocol . "://" . $host;
}
    // The share URL points to shareFolder.php.
    $link = $baseUrl . "/shareFolder.php?token=" . urlencode($token);
    echo json_encode(["token" => $token, "expires" => $expires, "link" => $link]);
} else {
    echo json_encode(["error" => "Could not save share link."]);
}
?>