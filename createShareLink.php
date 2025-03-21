<?php
// createShareLink.php
require_once 'config.php';

// Get POST input.
$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    echo json_encode(["error" => "Invalid input."]);
    exit;
}

$folder = isset($input['folder']) ? trim($input['folder']) : "";
$file = isset($input['file']) ? basename($input['file']) : "";
$expirationMinutes = isset($input['expirationMinutes']) ? intval($input['expirationMinutes']) : 60;
$password = isset($input['password']) ? $input['password'] : "";

// Validate folder using regex.
if ($folder !== 'root' && !preg_match('/^[A-Za-z0-9_\- \/]+$/', $folder)) {
    echo json_encode(["error" => "Invalid folder name."]);
    exit;
}

// Generate a secure token.
$token = bin2hex(random_bytes(16)); // 32 hex characters.

// Calculate expiration (Unix timestamp).
$expires = time() + ($expirationMinutes * 60);

// Hash password if provided.
$hashedPassword = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : "";

// File to store share links.
$shareFile = META_DIR . "share_links.json";
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
    if ($link["expires"] < $currentTime) {
        unset($shareLinks[$key]);
    }
}

// Add record.
$shareLinks[$token] = [
    "folder" => $folder,
    "file" => $file,
    "expires" => $expires,
    "password" => $hashedPassword
];

// Save the share links.
if (file_put_contents($shareFile, json_encode($shareLinks, JSON_PRETTY_PRINT))) {
    echo json_encode(["token" => $token, "expires" => $expires]);
} else {
    echo json_encode(["error" => "Could not save share link."]);
}
?>