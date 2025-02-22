<?php
session_start();
$_SESSION = []; // Clear session data
session_destroy(); // Destroy session

header('Content-Type: application/json');
echo json_encode(["success" => "Logged out"]);
exit;
?>
