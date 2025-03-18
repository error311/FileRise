<?php
session_start();
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';
if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}
$_SESSION = []; // Clear session data
session_destroy(); // Destroy session

header('Content-Type: application/json');
echo json_encode(["success" => "Logged out"]);
exit;
?>
