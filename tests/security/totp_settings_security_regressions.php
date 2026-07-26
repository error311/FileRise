<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = sys_get_temp_dir() . '/filerise_totp_settings_' . bin2hex(random_bytes(6));

function totpSettingsFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function totpSettingsRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        totpSettingsRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function totpSettingsRunControllerCase(
    string $baseDir,
    string $tmpBase,
    string $name,
    string $operation,
    bool $recentAuthentication,
    bool $activeTotp,
    bool $pendingSetup = false
): array {
    $caseDir = $tmpBase . '/' . $name;
    @mkdir($caseDir, 0775, true);
    $baseExport = var_export($baseDir, true);
    $caseExport = var_export($caseDir, true);
    $operationCode = match ($operation) {
        'setup' => '$controller->setupTOTP();',
        'disable' => '$controller->disableTOTP();',
        'panel-disable' => '$controller->updateUserPanel();',
        default => 'throw new RuntimeException("Unknown controller operation.");',
    };
    $authTime = $recentAuthentication ? 'time()' : 'time() - 301';
    $activeLiteral = $activeTotp ? 'true' : 'false';
    $pendingLiteral = $pendingSetup ? 'true' : 'false';

    $script = <<<PHP
<?php
declare(strict_types=1);

\$baseDir = {$baseExport};
\$caseDir = {$caseExport};
@mkdir(\$caseDir . '/uploads', 0775, true);
@mkdir(\$caseDir . '/users', 0700, true);
@mkdir(\$caseDir . '/metadata', 0775, true);
@mkdir(\$caseDir . '/sessions', 0700, true);
session_save_path(\$caseDir . '/sessions');

putenv('FR_TEST_UPLOAD_DIR=' . \$caseDir . '/uploads');
putenv('FR_TEST_USERS_DIR=' . \$caseDir . '/users');
putenv('FR_TEST_META_DIR=' . \$caseDir . '/metadata');
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

\$GLOBALS['FR_TEST_HEADERS'] = ['X-CSRF-Token' => 'settings-csrf'];
if (!function_exists('getallheaders')) {
    function getallheaders(): array
    {
        return \$GLOBALS['FR_TEST_HEADERS'] ?? [];
    }
}

\$_SERVER['REQUEST_METHOD'] = 'POST';
\$_SERVER['REMOTE_ADDR'] = '203.0.113.80';
\$_SERVER['HTTP_HOST'] = 'localhost';

require_once \$baseDir . '/config/config.php';

\$activeSecret = 'JBSWY3DPEHPK3PXP';
\$userLine = 'alice:' . password_hash('Password123!', PASSWORD_BCRYPT) . ':0';
if ({$activeLiteral}) {
    \$userLine .= ':' . encryptData(\$activeSecret, \$GLOBALS['encryptionKey']);
}
file_put_contents(\$caseDir . '/users/users.txt', \$userLine . PHP_EOL, LOCK_EX);

\$_SESSION['authenticated'] = true;
\$_SESSION['authenticated_at'] = {$authTime};
\$_SESSION['username'] = 'alice';
\$_SESSION['isAdmin'] = false;
\$_SESSION['csrf_token'] = 'settings-csrf';
if ({$pendingLiteral}) {
    \$_SESSION['pending_totp_setup_secret'] = 'JBSWY3DPEHPK3PXQ';
    \$_SESSION['pending_totp_setup_user'] = 'alice';
    \$_SESSION['pending_totp_setup_created_at'] = time();
}

register_shutdown_function(static function () use (\$caseDir): void {
    \$active = \\FileRise\\Domain\\UserModel::getTOTPSecret('alice');
    echo "\\n__STATE__" . json_encode([
        'active' => is_string(\$active) && \$active !== '',
        'pending' => isset(\$_SESSION['pending_totp_setup_secret']),
        'authenticated' => !empty(\$_SESSION['authenticated']),
        'status' => http_response_code(),
    ]) . "\\n";
});

\$controller = new \\FileRise\\Http\\Controllers\\UserController();
{$operationCode}
PHP;

    $scriptPath = $caseDir . '/case.php';
    file_put_contents($scriptPath, $script, LOCK_EX);
    $output = [];
    $exitCode = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($scriptPath), $output, $exitCode);
    $raw = implode("\n", $output);
    $state = [];
    if (preg_match('/__STATE__(\{[^\r\n]+\})/', $raw, $matches)) {
        $decoded = json_decode($matches[1], true);
        $state = is_array($decoded) ? $decoded : [];
    }

    return ['exit' => $exitCode, 'output' => $raw, 'state' => $state];
}

$errors = [];
$modelDir = $tmpBase . '/model';

