<?php
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';

header('Content-Type: application/json');

if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['error'=>'Unauthorized']);
    exit;
}

$user = $_SESSION['username'];
$data = UserModel::getUser($user);
echo json_encode($data);