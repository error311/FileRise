<?php
// public/api/admin/acl/saveGrants.php

/**
 * @OA\Post(
 *   path="/api/admin/acl/saveGrants.php",
 *   summary="Save ACL grants (single-user or batch)",
 *   tags={"Admin","ACL"},
 *   security={{"cookieAuth":{}}},
 *   @OA\RequestBody(
 *     required=true,
 *     description="Either {user,grants} or {changes:[{user,grants}]}",
 *     @OA\JsonContent(oneOf={
 *       @OA\Schema(ref="#/components/schemas/SaveGrantsSingle"),
 *       @OA\Schema(ref="#/components/schemas/SaveGrantsBatch")
 *     })
 *   ),
 *   @OA\Response(response=200, description="Saved"),
 *   @OA\Response(response=400, description="Invalid payload"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Invalid CSRF")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json');

// ---- Auth + CSRF -----------------------------------------------------------
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

// ---- Helpers ---------------------------------------------------------------
/**
 * Sanitize a grants map to allowed flags only:
 * view | viewOwn | upload | manage | share
 */
function sanitize_grants_map(array $grants): array {
  $allowed = ['view','viewOwn','upload','manage','share'];
  $out = [];
  foreach ($grants as $folder => $caps) {
    if (!is_string($folder)) $folder = (string)$folder;
    if (!is_array($caps))    $caps   = [];
    $row = [];
    foreach ($allowed as $k) {
      $row[$k] = !empty($caps[$k]);
    }
    // include folder even if all false (signals "remove all for this user on this folder")
    $out[$folder] = $row;
  }
  return $out;
}

function valid_user(string $u): bool {
  return ($u !== '' && preg_match(REGEX_USER, $u));
}

// ---- Read JSON body --------------------------------------------------------
$raw = file_get_contents('php://input');
$in  = json_decode((string)$raw, true);
if (!is_array($in)) {
  http_response_code(400);
  echo json_encode(['error' => 'Invalid JSON']);
  exit;
}

// ---- Single user mode: { user, grants } ------------------------------------
if (isset($in['user']) && isset($in['grants']) && is_array($in['grants'])) {
  $user = trim((string)$in['user']);
  if (!valid_user($user)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid user']);
    exit;
  }

  $grants = sanitize_grants_map($in['grants']);

  try {
    $res = ACL::applyUserGrantsAtomic($user, $grants);
    echo json_encode($res, JSON_UNESCAPED_SLASHES);
    exit;
  } catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save grants', 'detail' => $e->getMessage()]);
    exit;
  }
}

// ---- Batch mode: { changes: [ { user, grants }, ... ] } --------------------
if (isset($in['changes']) && is_array($in['changes'])) {
  $updated = [];
  foreach ($in['changes'] as $chg) {
    if (!is_array($chg)) continue;
    $user = trim((string)($chg['user'] ?? ''));
    $gr   = $chg['grants'] ?? null;
    if (!valid_user($user) || !is_array($gr)) continue;

    try {
      $res = ACL::applyUserGrantsAtomic($user, sanitize_grants_map($gr));
      $updated[$user] = $res['updated'] ?? [];
    } catch (Throwable $e) {
      $updated[$user] = ['error' => $e->getMessage()];
    }
  }
  echo json_encode(['ok' => true, 'updated' => $updated], JSON_UNESCAPED_SLASHES);
  exit;
}

// ---- Fallback --------------------------------------------------------------
http_response_code(400);
echo json_encode(['error' => 'Invalid payload: expected {user,grants} or {changes:[{user,grants}]}']);