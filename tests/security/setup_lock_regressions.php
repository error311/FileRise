<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
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
