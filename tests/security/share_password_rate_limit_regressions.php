<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (($argv[1] ?? '') === '--case') {
    $caseDir = rtrim((string)($argv[2] ?? ''), "/\\") . '/';
    $action = (string)($argv[3] ?? 'attempt');
    $token = (string)($argv[4] ?? 'share-token');
    $password = (string)($argv[5] ?? 'wrong-password');
    $clientIp = (string)($argv[6] ?? '203.0.113.10');
    $forwarded = (string)($argv[7] ?? '');

    putenv('FR_TEST_UPLOAD_DIR=' . $caseDir . 'uploads');
    putenv('FR_TEST_USERS_DIR=' . $caseDir . 'users');
    putenv('FR_TEST_META_DIR=' . $caseDir . 'metadata');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    putenv('FR_TRUSTED_PROXIES=10.0.0.2');
    putenv('FR_IP_HEADER=X-Forwarded-For');

    $_SERVER['REMOTE_ADDR'] = $clientIp;
    $_SERVER['HTTP_X_FORWARDED_FOR'] = $forwarded;
    $_SERVER['HTTP_ACCEPT'] = 'application/json';
    $_SERVER['HTTP_HOST'] = 'localhost';
    $_SERVER['REQUEST_METHOD'] = 'GET';

    require $baseDir . '/config/config.php';

    if ($action === 'http' || $action === 'file_http') {
        $_GET = ['token' => $token];
        if ($password !== '') {
            $_GET['pass'] = $password;
        }
        register_shutdown_function(static function (): void {
            $status = http_response_code();
            echo "\n__HTTP_STATUS__" . ($status === false ? 200 : $status) . "\n";
        });
        if ($action === 'file_http') {
            (new \FileRise\Http\Controllers\FileController())->shareFile();
        } else {
            (new \FileRise\Http\Controllers\FolderController())->shareFolder();
        }
        exit(0);
    }

    try {
        if ($action === 'file') {
            $result = \FileRise\Domain\FolderModel::getSharedFileInfo(
                $token,
                'visible.txt',
                $password
            );
        } elseif ($action === 'success') {
            \FileRise\Support\SharePasswordAttemptLimiter::recordSuccess($token, $clientIp);
            $result = ['cleared' => true];
        } else {
            $result = \FileRise\Support\SharePasswordAttemptLimiter::beginAttempt($token, $clientIp);
        }
        echo json_encode(['ok' => true, 'result' => $result], JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_THROW_ON_ERROR);
    }
    exit(0);
}

function sharePasswordRateRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        sharePasswordRateRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function sharePasswordRateRun(
    string $script,
    string $caseDir,
    string $action,
    string $token,
    string $password,
    string $ip,
    string $forwarded = ''
): array {
    $command = escapeshellarg(PHP_BINARY)
        . ' ' . escapeshellarg($script)
        . ' --case ' . escapeshellarg($caseDir)
        . ' ' . escapeshellarg($action)
        . ' ' . escapeshellarg($token)
        . ' ' . escapeshellarg($password)
        . ' ' . escapeshellarg($ip)
        . ' ' . escapeshellarg($forwarded);
    exec($command, $output, $exitCode);
    $text = implode("\n", $output);
    $status = 0;
    if (preg_match('/__HTTP_STATUS__(\d+)/', $text, $matches)) {
        $status = (int)$matches[1];
    }
    $jsonText = trim((string)preg_replace('/__HTTP_STATUS__\d+/', '', $text));
    $decoded = json_decode($jsonText, true);
    return [
        'exit' => $exitCode,
        'status' => $status,
        'output' => $text,
        'json' => is_array($decoded) ? $decoded : null,
    ];
}

function sharePasswordRateStart(
    string $script,
    string $caseDir,
    string $token,
    string $ip
): array {
    $command = escapeshellarg(PHP_BINARY)
        . ' ' . escapeshellarg($script)
        . ' --case ' . escapeshellarg($caseDir)
        . ' attempt ' . escapeshellarg($token)
        . ' placeholder ' . escapeshellarg($ip);
    $pipes = [];
    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Failed to start concurrent share-password limiter case.');
    }
    return [$process, $pipes];
}

function sharePasswordRateFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

