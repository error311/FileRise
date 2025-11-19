<?php
// public/api/admin/acl/saveGrants.php
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

$headers = function_exists('getallheaders') ? array_change_key_case(getallheaders(), CASE_LOWER) : [];
$csrf    = trim($headers['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));

if (empty($_SESSION['csrf_token']) || $csrf !== $_SESSION['csrf_token']) {
  http_response_code(403);
  echo json_encode(['error' => 'Invalid CSRF token']);
  exit;
}

$raw = file_get_contents('php://input');
$in  = json_decode((string)$raw, true);

try {
  $ctrl = new AclAdminController();
  $res  = $ctrl->saveUserGrantsPayload($in ?? []);
  echo json_encode($res, JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
  http_response_code(400);
  echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Failed to save grants', 'detail' => $e->getMessage()]);
}