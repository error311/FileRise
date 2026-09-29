<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (($argv[1] ?? '') === '--race-child') {
    $usersDir = rtrim((string)$argv[2], '/\\') . '/';
    $uploadDir = rtrim((string)$argv[3], '/\\') . '/';
    $metaDir = rtrim((string)$argv[4], '/\\') . '/';
    $sessionDir = rtrim((string)$argv[5], '/\\') . '/';
    $readyFile = (string)$argv[6];
    $startFile = (string)$argv[7];
    $username = (string)$argv[8];

    session_save_path($sessionDir);
    putenv('FR_TEST_USERS_DIR=' . $usersDir);
    putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
    putenv('FR_TEST_META_DIR=' . $metaDir);
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    require_once $baseDir . '/config/config.php';
    require_once $baseDir . '/src/FileRise/Domain/UserModel.php';

    $allowedBeforeRace = \FileRise\Domain\UserModel::isInitialSetupAllowed();
    file_put_contents($readyFile, 'ready', LOCK_EX);
    $deadline = microtime(true) + 10;
    while (!is_file($startFile) && microtime(true) < $deadline) {
        usleep(1000);
    }
    if (!is_file($startFile)) {
        fwrite(STDERR, "race barrier timed out\n");
        exit(2);
    }

    $result = \FileRise\Domain\UserModel::addUser($username, 'race-password', '1', true);
    echo json_encode(['allowed' => $allowedBeforeRace, 'result' => $result]);
    exit(0);
}

$tmpBase = $baseDir . '/tests/.tmp_setup_lock_' . bin2hex(random_bytes(4));
$usersDir = $tmpBase . '/users/';
$uploadDir = $tmpBase . '/uploads/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function setupLockFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function setupLockRmTree(string $dir): void
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
        setupLockRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

$raceBase = $tmpBase . '/race';
$raceUsersDir = $raceBase . '/users/';
$raceUploadDir = $raceBase . '/uploads/';
$raceMetaDir = $raceBase . '/metadata/';
$raceSessionDir = $raceBase . '/sessions/';
foreach ([$raceUsersDir, $raceUploadDir, $raceMetaDir, $raceSessionDir] as $dir) {
    @mkdir($dir, 0700, true);
}

$raceStart = $raceBase . '/start';
$raceProcesses = [];
for ($i = 0; $i < 8; $i++) {
    $ready = $raceBase . '/ready-' . $i;
    $process = proc_open([
        PHP_BINARY,
        __FILE__,
        '--race-child',
        $raceUsersDir,
        $raceUploadDir,
        $raceMetaDir,
        $raceSessionDir,
        $ready,
        $raceStart,
        'racer' . $i,
    ], [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($process)) {
        fwrite(STDERR, "Could not start setup race child\n");
        exit(1);
    }
    $raceProcesses[] = [$process, $pipes];
}

$readyDeadline = microtime(true) + 10;
while (count(glob($raceBase . '/ready-*') ?: []) < count($raceProcesses) && microtime(true) < $readyDeadline) {
    usleep(1000);
}
file_put_contents($raceStart, 'start', LOCK_EX);

$raceResults = [];
foreach ($raceProcesses as [$process, $pipes]) {
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
        fwrite(STDERR, "Setup race child failed: {$stderr}\n");
        exit(1);
    }
    $raceResults[] = json_decode($stdout, true);
}

$raceSuccesses = array_filter(
    $raceResults,
    static fn($result): bool => isset($result['result']['success'])
);
$raceAllowed = array_filter(
    $raceResults,
    static fn($result): bool => ($result['allowed'] ?? false) === true
);
$raceUsers = file($raceUsersDir . 'users.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];

@mkdir($usersDir, 0700, true);
@mkdir($uploadDir, 0775, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/UserModel.php';

$errors = [];
$usersFile = $usersDir . 'users.txt';
$marker = \FileRise\Domain\UserModel::setupCompletePath();

try {
    setupLockFailIf(count($raceAllowed) !== 8, 'all race children should observe pristine setup state', $errors);
    setupLockFailIf(count($raceSuccesses) !== 1, 'exactly one concurrent setup request should succeed', $errors);
    setupLockFailIf(count($raceUsers) !== 1, 'concurrent setup should persist exactly one administrator', $errors);
    setupLockFailIf(
        !is_file($raceUsersDir . '.setup_complete'),
        'concurrent setup winner should write setup-complete marker',
        $errors
    );

    setupLockFailIf(
        \FileRise\Domain\UserModel::isInitialSetupAllowed() !== true,
        'fresh install without users or marker should allow initial setup',
        $errors
    );

    $result = \FileRise\Domain\UserModel::addUser('admin', 'setup-password', '1', true);
    setupLockFailIf(isset($result['error']), 'setup addUser should succeed: ' . ($result['error'] ?? ''), $errors);
    setupLockFailIf(!is_file($marker), 'setup addUser should write setup-complete marker', $errors);
    setupLockFailIf(
        \FileRise\Domain\UserModel::isInitialSetupAllowed() !== false,
        'setup should be closed after initial admin creation',
        $errors
    );

    file_put_contents($usersFile, '', LOCK_EX);
    setupLockFailIf(
        \FileRise\Domain\UserModel::isInitialSetupAllowed() !== false,
        'empty users.txt should not reopen setup when setup-complete marker exists',
        $errors
    );

    @unlink($marker);
    file_put_contents(
        $usersFile,
        'existing:' . password_hash('existing-password', PASSWORD_BCRYPT) . ':1' . PHP_EOL,
        LOCK_EX
    );
    setupLockFailIf(
        \FileRise\Domain\UserModel::isInitialSetupAllowed() !== false,
        'populated existing users.txt should not allow setup even before marker migration',
        $errors
    );
    setupLockFailIf(!is_file($marker), 'populated existing users.txt should create setup-complete marker automatically', $errors);
} finally {
    setupLockRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Setup lock regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Setup lock regressions passed\n";
