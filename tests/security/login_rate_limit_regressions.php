<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_login_rate_limit_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionRoot = $tmpBase . '/sessions/';

function loginRateFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function loginRateRmTree(string $dir): void
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
        loginRateRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir, 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionRoot, 0700, true);

$runner = $tmpBase . '/login_attempt.php';
$baseExport = var_export($baseDir, true);
$uploadExport = var_export($uploadDir, true);
$usersExport = var_export($usersDir, true);
$metaExport = var_export($metaDir, true);
$sessionExport = var_export($sessionRoot, true);

file_put_contents($runner, <<<PHP
<?php
declare(strict_types=1);

\$baseDir = {$baseExport};
\$sessionDir = {$sessionExport} . 'run_' . bin2hex(random_bytes(4)) . '/';
@mkdir(\$sessionDir, 0700, true);
session_save_path(\$sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . {$uploadExport});
putenv('FR_TEST_USERS_DIR=' . {$usersExport});
putenv('FR_TEST_META_DIR=' . {$metaExport});
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

\$_SERVER['REMOTE_ADDR'] = (string)(\$argv[2] ?? '203.0.113.10');
\$_SERVER['HTTP_HOST'] = 'localhost';
\$_SERVER['REQUEST_METHOD'] = 'POST';

register_shutdown_function(static function (): void {
    echo "\\n__HTTP_STATUS__" . http_response_code() . "\\n";
});

require_once \$baseDir . '/config/config.php';
require_once \$baseDir . '/src/FileRise/Http/Controllers/AuthController.php';

class LoginRateLimitTestController extends \\FileRise\\Http\\Controllers\\AuthController
{
    public function attempt(string \$username): void
    {
        \$this->handleFormLogin(\$username, 'wrong-password', false);
    }
}

\$controller = new LoginRateLimitTestController();
\$controller->attempt((string)(\$argv[1] ?? 'alice'));
PHP, LOCK_EX);

function loginRateAttempt(string $runner, string $username, string $ip = '203.0.113.10'): array
{
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($runner) . ' ' . escapeshellarg($username) . ' ' . escapeshellarg($ip);
    $lines = [];
    $exitCode = 0;
    exec($cmd, $lines, $exitCode);
    $output = implode("\n", $lines);
    $status = 0;
    if (preg_match('/__HTTP_STATUS__(\d+)/', $output, $m)) {
        $status = (int)$m[1];
    }
    return [
        'exit' => $exitCode,
        'status' => $status,
        'output' => $output,
    ];
}

$errors = [];

try {
    for ($i = 1; $i <= 5; $i++) {
        $res = loginRateAttempt($runner, 'sameuser', '203.0.113.10');
        loginRateFailIf($res['status'] !== 401, "same-user attempt {$i}: expected HTTP 401", $errors);
    }
    $locked = loginRateAttempt($runner, 'sameuser', '203.0.113.10');
    loginRateFailIf($locked['status'] !== 429, 'same-user attempt 6: expected HTTP 429', $errors);

    @unlink($usersDir . 'failed_logins.json');

    for ($i = 1; $i <= 50; $i++) {
        $res = loginRateAttempt($runner, 'sprayuser' . $i, '203.0.113.20');
        loginRateFailIf($res['status'] !== 401, "rotating-user attempt {$i}: expected HTTP 401", $errors);
    }
    $sprayLocked = loginRateAttempt($runner, 'sprayuser51', '203.0.113.20');
    loginRateFailIf($sprayLocked['status'] !== 429, 'rotating-user attempt 51: expected HTTP 429 from IP-wide limit', $errors);

    $otherIp = loginRateAttempt($runner, 'sprayuser52', '203.0.113.21');
    loginRateFailIf($otherIp['status'] !== 401, 'different IP should not inherit the source-wide lockout', $errors);
} finally {
    loginRateRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Login rate-limit regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Login rate-limit regressions passed\n";