$tmpBase = sys_get_temp_dir() . '/filerise_share_password_rate_' . bin2hex(random_bytes(6));
@mkdir($tmpBase . '/uploads/shared', 0775, true);
@mkdir($tmpBase . '/users', 0700, true);
@mkdir($tmpBase . '/metadata', 0775, true);
file_put_contents($tmpBase . '/uploads/shared/visible.txt', 'protected share content', LOCK_EX);

$shareToken = 'protected-share-token';
$fileShareToken = '0123456789abcdef0123456789abcdef';
$sharePassword = 'Correct Horse Battery Staple';
$shares = [
    $shareToken => [
        'folder' => 'shared',
        'expires' => time() + 3600,
        'password' => password_hash($sharePassword, PASSWORD_DEFAULT),
        'allowUpload' => 1,
        'allowSubfolders' => 0,
        'mode' => 'browse',
        'hideListing' => 0,
    ],
];
file_put_contents(
    $tmpBase . '/metadata/share_folder_links.json',
    json_encode($shares, JSON_PRETTY_PRINT),
    LOCK_EX
);
file_put_contents(
    $tmpBase . '/metadata/share_links.json',
    json_encode([
        $fileShareToken => [
            'folder' => 'shared',
            'file' => 'visible.txt',
            'expires' => time() + 3600,
            'password' => password_hash($sharePassword, PASSWORD_DEFAULT),
        ],
    ], JSON_PRETTY_PRINT),
    LOCK_EX
);

$errors = [];

