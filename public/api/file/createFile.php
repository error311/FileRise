<?php
// public/api/file/createFile.php

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/FileController.php';

header('Content-Type: application/json');
if (empty($_SESSION['authenticated'])) {
  http_response_code(401);
  echo json_encode(['success'=>false,'error'=>'Unauthorized']);
  exit;
}

$fc = new FileController();
$fc->createFile();