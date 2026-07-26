<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (($argv[1] ?? '') === '--case') {
    $caseDir = rtrim((string)($argv[2] ?? ''), "/\\") . '/';
    $action = (string)($argv[3] ?? 'attempt');
    $username = (string)($argv[4] ?? 'alice');
    $clientIp = (string)($argv[5] ?? '203.0.113.10');
    $timeSlice = (int)($argv[6] ?? 1000);
    $secret = (string)($argv[7] ?? 'JBSWY3DPEHPK3PXP');
    $totpCode = (string)($argv[8] ?? '');

    putenv('FR_TEST_UPLOAD_DIR=' . $caseDir . 'uploads');
    putenv('FR_TEST_USERS_DIR=' . $caseDir . 'users');
    putenv('FR_TEST_META_DIR=' . $caseDir . 'metadata');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

    require $baseDir . '/config/config.php';

    try {
        if (
            $action === 'auth-handler'
            || $action === 'auth-handler-oidc-link'
            || $action === 'auth-handler-oidc-link-expired'
        ) {
            $secret = 'JBSWY3DPEHPK3PXP';
            $tfa = new \RobThree\Auth\TwoFactorAuth(
                new \RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider(),
                'FileRise',
                6,
                30,
                \RobThree\Auth\Algorithm::Sha1
            );
            if ($action === 'auth-handler-oidc-link' || $action === 'auth-handler-oidc-link-expired') {
                file_put_contents(
                    USERS_DIR . USERS_FILE,
                    $username . ':' . password_hash('GuidedLinkPass123!', PASSWORD_BCRYPT) . ':0' . PHP_EOL,
                    LOCK_EX
                );
                \FileRise\Support\OidcAccountLinker::begin(
                    'https://oidc.example.test',
                    'guided-link-subject',
                    $username,
                    true,
                    []
                );
                $_SESSION['pending_login_oidc_link'] = true;
                if ($action === 'auth-handler-oidc-link-expired') {
                    $_SESSION['pending_oidc_account_link']['created_at'] = time() - 301;
                }
            }
            $_SESSION['pending_login_user'] = $username;
            $_SESSION['pending_login_secret'] = $secret;
            $_SESSION['pending_login_remember_me'] = false;

            $controller = new class extends \FileRise\Http\Controllers\AuthController {
                public bool $finalized = false;

                public function runTotpStep(string $code): bool
                {
                    return $this->handleTotpStep($code);
                }

                protected function finalizeLogin(string $username, bool $rememberMe): void
                {
                    $this->finalized = $username !== '' && $rememberMe === false;
                }
            };
            $totpCode = $totpCode !== '' ? $totpCode : $tfa->getCode($secret);
            $handled = $controller->runTotpStep($totpCode);
            $result = [
                'handled' => $handled,
                'finalized' => $controller->finalized,
                'code' => $totpCode,
                'pendingCleared' => !isset(
                    $_SESSION['pending_login_user'],
                    $_SESSION['pending_login_secret']
                ),
                'oidcLinkCleared' => \FileRise\Support\OidcAccountLinker::getPendingUsername() === null,
                'oidcBindingCreated' => is_file(USERS_DIR . 'oidc_identities.json'),
                'role' => \FileRise\Domain\AuthModel::getUserRole($username),
            ];
        } elseif ($action === 'clear') {
            $accepted = \FileRise\Support\TotpAttemptLimiter::recordSuccess(
                $username,
                $clientIp,
                $secret,
                $timeSlice
            );
            $result = ['accepted' => $accepted];
        } else {
            $result = \FileRise\Support\TotpAttemptLimiter::beginAttempt($username, $clientIp);
        }
        echo json_encode(['ok' => true, 'result' => $result], JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_THROW_ON_ERROR);
    }
    exit(0);
}

function totpRateRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        totpRateRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function totpRateRun(
    string $script,
    string $caseDir,
    string $action,
    string $username,
    string $ip,
    int $timeSlice = 1000,
    string $secret = 'JBSWY3DPEHPK3PXP',
    string $totpCode = ''
): array
{
    $command = escapeshellarg(PHP_BINARY)
        . ' ' . escapeshellarg($script)
        . ' --case ' . escapeshellarg($caseDir)
        . ' ' . escapeshellarg($action)
        . ' ' . escapeshellarg($username)
        . ' ' . escapeshellarg($ip)
        . ' ' . escapeshellarg((string)$timeSlice)
        . ' ' . escapeshellarg($secret)
        . ' ' . escapeshellarg($totpCode);
    exec($command, $output, $exitCode);
    if ($exitCode !== 0) {
        throw new RuntimeException("TOTP limiter case {$action} failed to run.");
    }
    $decoded = json_decode(implode("\n", $output), true);
    if (!is_array($decoded)) {
        throw new RuntimeException("TOTP limiter case {$action} returned invalid JSON.");
    }
    return $decoded;
}

function totpRateStart(
    string $script,
    string $caseDir,
    string $username,
    string $ip,
    string $action = 'attempt',
    int $timeSlice = 1000,
    string $secret = 'JBSWY3DPEHPK3PXP'
): array
{
    $command = escapeshellarg(PHP_BINARY)
        . ' ' . escapeshellarg($script)
        . ' --case ' . escapeshellarg($caseDir)
        . ' ' . escapeshellarg($action)
        . ' ' . escapeshellarg($username)
        . ' ' . escapeshellarg($ip)
        . ' ' . escapeshellarg((string)$timeSlice)
        . ' ' . escapeshellarg($secret);
    $pipes = [];
    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Failed to start concurrent TOTP limiter case.');
    }
    return [$process, $pipes];
}

function totpRateFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

$tmpBase = sys_get_temp_dir() . '/filerise_totp_rate_' . bin2hex(random_bytes(6));
@mkdir($tmpBase . '/uploads', 0775, true);
@mkdir($tmpBase . '/users', 0700, true);
@mkdir($tmpBase . '/metadata', 0775, true);
$errors = [];

