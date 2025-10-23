<?php
// public/api/admin/acl/saveGrants.php
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
function normalize_caps(array $row): array {
  // booleanize known keys
  $bool = function($v){ return !empty($v) && $v !== 'false' && $v !== 0; };
  $k = [
    'view','viewOwn','upload','manage','share',
    'create','edit','rename','copy','move','delete','extract',
    'shareFile','shareFolder','write'
  ];
  $out = [];
  foreach ($k as $kk) $out[$kk] = $bool($row[$kk] ?? false);

  // BUSINESS RULES:
  // A) Share Folder REQUIRES View (all). If shareFolder is true but view is false, force view=true.
  if ($out['shareFolder'] && !$out['view']) {
    $out['view'] = true;
  }

  // B) Share File requires at least View (own). If neither view nor viewOwn set, set viewOwn=true.
  if ($out['shareFile'] && !$out['view'] && !$out['viewOwn']) {
    $out['viewOwn'] = true;
  }

  // C) "write" does NOT imply view. It also does not imply granular here; ACL expands legacy write if present.
  return $out;
}

function sanitize_grants_map(array $grants): array {
  $out = [];
  foreach ($grants as $folder => $caps) {
    if (!is_string($folder)) $folder = (string)$folder;
    if (!is_array($caps))    $caps   = [];
    $out[$folder] = normalize_caps($caps);
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
