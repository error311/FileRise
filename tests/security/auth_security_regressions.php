<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_auth_' . bin2hex(random_bytes(4));
$usersDir = $tmpBase . '/users/';
$sessionDir = $tmpBase . '/sessions/';

@mkdir($usersDir, 0700, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

$key = 'test_persistent_tokens_key_32bytes!';
putenv('PERSISTENT_TOKENS_KEY=' . $key);
putenv('FR_TEST_USERS_DIR=' . $usersDir);

function encryptForTest(string $data, string $key): string
{
    $cipher = 'AES-256-CBC';
    $ivlen  = openssl_cipher_iv_length($cipher);
    $iv     = openssl_random_pseudo_bytes($ivlen);
    $ct     = openssl_encrypt($data, $cipher, $key, OPENSSL_RAW_DATA, $iv);
    return base64_encode($iv . $ct);
}

function decryptForTest(string $data, string $key): string
{
    $cipher = 'AES-256-CBC';
    $raw = base64_decode($data);
    $ivlen  = openssl_cipher_iv_length($cipher);
    $iv     = substr($raw, 0, $ivlen);
    $ct     = substr($raw, $ivlen);
    return openssl_decrypt($ct, $cipher, $key, OPENSSL_RAW_DATA, $iv) ?: '';
}

function writeEncryptedJson(string $path, array $payload, string $key): void
{
    $json = json_encode($payload, JSON_PRETTY_PRINT);
    $enc = encryptForTest($json, $key);
    file_put_contents($path, $enc, LOCK_EX);
}

function readEncryptedJson(string $path, string $key): array
{
    if (!file_exists($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    $dec = decryptForTest($raw, $key);
    $data = json_decode($dec, true);
    return is_array($data) ? $data : [];
}

function rememberTokenHash(string $token, string $key): string
{
    return hash_hmac('sha256', $token, $key);
}

function failIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function rrmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            rrmdir($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

$token = 'tok_' . bin2hex(random_bytes(12));

$usersFile = $usersDir . 'users.txt';
$permsFile = $usersDir . 'userPermissions.json';
$tokensFile = $usersDir . 'persistent_tokens.json';

$userLine = 'alice:$2y$10$O5J7bX3GmJpJ6S.1oW6Hj.8L0N9csmXz7D8Gk4r.3hWBjC1u3n7De:0';
file_put_contents($usersFile, $userLine . PHP_EOL, LOCK_EX);

$permissions = [
    'alice' => [
        'folderOnly'    => true,
        'readOnly'      => true,
        'disableUpload' => true
    ]
];
writeEncryptedJson($permsFile, $permissions, $key);

$tokens = [
    rememberTokenHash($token, $key) => [
        'username' => 'alice',
        'expiry'   => time() + 3600,
        'isAdmin'  => false
    ]
];
writeEncryptedJson($tokensFile, $tokens, $key);

$_COOKIE['remember_me_token'] = $token;
require_once $baseDir . '/config/config.php';

$errors = [];

failIf(empty($_SESSION['authenticated']), 'auto-login: session not authenticated', $errors);
failIf(($_SESSION['username'] ?? '') !== 'alice', 'auto-login: username mismatch', $errors);
failIf($_SESSION['folderOnly'] !== true, 'auto-login: folderOnly should be true', $errors);
failIf($_SESSION['readOnly'] !== true, 'auto-login: readOnly should be true', $errors);
failIf($_SESSION['disableUpload'] !== true, 'auto-login: disableUpload should be true', $errors);
failIf(is_array($_SESSION['folderOnly']), 'auto-login: folderOnly should be boolean, not array', $errors);

$storeAfter = readEncryptedJson($tokensFile, $key);
$oldHash = rememberTokenHash($token, $key);
failIf(isset($storeAfter[$oldHash]), 'rotation: old token should be removed', $errors);
failIf(count($storeAfter) !== 1, 'rotation: expected 1 token after rotation', $errors);

$tokenB = 'tok_' . bin2hex(random_bytes(12));
$tokensB = [
    rememberTokenHash($tokenB, $key) => [
        'username' => 'alice',
        'expiry'   => time() + 3600,
        'isAdmin'  => false
    ]
];
writeEncryptedJson($tokensFile, $tokensB, $key);

$helper = __DIR__ . '/run_check_auth.php';
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($helper);
$env = array_merge($_ENV, [
    'FR_TEST_USERS_DIR'     => $usersDir,
    'PERSISTENT_TOKENS_KEY' => $key,
    'FR_TEST_REMEMBER_TOKEN'=> $tokenB
]);

$descriptor = [
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w']
];
$proc = proc_open($cmd, $descriptor, $pipes, $baseDir, $env);
if (is_resource($proc)) {
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);

    $data = json_decode(trim($stdout), true);
    failIf($code !== 0, 'checkAuth: helper exited with code ' . $code . ' stderr=' . trim($stderr), $errors);
    failIf(!is_array($data), 'checkAuth: invalid JSON output', $errors);
    if (is_array($data)) {
        failIf(empty($data['authenticated']), 'checkAuth: authenticated should be true', $errors);
        failIf(($data['username'] ?? '') !== 'alice', 'checkAuth: username mismatch', $errors);
        failIf(($data['readOnly'] ?? null) !== true, 'checkAuth: readOnly should be true', $errors);
        failIf(($data['disableUpload'] ?? null) !== true, 'checkAuth: disableUpload should be true', $errors);
    }
} else {
    $errors[] = 'checkAuth: failed to start helper process';
}

$expiredToken = 'tok_' . bin2hex(random_bytes(12));
$expired = [
    rememberTokenHash($expiredToken, $key) => [
        'username' => 'alice',
        'expiry'   => time() - 10,
        'isAdmin'  => false
    ]
];
writeEncryptedJson($tokensFile, $expired, $key);

$validated = \FileRise\Domain\AuthModel::validateRememberToken($expiredToken);
failIf($validated !== null, 'validateRememberToken: expired token should be rejected', $errors);

if ($errors) {
    echo "FAIL\n";
    foreach ($errors as $err) {
        echo '- ' . $err . "\n";
    }
    rrmdir($tmpBase);
    exit(1);
}

echo "OK\n";
rrmdir($tmpBase);
