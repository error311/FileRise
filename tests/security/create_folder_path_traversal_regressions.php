<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_create_folder_traversal_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function createFolderTraversalFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function createFolderTraversalRmTree(string $dir): void
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
        createFolderTraversalRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir . 'bob', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/FolderModel.php';

$errors = [];
$escapedPath = $tmpBase . '/escape';

try {
    $escapeResult = \FileRise\Domain\FolderModel::createFolder('../../escape', 'bob', 'bob');
    createFolderTraversalFailIf(
        !empty($escapeResult['success']),
        'createFolder: traversal folderName should be rejected',
        $errors
    );
    createFolderTraversalFailIf(
        is_dir($escapedPath),
        'createFolder: traversal folderName created directory outside upload root',
        $errors
    );

    $dotDotResult = \FileRise\Domain\FolderModel::createFolder('..', 'bob', 'bob');
    createFolderTraversalFailIf(
        !empty($dotDotResult['success']),
        'createFolder: dot-dot leaf name should be rejected',
        $errors
    );

    $badParentResult = \FileRise\Domain\FolderModel::createFolder('child', 'bob/..', 'bob');
    createFolderTraversalFailIf(
        !empty($badParentResult['success']),
        'createFolder: traversal parent should be rejected',
        $errors
    );

    $safeResult = \FileRise\Domain\FolderModel::createFolder('safe', 'bob', 'bob');
    createFolderTraversalFailIf(
        empty($safeResult['success']),
        'createFolder: valid child folder should succeed',
        $errors
    );
    createFolderTraversalFailIf(
        !is_dir($uploadDir . 'bob/safe'),
        'createFolder: valid child folder was not created',
        $errors
    );

    $nestedResult = \FileRise\Domain\FolderModel::createFolder('bob/nested', 'root', 'bob');
    createFolderTraversalFailIf(
        empty($nestedResult['success']),
        'createFolder: root-relative nested folder behavior should be preserved',
        $errors
    );
    createFolderTraversalFailIf(
        !is_dir($uploadDir . 'bob/nested'),
        'createFolder: root-relative nested folder was not created',
        $errors
    );
} finally {
    createFolderTraversalRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Create-folder path traversal regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Create-folder path traversal regressions passed\n";
