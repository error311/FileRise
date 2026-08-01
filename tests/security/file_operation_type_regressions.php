<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_file_operation_type_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function fileTypeFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function fileTypeRmTree(string $path): void
{
    if (is_link($path) || is_file($path)) {
        @unlink($path);
        return;
    }
    if (!is_dir($path)) {
        return;
    }
    $entries = scandir($path);
    if ($entries === false) {
        return;
    }
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        fileTypeRmTree($path . DIRECTORY_SEPARATOR . $entry);
    }
    @rmdir($path);
}

foreach (
    [
        $uploadDir . 'shared/move-directory',
        $uploadDir . 'shared/delete-directory',
        $uploadDir . 'destination',
        $usersDir,
        $metaDir,
        $sessionDir,
    ] as $directory
) {
    @mkdir($directory, 0775, true);
}

file_put_contents(
    $uploadDir . 'shared/move-directory/inside.txt',
    'MOVE-DIRECTORY-SENTINEL'
);
file_put_contents(
    $uploadDir . 'shared/delete-directory/inside.txt',
    'DELETE-DIRECTORY-SENTINEL'
);
file_put_contents($uploadDir . 'shared/normal-move.txt', 'NORMAL-MOVE');
file_put_contents($uploadDir . 'shared/normal-delete.txt', 'NORMAL-DELETE');

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
session_save_path($sessionDir);
$_SESSION['username'] = 'type-regression-user';

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/FileModel.php';

$errors = [];

try {
    $moveDirectory = \FileRise\Domain\FileModel::moveFiles(
        'shared',
        'destination',
        ['move-directory']
    );
    fileTypeFailIf(
        !isset($moveDirectory['error']),
        'moveFiles: a directory submitted as a file was not refused',
        $errors
    );
    fileTypeFailIf(
        !is_file($uploadDir . 'shared/move-directory/inside.txt'),
        'moveFiles: the refused source directory was moved or removed',
        $errors
    );
    fileTypeFailIf(
        is_dir($uploadDir . 'destination/move-directory'),
        'moveFiles: the refused directory appeared in the destination',
        $errors
    );
    fileTypeFailIf(
        file_get_contents($uploadDir . 'shared/move-directory/inside.txt')
            !== 'MOVE-DIRECTORY-SENTINEL',
        'moveFiles: content inside the refused directory changed',
        $errors
    );

    $deleteDirectory = \FileRise\Domain\FileModel::deleteFiles(
        'shared',
        ['delete-directory']
    );
    fileTypeFailIf(
        !isset($deleteDirectory['error']),
        'deleteFiles: a directory submitted as a file was not refused',
        $errors
    );
    fileTypeFailIf(
        !is_file($uploadDir . 'shared/delete-directory/inside.txt'),
        'deleteFiles: the refused directory was moved or removed',
        $errors
    );
    fileTypeFailIf(
        file_get_contents($uploadDir . 'shared/delete-directory/inside.txt')
            !== 'DELETE-DIRECTORY-SENTINEL',
        'deleteFiles: content inside the refused directory changed',
        $errors
    );

    $trashEntries = is_dir($uploadDir . 'trash')
        ? array_values(array_diff(scandir($uploadDir . 'trash') ?: [], ['.', '..', 'trash.json']))
        : [];
    fileTypeFailIf(
        $trashEntries !== [],
        'deleteFiles: the refused directory created a Trash entry',
        $errors
    );

    $moveFile = \FileRise\Domain\FileModel::moveFiles(
        'shared',
        'destination',
        ['normal-move.txt']
    );
    fileTypeFailIf(
        !isset($moveFile['success']),
        'moveFiles: an ordinary file move no longer succeeds',
        $errors
    );
    fileTypeFailIf(
        !is_file($uploadDir . 'destination/normal-move.txt')
            || file_get_contents($uploadDir . 'destination/normal-move.txt') !== 'NORMAL-MOVE',
        'moveFiles: ordinary file content was not moved correctly',
        $errors
    );
    fileTypeFailIf(
        file_exists($uploadDir . 'shared/normal-move.txt'),
        'moveFiles: ordinary source file remained after a successful move',
        $errors
    );

    $deleteFile = \FileRise\Domain\FileModel::deleteFiles(
        'shared',
        ['normal-delete.txt']
    );
    fileTypeFailIf(
        !isset($deleteFile['success']),
        'deleteFiles: an ordinary file delete no longer succeeds',
        $errors
    );
    fileTypeFailIf(
        file_exists($uploadDir . 'shared/normal-delete.txt'),
        'deleteFiles: ordinary source file remained after deletion',
        $errors
    );

    $trashDataPath = $uploadDir . 'trash/trash.json';
    $trashData = is_file($trashDataPath)
        ? json_decode((string)file_get_contents($trashDataPath), true)
        : [];
    $normalDeleteRecord = null;
    if (is_array($trashData)) {
        foreach ($trashData as $record) {
            if (($record['originalName'] ?? '') === 'normal-delete.txt') {
                $normalDeleteRecord = $record;
                break;
            }
        }
    }
    fileTypeFailIf(
        !is_array($normalDeleteRecord)
            || ($normalDeleteRecord['type'] ?? '') !== 'file',
        'deleteFiles: ordinary file Trash metadata was not recorded correctly',
        $errors
    );
    $trashName = is_array($normalDeleteRecord)
        ? (string)($normalDeleteRecord['trashName'] ?? '')
        : '';
    fileTypeFailIf(
        $trashName === ''
            || !is_file($uploadDir . 'trash/' . $trashName)
            || file_get_contents($uploadDir . 'trash/' . $trashName) !== 'NORMAL-DELETE',
        'deleteFiles: ordinary file content was not moved to Trash correctly',
        $errors
    );
} catch (Throwable $e) {
    $errors[] = 'test setup failed: ' . $e->getMessage();
} finally {
    fileTypeRmTree($tmpBase);
}

if ($errors) {
    fwrite(
        STDERR,
        "File operation type regression failures:\n- " . implode("\n- ", $errors) . "\n"
    );
    exit(1);
}

echo "File operation type regressions passed\n";
