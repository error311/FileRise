<?php
// totp_recover.php

require_once 'config.php';

header('Content-Type: application/json');

// ——— 1) Only POST ———
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    error_log("Recovery attempt with invalid method: {$_SERVER['REQUEST_METHOD']}");
    exit(json_encode(['status'=>'error','message'=>'Method not allowed']));
}

// ——— 2) CSRF check ———
if (empty($_SERVER['HTTP_X_CSRF_TOKEN']) 
 || $_SERVER['HTTP_X_CSRF_TOKEN'] !== ($_SESSION['csrf_token'] ?? '')) {
    http_response_code(403);
    error_log("Invalid CSRF token on recovery for IP {$_SERVER['REMOTE_ADDR']}");
    exit(json_encode(['status'=>'error','message'=>'Invalid CSRF token']));
}

// ——— 3) Identify user to recover ———
$userId = $_SESSION['username'] 
        ?? $_SESSION['pending_login_user'] 
        ?? null;

if (!$userId) {
    http_response_code(401);
    error_log("Unauthorized recovery attempt from IP {$_SERVER['REMOTE_ADDR']}");
    exit(json_encode(['status'=>'error','message'=>'Unauthorized']));
}

// ——— Validate userId format ———
if (!preg_match('/^[A-Za-z0-9_\-]+$/', $userId)) {
    http_response_code(400);
    error_log("Invalid userId format: {$userId}");
    exit(json_encode(['status'=>'error','message'=>'Invalid user identifier']));
}

// ——— Rate‑limit recovery attempts ———
$attemptsFile = rtrim(USERS_DIR, '/\\') . '/recovery_attempts.json';
$attempts     = is_file($attemptsFile)
                ? json_decode(file_get_contents($attemptsFile), true)
                : [];
$key = $_SERVER['REMOTE_ADDR'] . '|' . $userId;
$now = time();
// Prune >15 min old
if (isset($attempts[$key])) {
    $attempts[$key] = array_filter(
      $attempts[$key],
      fn($ts) => $ts > $now - 900
    );
}
if (count($attempts[$key] ?? []) >= 5) {
    http_response_code(429);
    exit(json_encode(['status'=>'error','message'=>'Too many attempts. Try again later.']));
}

// ——— 4) Load user metadata file ———
$userFile = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . $userId . '.json';
if (!file_exists($userFile)) {
    http_response_code(404);
    error_log("User file not found for recovery: {$userFile}");
    exit(json_encode(['status'=>'error','message'=>'User not found']));
}

// ——— 5) Read & lock file ———
$fp = fopen($userFile, 'c+');
if (!$fp || !flock($fp, LOCK_EX)) {
    http_response_code(500);
    error_log("Failed to lock user file: {$userFile}");
    exit(json_encode(['status'=>'error','message'=>'Server error']));
}
$data = json_decode(stream_get_contents($fp), true) ?: [];

// ——— 6) Verify recovery code ———
$input = json_decode(file_get_contents('php://input'), true)['recovery_code'] ?? '';
if (!$input) {
    flock($fp, LOCK_UN);
    fclose($fp);
    http_response_code(400);
    exit(json_encode(['status'=>'error','message'=>'Recovery code required']));
}

$hash = $data['totp_recovery_code'] ?? null;
if (!$hash || !password_verify($input, $hash)) {
    // record failed attempt
    $attempts[$key][] = $now;
    file_put_contents($attemptsFile, json_encode($attempts), LOCK_EX);

    flock($fp, LOCK_UN);
    fclose($fp);
    error_log("Invalid recovery code for user {$userId} from IP {$_SERVER['REMOTE_ADDR']}");
    exit(json_encode(['status'=>'error','message'=>'Invalid recovery code']));
}

// ——— 7) Invalidate code & save ———
$data['totp_recovery_code'] = null;
rewind($fp);
ftruncate($fp, 0);
fwrite($fp, json_encode($data)); // no pretty-print in prod
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

// ——— 8) Finalize login ———
session_regenerate_id(true);
$_SESSION['authenticated'] = true;
$_SESSION['username']      = $userId;
unset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret']);

// ——— 9) Success ———
echo json_encode(['status'=>'ok']);
exit;