<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = sys_get_temp_dir() . '/filerise_remember_password_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function rememberPasswordFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function rememberPasswordRemoveTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_link($path) || is_file($path)) {
        @unlink($path);
        return;
    }
    $items = scandir($path);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        rememberPasswordRemoveTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

@mkdir($uploadDir, 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$aliceOldPassword = 'Alice-Old-Password-123!';
$aliceNewPassword = 'Alice-New-Password-456!';
$aliceAdminPassword = 'Alice-Admin-Reset-789!';
$bobPassword = 'Bob-Password-123!';

file_put_contents(
    $usersDir . 'users.txt',
    'Alice:' . password_hash($aliceOldPassword, PASSWORD_BCRYPT) . ':1' . PHP_EOL
        . 'Bob:' . password_hash($bobPassword, PASSWORD_BCRYPT) . ':0' . PHP_EOL,
    LOCK_EX
);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/UserModel.php';

$errors = [];

try {
    $aliceTokenOne = \FileRise\Domain\AuthModel::issueRememberToken('Alice', true);
    $aliceTokenTwo = \FileRise\Domain\AuthModel::issueRememberToken('Alice', true);
    $bobToken = \FileRise\Domain\AuthModel::issueRememberToken('Bob', false);

    $failedChange = \FileRise\Domain\UserModel::changePassword(
        'alice',
        'incorrect-old-password',
        $aliceNewPassword
    );
    rememberPasswordFailIf(
        empty($failedChange['error']),
        'A rejected password change should return an error.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::validateRememberToken($aliceTokenOne['token']) === null,
        'A rejected password change should not revoke remember-me tokens.',
        $errors
    );

    $changed = \FileRise\Domain\UserModel::changePassword('alice', $aliceOldPassword, $aliceNewPassword);
    rememberPasswordFailIf(empty($changed['success']), 'Self-service password change failed.', $errors);
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::validateRememberToken($aliceTokenOne['token']) !== null,
        'Self-service password change did not revoke the first account token.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::validateRememberToken($aliceTokenTwo['token']) !== null,
        'Self-service password change did not revoke every account token.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::validateRememberToken($bobToken['token']) === null,
        'Password change revoked another account\'s token.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::authenticate('Alice', $aliceOldPassword) !== false,
        'Old password remained valid after self-service change.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::authenticate('Alice', $aliceNewPassword) === false,
        'New password was not usable after self-service change.',
        $errors
    );

    $aliceAdminToken = \FileRise\Domain\AuthModel::issueRememberToken('Alice', true);
    $reset = \FileRise\Domain\UserModel::adminResetPassword('ALICE', $aliceAdminPassword);
    rememberPasswordFailIf(empty($reset['success']), 'Administrator password reset failed.', $errors);
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::validateRememberToken($aliceAdminToken['token']) !== null,
        'Administrator password reset did not revoke the account token.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::validateRememberToken($bobToken['token']) === null,
        'Administrator password reset revoked another account\'s token.',
        $errors
    );
    rememberPasswordFailIf(
        \FileRise\Domain\AuthModel::authenticate('Alice', $aliceAdminPassword) === false,
        'Administrator-reset password was not usable.',
        $errors
    );
} catch (Throwable $e) {
    $errors[] = 'Unexpected exception: ' . $e->getMessage();
} finally {
    rememberPasswordRemoveTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Remember-token password-change regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Remember-token password-change regressions passed\n";
