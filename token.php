<?php
require 'config.php'; // Must call session_start() and generate CSRF token if not set
header('Content-Type: application/json');
echo json_encode(["csrf_token" => $_SESSION['csrf_token']]);
?>