try {
    // The alternate auth endpoint must resolve the verifier class and complete its pending-login TOTP step.
    $authHandler = totpRateRun(__FILE__, $tmpBase, 'auth-handler', 'handler-user', '203.0.113.9');
    totpRateFailIf(empty($authHandler['ok']), 'Alternate TOTP handler failed to execute.', $errors);
    totpRateFailIf(empty($authHandler['result']['handled']), 'Alternate TOTP handler did not handle a valid code.', $errors);
    totpRateFailIf(empty($authHandler['result']['finalized']), 'Alternate TOTP handler did not finalize login.', $errors);
    totpRateFailIf(empty($authHandler['result']['pendingCleared']), 'Alternate TOTP handler retained pending credentials.', $errors);
    $authHandlerReplay = totpRateRun(
        __FILE__,
        $tmpBase,
        'auth-handler',
        'handler-user',
        '203.0.113.10',
        1000,
        'JBSWY3DPEHPK3PXP',
        (string)($authHandler['result']['code'] ?? '')
    );
    totpRateFailIf(
        ($authHandlerReplay['error'] ?? '') !== 'Invalid TOTP code',
        'Alternate TOTP handler accepted a consumed code.',
        $errors
    );

    $guidedLinkHandler = totpRateRun(
        __FILE__,
        $tmpBase,
        'auth-handler-oidc-link',
        'guided-link-user',
        '203.0.113.11'
    );
    totpRateFailIf(
        empty($guidedLinkHandler['ok']) || empty($guidedLinkHandler['result']['finalized']),
        'TOTP-protected guided OIDC link did not finalize login.',
        $errors
    );
    totpRateFailIf(
        empty($guidedLinkHandler['result']['oidcLinkCleared'])
            || empty($guidedLinkHandler['result']['oidcBindingCreated']),
        'TOTP-protected guided OIDC link did not persist and clear its binding state.',
        $errors
    );
    totpRateFailIf(
        ($guidedLinkHandler['result']['role'] ?? '') !== '1',
        'TOTP-protected guided OIDC link did not apply IdP role synchronization.',
        $errors
    );

    $expiredGuidedLinkHandler = totpRateRun(
        __FILE__,
        $tmpBase,
        'auth-handler-oidc-link-expired',
        'expired-guided-link-user',
        '203.0.113.12'
    );
    totpRateFailIf(
        ($expiredGuidedLinkHandler['error'] ?? '') !== 'OIDC account-link confirmation is invalid or expired.',
        'Expired guided OIDC link completed through its pending TOTP login.',
        $errors
    );

    // Account budget persists across processes, sessions, and source-IP changes.
    for ($i = 1; $i <= 5; $i++) {
        $result = totpRateRun(__FILE__, $tmpBase, 'attempt', 'AdminUser', '203.0.113.' . $i);
        totpRateFailIf(empty($result['ok']) || empty($result['result']['allowed']), "Account attempt {$i} should be allowed.", $errors);
    }
    $accountLocked = totpRateRun(__FILE__, $tmpBase, 'attempt', 'adminuser', '198.51.100.10');
    totpRateFailIf(!empty($accountLocked['result']['allowed']), 'Changing session, username case, and IP bypassed the account limit.', $errors);
    totpRateFailIf((int)($accountLocked['result']['retryAfter'] ?? 0) <= 0, 'Account lockout did not provide a retry interval.', $errors);

    $cleared = totpRateRun(__FILE__, $tmpBase, 'clear', 'ADMINUSER', '203.0.113.5');
    totpRateFailIf(empty($cleared['ok']), 'Successful-verification clear failed.', $errors);
    $afterClear = totpRateRun(__FILE__, $tmpBase, 'attempt', 'adminuser', '198.51.100.10');
    totpRateFailIf(empty($afterClear['result']['allowed']), 'Account remained locked after successful-verification clear.', $errors);

    // A successfully consumed time step is rejected on replay, while a later step or replacement secret is accepted.
    $firstUse = totpRateRun(__FILE__, $tmpBase, 'clear', 'replay-user', '203.0.113.20', 2000, 'REPLAYSECRETAAAA');
    totpRateFailIf(empty($firstUse['result']['accepted']), 'First use of a TOTP time step should be accepted.', $errors);
    $replay = totpRateRun(__FILE__, $tmpBase, 'clear', 'REPLAY-USER', '198.51.100.20', 2000, 'REPLAYSECRETAAAA');
    totpRateFailIf(!empty($replay['result']['accepted']), 'Consumed TOTP time step was accepted again.', $errors);
    $laterStep = totpRateRun(__FILE__, $tmpBase, 'clear', 'replay-user', '203.0.113.20', 2001, 'REPLAYSECRETAAAA');
    totpRateFailIf(empty($laterStep['result']['accepted']), 'A later TOTP time step should be accepted.', $errors);
    $replacementSecret = totpRateRun(
        __FILE__,
        $tmpBase,
        'clear',
        'replay-user',
        '203.0.113.20',
        2001,
        'REPLAYSECRETBBBB'
    );
    totpRateFailIf(empty($replacementSecret['result']['accepted']), 'A replacement TOTP secret did not start fresh.', $errors);

    // Successful users behind a shared source do not consume its failure budget.
    for ($i = 1; $i <= 60; $i++) {
        $username = 'successful-user-' . $i;
        $result = totpRateRun(__FILE__, $tmpBase, 'attempt', $username, '192.0.2.40');
        totpRateFailIf(empty($result['result']['allowed']), "Successful shared-source attempt {$i} should be allowed.", $errors);
        $success = totpRateRun(__FILE__, $tmpBase, 'clear', $username, '192.0.2.40');
        totpRateFailIf(empty($success['ok']), "Successful shared-source clear {$i} failed.", $errors);
    }

    // A higher source-wide budget limits account rotation without penalizing normal shared networks at five attempts.
    for ($i = 1; $i <= 50; $i++) {
        $result = totpRateRun(__FILE__, $tmpBase, 'attempt', 'source-user-' . $i, '192.0.2.50');
        totpRateFailIf(empty($result['result']['allowed']), "Source attempt {$i} should be allowed.", $errors);
    }
    $sourceLocked = totpRateRun(__FILE__, $tmpBase, 'attempt', 'source-user-51', '192.0.2.50');
    totpRateFailIf(!empty($sourceLocked['result']['allowed']), 'Rotating accounts bypassed the source-wide limit.', $errors);
    $otherSource = totpRateRun(__FILE__, $tmpBase, 'attempt', 'source-user-51', '192.0.2.51');
    totpRateFailIf(empty($otherSource['result']['allowed']), 'Different source incorrectly inherited source-wide lockout.', $errors);

    // Parallel verification requests cannot reserve more than the account budget.
    $concurrentDir = $tmpBase . '/concurrent';
    @mkdir($concurrentDir . '/uploads', 0775, true);
    @mkdir($concurrentDir . '/users', 0700, true);
    @mkdir($concurrentDir . '/metadata', 0775, true);
    $workers = [];
    for ($i = 0; $i < 16; $i++) {
        $workers[] = totpRateStart(__FILE__, $concurrentDir, 'parallel-user', '198.51.100.' . ($i + 1));
    }
    $allowedCount = 0;
    foreach ($workers as [$process, $pipes]) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        $decoded = json_decode(trim((string)$stdout), true);
        totpRateFailIf($exitCode !== 0, 'Concurrent limiter worker failed: ' . trim((string)$stderr), $errors);
        totpRateFailIf(!is_array($decoded) || empty($decoded['ok']), 'Concurrent limiter worker returned invalid output.', $errors);
        if (!empty($decoded['result']['allowed'])) {
            $allowedCount++;
        }
    }
    totpRateFailIf($allowedCount !== 5, "Concurrent account budget allowed {$allowedCount} attempts instead of 5.", $errors);

    // Parallel submissions of one valid time step can produce only one successful claim.
    $replayDir = $tmpBase . '/replay-concurrent';
    @mkdir($replayDir . '/uploads', 0775, true);
    @mkdir($replayDir . '/users', 0700, true);
    @mkdir($replayDir . '/metadata', 0775, true);
    $workers = [];
    for ($i = 0; $i < 16; $i++) {
        $workers[] = totpRateStart(
            __FILE__,
            $replayDir,
            'parallel-replay-user',
            '198.51.100.' . ($i + 1),
            'clear',
            3000,
            'PARALLELREPLAYSECRET'
        );
    }
    $acceptedCount = 0;
    foreach ($workers as [$process, $pipes]) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        $decoded = json_decode(trim((string)$stdout), true);
        totpRateFailIf($exitCode !== 0, 'Concurrent replay worker failed: ' . trim((string)$stderr), $errors);
        totpRateFailIf(!is_array($decoded) || empty($decoded['ok']), 'Concurrent replay worker returned invalid output.', $errors);
        if (!empty($decoded['result']['accepted'])) {
            $acceptedCount++;
        }
    }
    totpRateFailIf($acceptedCount !== 1, "Concurrent replay claims accepted {$acceptedCount} uses instead of 1.", $errors);

    // Expired state is pruned and does not permanently lock existing users.
    $storePath = $tmpBase . '/users/totp_attempts.json';
    $store = json_decode((string)file_get_contents($storePath), true);
    foreach ($store as &$entry) {
        if (is_array($entry) && isset($entry['lastAttempt'])) {
            $entry['lastAttempt'] = time() - 901;
        }
    }
    unset($entry);
    file_put_contents($storePath, json_encode($store, JSON_PRETTY_PRINT), LOCK_EX);
    $afterExpiry = totpRateRun(__FILE__, $tmpBase, 'attempt', 'source-user-51', '192.0.2.50');
    totpRateFailIf(empty($afterExpiry['result']['allowed']), 'Expired TOTP limiter state did not reset.', $errors);

    // Stored limiter keys must not disclose usernames or source addresses.
    $storedRaw = (string)file_get_contents($storePath);
    totpRateFailIf(str_contains($storedRaw, 'source-user-51'), 'Limiter store disclosed a username.', $errors);
    totpRateFailIf(str_contains($storedRaw, '192.0.2.50'), 'Limiter store disclosed a source address.', $errors);
    totpRateFailIf(str_contains($storedRaw, 'REPLAYSECRET'), 'Limiter store disclosed a TOTP secret.', $errors);

    // Corrupt persistent state fails closed rather than silently resetting the budget.
    file_put_contents($storePath, '{invalid-json', LOCK_EX);
    $corrupt = totpRateRun(__FILE__, $tmpBase, 'attempt', 'corrupt-user', '203.0.113.200');
    totpRateFailIf(!empty($corrupt['ok']), 'Corrupt limiter state failed open.', $errors);
} finally {
    totpRateRmTree($tmpBase);
}

if ($errors !== []) {
    fwrite(STDERR, "FAIL TOTP rate-limit regressions:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

fwrite(STDOUT, "PASS TOTP rate-limit regressions\n");
