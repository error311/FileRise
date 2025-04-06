<?php
// totp_saveCode.php

require_once 'config.php';

header('Content-Type: application/json');

// 1) Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    error_log("totp_saveCode: invalid method {$_SERVER['REQUEST_METHOD']}");
    exit(json_encode(['status'=>'error','message'=>'Method not allowed']));
}

// 2) CSRF check
if (empty($_SERVER['HTTP_X_CSRF_TOKEN']) 
 || $_SERVER['HTTP_X_CSRF_TOKEN'] !== ($_SESSION['csrf_token'] ?? '')) {
    http_response_code(403);
    error_log("totp_saveCode: invalid CSRF token from IP {$_SERVER['REMOTE_ADDR']}");
    exit(json_encode(['status'=>'error','message'=>'Invalid CSRF token']));
}

// 3) Must be logged in
if (empty($_SESSION['username'])) {
    http_response_code(401);
    error_log("totp_saveCode: unauthorized attempt from IP {$_SERVER['REMOTE_ADDR']}");
    exit(json_encode(['status'=>'error','message'=>'Unauthorized']));
}

// 4) Validate username format
$userId = $_SESSION['username'];
if (!preg_match('/^[A-Za-z0-9_\-]+$/', $userId)) {
    http_response_code(400);
    error_log("totp_saveCode: invalid username format: {$userId}");
    exit(json_encode(['status'=>'error','message'=>'Invalid user identifier']));
}

// 5) Ensure user file exists (create if missing)
$userFile = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . $userId . '.json';
if (!file_exists($userFile)) {
    $defaultData = [];
    if (file_put_contents($userFile, json_encode($defaultData)) === false) {
        http_response_code(500);
        error_log("totp_saveCode: failed to create user file: {$userFile}");
        exit(json_encode(['status'=>'error','message'=>'Server error']));
    }
}

// 6) Generate secure recovery code
function generateRecoveryCode($length = 12) {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $max   = strlen($chars) - 1;
    $code  = '';
    for ($i = 0; $i < $length; $i++) {
        $code .= $chars[random_int(0, $max)];
    }
    return $code;
}
$recoveryCode = generateRecoveryCode();
$recoveryHash = password_hash($recoveryCode, PASSWORD_DEFAULT);

// 7) Read, lock, update user file
$fp = fopen($userFile, 'c+');
if (!$fp || !flock($fp, LOCK_EX)) {
    http_response_code(500);
    error_log("totp_saveCode: failed to lock user file: {$userFile}");
    exit(json_encode(['status'=>'error','message'=>'Server error']));
}

$data = json_decode(stream_get_contents($fp), true) ?: [];
$data['totp_recovery_code'] = $recoveryHash;

rewind($fp);
ftruncate($fp, 0);
fwrite($fp, json_encode($data)); // no pretty-print in prod
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

// 8) Return one-time recovery code
echo json_encode([
    'status'       => 'ok',
    'recoveryCode' => $recoveryCode
]);
exit;