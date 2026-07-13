<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (($argv[1] ?? '') === '--case') {
    $caseDir = rtrim((string)($argv[2] ?? ''), "/\\") . '/';
    $mode = (string)($argv[3] ?? '');

    putenv('FR_TEST_UPLOAD_DIR=' . $caseDir . 'uploads');
    putenv('FR_TEST_USERS_DIR=' . $caseDir . 'users');
    putenv('FR_TEST_META_DIR=' . $caseDir . 'metadata');
    putenv('PERSISTENT_TOKENS_KEY');
    putenv('PERSISTENT_TOKENS_KEY_SOURCE');

    if ($mode === 'env') {
        putenv('PERSISTENT_TOKENS_KEY=explicit_test_key_32_bytes_long!!');
    } elseif ($mode === 'docker_legacy_hint') {
        putenv('PERSISTENT_TOKENS_KEY_SOURCE=legacy_default');
    }

    require $baseDir . '/config/config.php';
    echo json_encode([
        'status' => fr_get_persistent_tokens_key_status(),
        'key' => $GLOBALS['encryptionKey'] ?? '',
    ], JSON_THROW_ON_ERROR);
    exit(0);
}

function persistentKeyRemoveTree(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (array_diff(scandir($dir) ?: [], ['.', '..']) as $item) {
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            persistentKeyRemoveTree($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

function persistentKeyRunCase(string $script, string $caseDir, string $mode): array
{
    $command = escapeshellarg(PHP_BINARY)
        . ' ' . escapeshellarg($script)
        . ' --case ' . escapeshellarg($caseDir)
        . ' ' . escapeshellarg($mode);
    exec($command, $output, $status);
    if ($status !== 0) {
        throw new RuntimeException("Case {$mode} failed to run.");
    }
    $decoded = json_decode(implode("\n", $output), true);
    if (!is_array($decoded)) {
        throw new RuntimeException("Case {$mode} returned invalid JSON.");
    }
    return $decoded;
}

function persistentKeyStartCase(string $script, string $caseDir): array
{
    $command = escapeshellarg(PHP_BINARY)
        . ' ' . escapeshellarg($script)
        . ' --case ' . escapeshellarg($caseDir)
        . ' pristine';
    $pipes = [];
    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Failed to start concurrent pristine-install case.');
    }
    return [$process, $pipes];
}

function persistentKeyFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

$tmpBase = sys_get_temp_dir() . '/filerise_key_install_' . bin2hex(random_bytes(6));
$errors = [];

try {
    foreach (['pristine', 'existing_manual', 'docker_legacy_hint', 'env', 'file'] as $mode) {
        $caseDir = $tmpBase . '/' . $mode . '/';
        @mkdir($caseDir . 'uploads', 0775, true);
        @mkdir($caseDir . 'users', 0700, true);
        @mkdir($caseDir . 'metadata', 0775, true);

        if ($mode === 'existing_manual') {
            file_put_contents($caseDir . 'users/users.txt', "admin:test:1\n", LOCK_EX);
        } elseif ($mode === 'file') {
            file_put_contents($caseDir . 'metadata/persistent_tokens.key', 'persisted_test_key', LOCK_EX);
        }

        $result = persistentKeyRunCase(__FILE__, $caseDir, $mode);
        $status = $result['status'] ?? [];
        $keyFile = $caseDir . 'metadata/persistent_tokens.key';

        if ($mode === 'pristine') {
            persistentKeyFailIf(($status['source'] ?? '') !== 'generated_file', 'Pristine manual install did not generate a key.', $errors);
            persistentKeyFailIf(!is_file($keyFile), 'Pristine manual install did not persist its key.', $errors);
            persistentKeyFailIf(strlen((string)($result['key'] ?? '')) !== 64, 'Generated key is not 32 random bytes encoded as hex.', $errors);
            persistentKeyFailIf(trim((string)@file_get_contents($keyFile)) !== ($result['key'] ?? ''), 'Persisted key does not match the active key.', $errors);
        } elseif ($mode === 'existing_manual' || $mode === 'docker_legacy_hint') {
            persistentKeyFailIf(($status['source'] ?? '') !== 'legacy_default', "{$mode} did not retain the legacy compatibility key.", $errors);
            persistentKeyFailIf(is_file($keyFile), "{$mode} unexpectedly created a key file.", $errors);
        } elseif ($mode === 'env') {
            persistentKeyFailIf(($status['source'] ?? '') !== 'env', 'Explicit environment key did not retain precedence.', $errors);
            persistentKeyFailIf(($result['key'] ?? '') !== 'explicit_test_key_32_bytes_long!!', 'Explicit environment key changed.', $errors);
            persistentKeyFailIf(is_file($keyFile), 'Environment-key install unexpectedly created a key file.', $errors);
        } elseif ($mode === 'file') {
            persistentKeyFailIf(($status['source'] ?? '') !== 'file', 'Existing key file did not retain precedence.', $errors);
            persistentKeyFailIf(($result['key'] ?? '') !== 'persisted_test_key', 'Existing persisted key changed.', $errors);
        }
    }

    $raceDir = $tmpBase . '/concurrent/';
    @mkdir($raceDir . 'uploads', 0775, true);
    @mkdir($raceDir . 'users', 0700, true);
    @mkdir($raceDir . 'metadata', 0775, true);
    $workers = [];
    for ($i = 0; $i < 16; $i++) {
        $workers[] = persistentKeyStartCase(__FILE__, $raceDir);
    }

    $workerKeys = [];
    foreach ($workers as [$process, $pipes]) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        $decoded = json_decode(trim((string)$stdout), true);
        persistentKeyFailIf($exitCode !== 0, 'Concurrent worker failed: ' . trim((string)$stderr), $errors);
        persistentKeyFailIf(!is_array($decoded), 'Concurrent worker returned invalid JSON.', $errors);
        if (is_array($decoded)) {
            $workerKeys[] = (string)($decoded['key'] ?? '');
        }
    }
    $workerKeys = array_values(array_unique($workerKeys));
    persistentKeyFailIf(count($workerKeys) !== 1, 'Concurrent first requests did not resolve the same key.', $errors);
    persistentKeyFailIf(
        trim((string)@file_get_contents($raceDir . 'metadata/persistent_tokens.key')) !== ($workerKeys[0] ?? ''),
        'Concurrent first-request key does not match the persisted key.',
        $errors
    );
} finally {
    persistentKeyRemoveTree($tmpBase);
}

if ($errors !== []) {
    fwrite(STDERR, "FAIL persistent tokens key install regressions:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

fwrite(STDOUT, "PASS persistent tokens key install regressions\n");
