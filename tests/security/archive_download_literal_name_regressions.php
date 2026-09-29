<?php

declare(strict_types=1);

function archiveLiteralFail(string $message): void
{
    fwrite(STDERR, "FAIL: {$message}\n");
    exit(1);
}

function archiveLiteralRemove(string $path): void
{
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    if (!is_dir($path)) {
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $name) {
        archiveLiteralRemove($path . DIRECTORY_SEPARATOR . $name);
    }
    @rmdir($path);
}

$sevenZip = trim((string)shell_exec('command -v 7zz 2>/dev/null || command -v 7z 2>/dev/null'));
if ($sevenZip === '') {
    fwrite(STDOUT, "SKIP archive literal-name regressions: 7-Zip unavailable\n");
    exit(0);
}

$tmp = sys_get_temp_dir() . '/fr-archive-literal-' . bin2hex(random_bytes(6));
$uploads = $tmp . '/uploads';
$users = $tmp . '/users';
$metadata = $tmp . '/metadata';
$token = bin2hex(random_bytes(16));

try {
    $sessions = $tmp . '/sessions';
    foreach ([$uploads . '/shared/private', $users, $metadata . '/ziptmp/.tokens', $sessions] as $dir) {
        if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
            archiveLiteralFail('could not create fixture directory');
        }
    }

    file_put_contents($uploads . '/shared/*', 'AUTHORIZED_MARKER');
    file_put_contents($uploads . '/shared/other.txt', 'OTHER_USER_SECRET');
    file_put_contents($uploads . '/shared/private/hidden.txt', 'DENIED_SUBTREE_SECRET');

    $jobPath = $metadata . '/ziptmp/.tokens/' . $token . '.json';
    file_put_contents($jobPath, json_encode([
        'status' => 'queued',
        'folder' => 'shared',
        'files' => ['*'],
        'format' => '7z',
    ], JSON_PRETTY_PRINT));

    $env = array_merge($_ENV, [
        'PATH' => (string)getenv('PATH'),
        'FR_TEST_UPLOAD_DIR' => $uploads . '/',
        'FR_TEST_USERS_DIR' => $users . '/',
        'FR_TEST_META_DIR' => $metadata . '/',
        'PERSISTENT_TOKENS_KEY' => 'test_persistent_tokens_key_32bytes!',
    ]);
    $worker = dirname(__DIR__, 2) . '/src/cli/zip_worker.php';
    $process = proc_open([PHP_BINARY, '-d', 'session.save_path=' . $sessions, $worker, $token], [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes, dirname(__DIR__, 2), $env);
    if (!is_resource($process)) {
        archiveLiteralFail('could not start archive worker');
    }
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    $job = json_decode((string)file_get_contents($jobPath), true);
    if ($exitCode !== 0 || !is_array($job) || ($job['status'] ?? '') !== 'done') {
        archiveLiteralFail('worker failed: ' . trim($stdout . ' ' . $stderr . ' ' . (string)($job['error'] ?? '')));
    }
    $archive = (string)($job['zipPath'] ?? '');
    if ($archive === '' || !is_file($archive)) {
        archiveLiteralFail('worker did not create an archive');
    }

    $list = [];
    $listCode = 1;
    exec(escapeshellarg($sevenZip) . ' l -slt ' . escapeshellarg($archive), $list, $listCode);
    $listing = implode("\n", $list);
    if ($listCode !== 0 || !preg_match('/^Path = \*$/m', $listing)) {
        archiveLiteralFail('literal wildcard-named file is missing');
    }
    foreach (['other.txt', 'private', 'hidden.txt'] as $unexpected) {
        if (str_contains($listing, $unexpected)) {
            archiveLiteralFail("unselected entry was archived: {$unexpected}");
        }
    }

    fwrite(STDOUT, "Archive literal-name regressions passed\n");
} finally {
    archiveLiteralRemove($tmp);
}
