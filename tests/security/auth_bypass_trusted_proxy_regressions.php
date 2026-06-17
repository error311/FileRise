<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (getenv('FR_AUTH_BYPASS_CHILD') === '1') {
    $sessionDir = (string)getenv('FR_AUTH_BYPASS_SESSION_DIR');
    if ($sessionDir !== '') {
        session_save_path($sessionDir);
    }

    $trusted = getenv('FR_AUTH_BYPASS_TRUSTED');
    if ($trusted !== false) {
        putenv('FR_TRUSTED_PROXIES=' . $trusted);
    }

    $_SERVER['REMOTE_ADDR'] = (string)(getenv('FR_AUTH_BYPASS_REMOTE') ?: '');
    $_SERVER['HTTP_X_REMOTE_USER'] = 'admin';
    $_SERVER['HTTP_HOST'] = 'localhost';

    require_once $baseDir . '/config/config.php';

    echo json_encode([
        'authenticated' => !empty($_SESSION['authenticated']),
        'username' => $_SESSION['username'] ?? null,
        'isAdmin' => $_SESSION['isAdmin'] ?? null,
    ]);
    exit(0);
}

$tmpBase = $baseDir . '/tests/.tmp_auth_bypass_' . bin2hex(random_bytes(4));
$usersDir = $tmpBase . '/users/';
$uploadDir = $tmpBase . '/uploads/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function authBypassFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function authBypassRmTree(string $dir): void
{
    if (!file_exists($dir) && !is_link($dir)) {
        return;
    }
    if (is_link($dir) || is_file($dir)) {
        @unlink($dir);
        return;
    }
    $items = scandir($dir);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        authBypassRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

function runAuthBypassCase(string $usersDir, string $uploadDir, string $metaDir, string $sessionDir, string $remote, string $trusted): array
{
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__);
    $env = array_merge($_ENV, [
        'FR_AUTH_BYPASS_CHILD' => '1',
        'FR_AUTH_BYPASS_REMOTE' => $remote,
        'FR_AUTH_BYPASS_TRUSTED' => $trusted,
        'FR_AUTH_BYPASS_SESSION_DIR' => $sessionDir,
        'FR_TEST_USERS_DIR' => $usersDir,
        'FR_TEST_UPLOAD_DIR' => $uploadDir,
        'FR_TEST_META_DIR' => $metaDir,
        'PERSISTENT_TOKENS_KEY' => 'test_persistent_tokens_key_32bytes!',
    ]);

    $descriptor = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = proc_open($cmd, $descriptor, $pipes, dirname(__DIR__, 2), $env);
    if (!is_resource($proc)) {
        return ['error' => 'failed to start child process'];
    }

    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);

    $data = json_decode(trim((string)$stdout), true);
    if ($code !== 0 || !is_array($data)) {
        return [
            'error' => 'child failed code=' . $code . ' stdout=' . trim((string)$stdout) . ' stderr=' . trim((string)$stderr),
        ];
    }
    return $data;
}

@mkdir($usersDir, 0700, true);
@mkdir($uploadDir, 0775, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);

file_put_contents($usersDir . 'users.txt', 'admin:unused:1' . PHP_EOL, LOCK_EX);
file_put_contents(
    $usersDir . 'adminConfig.json',
    json_encode([
        'loginOptions' => [
            'authBypass' => true,
            'authHeaderName' => 'X-Remote-User',
        ],
    ], JSON_PRETTY_PRINT),
    LOCK_EX
);

$errors = [];

try {
    $noTrusted = runAuthBypassCase($usersDir, $uploadDir, $metaDir, $sessionDir, '127.0.0.1', '');
    authBypassFailIf(!empty($noTrusted['error']), 'noTrusted: ' . ($noTrusted['error'] ?? ''), $errors);
    authBypassFailIf(!empty($noTrusted['authenticated']), 'noTrusted: proxy auth should be rejected without FR_TRUSTED_PROXIES', $errors);

    $untrusted = runAuthBypassCase($usersDir, $uploadDir, $metaDir, $sessionDir, '192.0.2.50', '127.0.0.1');
    authBypassFailIf(!empty($untrusted['error']), 'untrusted: ' . ($untrusted['error'] ?? ''), $errors);
    authBypassFailIf(!empty($untrusted['authenticated']), 'untrusted: proxy auth should be rejected from untrusted REMOTE_ADDR', $errors);

    $trustedExact = runAuthBypassCase($usersDir, $uploadDir, $metaDir, $sessionDir, '127.0.0.1', '127.0.0.1');
    authBypassFailIf(!empty($trustedExact['error']), 'trustedExact: ' . ($trustedExact['error'] ?? ''), $errors);
    authBypassFailIf(empty($trustedExact['authenticated']), 'trustedExact: proxy auth should be accepted from trusted REMOTE_ADDR', $errors);
    authBypassFailIf(($trustedExact['username'] ?? '') !== 'admin', 'trustedExact: username mismatch', $errors);
    authBypassFailIf(($trustedExact['isAdmin'] ?? null) !== true, 'trustedExact: admin role mismatch', $errors);

    $trustedCidr = runAuthBypassCase($usersDir, $uploadDir, $metaDir, $sessionDir, '10.1.2.3', '10.0.0.0/8');
    authBypassFailIf(!empty($trustedCidr['error']), 'trustedCidr: ' . ($trustedCidr['error'] ?? ''), $errors);
    authBypassFailIf(empty($trustedCidr['authenticated']), 'trustedCidr: proxy auth should support trusted CIDR entries', $errors);
} finally {
    authBypassRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "AUTH_BYPASS trusted proxy regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "AUTH_BYPASS trusted proxy regressions passed\n";