try {
    @mkdir($modelDir . '/uploads', 0775, true);
    @mkdir($modelDir . '/users', 0700, true);
    @mkdir($modelDir . '/metadata', 0775, true);
    @mkdir($modelDir . '/sessions', 0700, true);
    session_save_path($modelDir . '/sessions');
    putenv('FR_TEST_UPLOAD_DIR=' . $modelDir . '/uploads');
    putenv('FR_TEST_USERS_DIR=' . $modelDir . '/users');
    putenv('FR_TEST_META_DIR=' . $modelDir . '/metadata');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    require_once $baseDir . '/config/config.php';

    $usersFile = $modelDir . '/users/users.txt';
    file_put_contents(
        $usersFile,
        'alice:' . password_hash('Password123!', PASSWORD_BCRYPT) . ':0' . PHP_EOL,
        LOCK_EX
    );

    $setup = \FileRise\Domain\UserModel::setupTOTP('alice');
    $pendingSecret = (string)($setup['secret'] ?? '');
    totpSettingsFailIf(isset($setup['error']), 'TOTP setup preparation failed.', $errors);
    totpSettingsFailIf($pendingSecret === '', 'TOTP setup did not return a pending secret.', $errors);
    totpSettingsFailIf(
        \FileRise\Domain\UserModel::getTOTPSecret('alice') !== null,
        'TOTP setup activated the secret before confirmation.',
        $errors
    );

    $activation = \FileRise\Domain\UserModel::activateTOTPSecret('alice', $pendingSecret);
    totpSettingsFailIf(isset($activation['error']), 'Confirmed TOTP activation failed.', $errors);
    totpSettingsFailIf(
        \FileRise\Domain\UserModel::getTOTPSecret('alice') !== $pendingSecret,
        'Confirmed TOTP secret was not persisted.',
        $errors
    );
    $secondActivation = \FileRise\Domain\UserModel::activateTOTPSecret('alice', 'JBSWY3DPEHPK3PXQ');
    totpSettingsFailIf(
        (int)($secondActivation['statusCode'] ?? 0) !== 409,
        'TOTP activation overwrote an existing enrollment.',
        $errors
    );

    $staleSetup = totpSettingsRunControllerCase(
        $baseDir,
        $tmpBase,
        'stale-setup',
        'setup',
        false,
        false
    );
    totpSettingsFailIf(
        !str_contains($staleSetup['output'], '"reauth_required":true'),
        'Stale session was not required to reauthenticate before TOTP setup.',
        $errors
    );
    totpSettingsFailIf(
        !empty($staleSetup['state']['active']) || !empty($staleSetup['state']['pending']),
        'Stale TOTP setup changed active or pending state.',
        $errors
    );

    $recentSetup = totpSettingsRunControllerCase(
        $baseDir,
        $tmpBase,
        'recent-setup',
        'setup',
        true,
        false
    );
    totpSettingsFailIf(
        empty($recentSetup['state']['pending']) || !empty($recentSetup['state']['active']),
        'Recent TOTP setup did not remain pending verification.',
        $errors
    );

    $staleDisable = totpSettingsRunControllerCase(
        $baseDir,
        $tmpBase,
        'stale-disable',
        'disable',
        false,
        true
    );
    totpSettingsFailIf(
        !str_contains($staleDisable['output'], '"reauth_required":true')
            || empty($staleDisable['state']['active']),
        'Stale session disabled an active TOTP secret.',
        $errors
    );

    $recentDisable = totpSettingsRunControllerCase(
        $baseDir,
        $tmpBase,
        'recent-disable',
        'disable',
        true,
        true
    );
    totpSettingsFailIf(
        !empty($recentDisable['state']['active'])
            || !str_contains($recentDisable['output'], '"success":true'),
        'Recently authenticated session could not disable TOTP.',
        $errors
    );

    $panelDisable = totpSettingsRunControllerCase(
        $baseDir,
        $tmpBase,
        'stale-panel-disable',
        'panel-disable',
        false,
        true
    );
    totpSettingsFailIf(
        !str_contains($panelDisable['output'], '"reauth_required":true')
            || empty($panelDisable['state']['active']),
        'Profile checkbox bypassed recent authentication for TOTP disablement.',
        $errors
    );

    $cancelPending = totpSettingsRunControllerCase(
        $baseDir,
        $tmpBase,
        'cancel-pending',
        'disable',
        false,
        false,
        true
    );
    totpSettingsFailIf(
        !empty($cancelPending['state']['pending'])
            || !str_contains($cancelPending['output'], 'TOTP setup canceled'),
        'Canceling an unconfirmed setup did not clear only its pending state.',
        $errors
    );
} finally {
    totpSettingsRmTree($tmpBase);
}

if ($errors !== []) {
    fwrite(STDERR, "FAIL TOTP settings security regressions:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

fwrite(STDOUT, "PASS TOTP settings security regressions\n");