try {
    // Opening the password form does not consume the verification budget.
    for ($i = 1; $i <= 8; $i++) {
        $missing = sharePasswordRateRun(__FILE__, $tmpBase, 'http', $shareToken, '', '203.0.113.10');
        sharePasswordRateFailIf(
            $missing['exit'] !== 0 || $missing['status'] !== 200,
            "Missing-password request {$i} should render the password form.",
            $errors
        );
    }

    // The exact reported public endpoint allows five failures and rate-limits the sixth.
    for ($i = 1; $i <= 5; $i++) {
        $wrong = sharePasswordRateRun(
            __FILE__,
            $tmpBase,
            'http',
            $shareToken,
            'wrong-' . $i,
            '203.0.113.10',
            '198.51.100.' . $i
        );
        sharePasswordRateFailIf(
            $wrong['exit'] !== 0 || $wrong['status'] !== 403,
            "Wrong-password request {$i} should return HTTP 403.",
            $errors
        );
    }
    $locked = sharePasswordRateRun(
        __FILE__,
        $tmpBase,
        'http',
        $shareToken,
        'wrong-6',
        '203.0.113.10',
        '198.51.100.99'
    );
    sharePasswordRateFailIf(
        $locked['status'] !== 429 || !str_contains($locked['output'], 'Too many password attempts'),
        'Sixth wrong password did not return HTTP 429.',
        $errors
    );

    // A different source is not locked and can still use the correct password.
    $otherSource = sharePasswordRateRun(
        __FILE__,
        $tmpBase,
        'http',
        $shareToken,
        $sharePassword,
        '203.0.113.11'
    );
    sharePasswordRateFailIf(
        $otherSource['exit'] !== 0 || $otherSource['status'] !== 200,
        'A different source could not use the correct share password.',
        $errors
    );

    // Individual file shares use the same bounded password-verification path.
    for ($i = 1; $i <= 5; $i++) {
        $wrong = sharePasswordRateRun(
            __FILE__,
            $tmpBase,
            'file_http',
            $fileShareToken,
            'file-wrong-' . $i,
            '203.0.113.30'
        );
        sharePasswordRateFailIf(
            $wrong['exit'] !== 0 || $wrong['status'] !== 403,
            "File-share wrong-password request {$i} should return HTTP 403.",
            $errors
        );
    }
    $fileLocked = sharePasswordRateRun(
        __FILE__,
        $tmpBase,
        'file_http',
        $fileShareToken,
        'file-wrong-6',
        '203.0.113.30'
    );
    sharePasswordRateFailIf(
        $fileLocked['status'] !== 429 || !str_contains($fileLocked['output'], 'Too many password attempts'),
        'Sixth file-share wrong password did not return HTTP 429.',
        $errors
    );

    // Listing and download checks consume the same share/source budget.
    $crossIp = '203.0.113.12';
    for ($i = 1; $i <= 4; $i++) {
        $wrong = sharePasswordRateRun(
            __FILE__,
            $tmpBase,
            'http',
            $shareToken,
            'cross-' . $i,
            $crossIp
        );
        sharePasswordRateFailIf($wrong['status'] !== 403, "Cross-endpoint attempt {$i} should return 403.", $errors);
    }
    $fileWrong = sharePasswordRateRun(
        __FILE__,
        $tmpBase,
        'file',
        $shareToken,
        'cross-5',
        $crossIp
    );
    sharePasswordRateFailIf(
        ($fileWrong['json']['result']['error'] ?? '') !== 'Invalid password.',
        'Download password failure did not share the listing attempt budget.',
        $errors
    );
    $crossLocked = sharePasswordRateRun(
        __FILE__,
        $tmpBase,
        'http',
        $shareToken,
        'cross-6',
        $crossIp
    );
    sharePasswordRateFailIf($crossLocked['status'] !== 429, 'Cross-endpoint sixth attempt was not limited.', $errors);

    // Successful verification clears the pair budget while retaining prior source-wide failures.
    $successToken = 'success-clear-token';
    $successIp = '203.0.113.20';
    for ($i = 0; $i < 3; $i++) {
        $attempt = sharePasswordRateRun(__FILE__, $tmpBase, 'attempt', $successToken, '', $successIp);
        sharePasswordRateFailIf(empty($attempt['json']['result']['allowed']), 'Pre-success attempt was rejected.', $errors);
    }
    $cleared = sharePasswordRateRun(__FILE__, $tmpBase, 'success', $successToken, '', $successIp);
    sharePasswordRateFailIf(empty($cleared['json']['result']['cleared']), 'Successful verification did not clear the pair.', $errors);
    for ($i = 1; $i <= 5; $i++) {
        $attempt = sharePasswordRateRun(__FILE__, $tmpBase, 'attempt', $successToken, '', $successIp);
        sharePasswordRateFailIf(empty($attempt['json']['result']['allowed']), "Post-success attempt {$i} was rejected.", $errors);
    }
    $relocked = sharePasswordRateRun(__FILE__, $tmpBase, 'attempt', $successToken, '', $successIp);
    sharePasswordRateFailIf(!empty($relocked['json']['result']['allowed']), 'Pair was not limited again after five failures.', $errors);

    // Source-wide budget prevents token rotation without creating a global per-share denial of service.
    $sourceIp = '192.0.2.50';
    for ($i = 1; $i <= 50; $i++) {
        $attempt = sharePasswordRateRun(__FILE__, $tmpBase, 'attempt', 'rotating-token-' . $i, '', $sourceIp);
        sharePasswordRateFailIf(empty($attempt['json']['result']['allowed']), "Source attempt {$i} was rejected.", $errors);
    }
    $sourceLocked = sharePasswordRateRun(__FILE__, $tmpBase, 'attempt', 'rotating-token-51', '', $sourceIp);
    sharePasswordRateFailIf(!empty($sourceLocked['json']['result']['allowed']), 'Token rotation bypassed the source limit.', $errors);

    // Concurrent requests cannot reserve more than the five-attempt pair budget.
    $workers = [];
    for ($i = 0; $i < 16; $i++) {
        $workers[] = sharePasswordRateStart(__FILE__, $tmpBase, 'parallel-token', '198.51.100.60');
    }
    $allowedCount = 0;
    foreach ($workers as [$process, $pipes]) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        $decoded = json_decode(trim((string)$stdout), true);
        sharePasswordRateFailIf($exitCode !== 0, 'Concurrent limiter worker failed: ' . trim((string)$stderr), $errors);
        sharePasswordRateFailIf(!is_array($decoded) || empty($decoded['ok']), 'Concurrent limiter worker returned invalid output.', $errors);
        if (!empty($decoded['result']['allowed'])) {
            $allowedCount++;
        }
    }
    sharePasswordRateFailIf(
        $allowedCount !== 5,
        "Concurrent share budget allowed {$allowedCount} attempts instead of 5.",
        $errors
    );
} finally {
    sharePasswordRateRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Share password rate-limit regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Share password rate-limit regressions passed\n";
