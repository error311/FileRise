<?php
// public/api/admin/acl/getGrants.php
declare(strict_types=1);

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AclAdminController.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json');

if (empty($_SESSION['authenticated']) || empty($_SESSION['isAdmin'])) {
  http_response_code(401);
  echo json_encode(['error' => 'Unauthorized']);
  exit;
}

$user = trim((string)($_GET['user'] ?? ''));
try {
  $ctrl   = new AclAdminController();
  $grants = $ctrl->getUserGrants($user);
  echo json_encode(['grants' => $grants], JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
  http_response_code(400);
  echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Failed to load grants', 'detail' => $e->getMessage()]);
}