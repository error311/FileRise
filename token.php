<?php
require_once 'config.php';
header('Content-Type: application/json');
echo json_encode([
    "csrf_token" => $_SESSION['csrf_token'],
    "share_url"  => SHARE_URL
]);
?>