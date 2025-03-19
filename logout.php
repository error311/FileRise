<?php
session_start();
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

// Fallback: If a CSRF token exists in the session and doesn't match the one provided,
// log the mismatch but proceed with logout.
if (isset($_SESSION['csrf_token']) && $receivedToken !== $_SESSION['csrf_token']) {
    // Optionally log this event:
    error_log("CSRF token mismatch on logout. Proceeding with logout.");
}

$_SESSION = []; // Clear session data
session_destroy(); // Destroy session

header('Content-Type: application/json');
echo json_encode(["success" => "Logged out"]);
exit;
?>