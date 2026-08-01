<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_trash_restore_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function trashRestoreFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function trashRestoreRmTree(string $path): void
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
        trashRestoreRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

@mkdir($uploadDir . 'trash', 0775, true);
@mkdir($uploadDir . 'docs', 0775, true);
@mkdir($usersDir . 'pro', 0775, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

$outsideSentinel = $usersDir . 'pro/outside.txt';
file_put_contents($outsideSentinel, 'OUTSIDE-UNCHANGED', LOCK_EX);

$records = [
    [
        'type' => 'file',
        'originalFolder' => $uploadDir . 'docs/',
        'originalName' => 'restored.txt',
        'trashName' => 'safe-trash.txt',
        'trashedAt' => time(),
        'uploader' => 'owner',
    ],
    [
        'type' => 'file',
        'originalFolder' => $uploadDir . '../users/pro/',
        'originalName' => 'bootstrap_pro.php',
        'trashName' => 'traversal-trash.txt',
        'trashedAt' => time(),
        'uploader' => 'attacker',
    ],
    [
        'type' => 'file',
        'originalFolder' => $uploadDir . 'docs/',
        'originalName' => 'bootstrap_pro.php',
        'trashName' => 'blocked-name-trash.txt',
        'trashedAt' => time(),
        'uploader' => 'attacker',
    ],
    [
        'type' => 'file',
        'originalFolder' => $uploadDir . 'docs/',
        'originalName' => '../escaped.txt',
        'trashName' => 'name-traversal-trash.txt',
        'trashedAt' => time(),
        'uploader' => 'attacker',
    ],
];

file_put_contents($uploadDir . 'trash/safe-trash.txt', 'SAFE', LOCK_EX);
file_put_contents($uploadDir . 'trash/traversal-trash.txt', 'BENIGN-PROBE', LOCK_EX);
file_put_contents($uploadDir . 'trash/blocked-name-trash.txt', 'BENIGN-PROBE', LOCK_EX);
file_put_contents($uploadDir . 'trash/name-traversal-trash.txt', 'BENIGN-PROBE', LOCK_EX);
file_put_contents(
    $uploadDir . 'trash/trash.json',
    json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/FileModel.php';

$errors = [];

try {
    $safe = \FileRise\Domain\FileModel::restoreFiles(['safe-trash.txt']);
    trashRestoreFailIf(
        !isset($safe['success']) || $safe['success'] === false,
        'An ordinary in-root Trash record should still restore successfully.',
        $errors
    );
    trashRestoreFailIf(
        (string)@file_get_contents($uploadDir . 'docs/restored.txt') !== 'SAFE',
        'The ordinary restored file should retain its contents.',
        $errors
    );
    trashRestoreFailIf(
        file_exists($uploadDir . 'trash/safe-trash.txt'),
        'A successfully restored file should leave Trash.',
        $errors
    );

    $traversal = \FileRise\Domain\FileModel::restoreFiles(['traversal-trash.txt']);
    trashRestoreFailIf(
        ($traversal['success'] ?? null) !== false
            || !str_contains((string)($traversal['error'] ?? ''), 'unsafe restore metadata'),
        'A dot-segment destination outside the upload root should be refused.',
        $errors
    );
    trashRestoreFailIf(
        is_file($usersDir . 'pro/bootstrap_pro.php'),
        'A refused restore must not create the Pro bootstrap file.',
        $errors
    );
    trashRestoreFailIf(
        !is_file($uploadDir . 'trash/traversal-trash.txt'),
        'A refused traversal payload should remain in Trash.',
        $errors
    );

    $blockedName = \FileRise\Domain\FileModel::restoreFiles(['blocked-name-trash.txt']);
    trashRestoreFailIf(
        ($blockedName['success'] ?? null) !== false
            || !str_contains((string)($blockedName['error'] ?? ''), 'unsafe restore metadata'),
        'A file name blocked by the active upload policy should not be restored.',
        $errors
    );
    trashRestoreFailIf(
        is_file($uploadDir . 'docs/bootstrap_pro.php'),
        'A blocked executable name must not be created inside the upload root.',
        $errors
    );

    $nameTraversal = \FileRise\Domain\FileModel::restoreFiles(['name-traversal-trash.txt']);
    trashRestoreFailIf(
        ($nameTraversal['success'] ?? null) !== false
            || !str_contains((string)($nameTraversal['error'] ?? ''), 'unsafe restore metadata'),
        'A traversing original file name should be refused.',
        $errors
    );
    trashRestoreFailIf(
        is_file($uploadDir . 'escaped.txt') || is_file($tmpBase . '/escaped.txt'),
        'A traversing original file name must not create a file.',
        $errors
    );
    trashRestoreFailIf(
        (string)file_get_contents($outsideSentinel) !== 'OUTSIDE-UNCHANGED',
        'Rejected Trash records must not modify unrelated files outside the upload root.',
        $errors
    );
} finally {
    trashRestoreRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Trash restore path regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Trash restore path regressions passed\n";
