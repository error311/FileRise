<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_shared_symlink_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function sharedSymlinkFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function sharedSymlinkRmTree(string $dir): void
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
        sharedSymlinkRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir . 'foo', 0775, true);
@mkdir($uploadDir . 'foo2', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

file_put_contents($uploadDir . 'foo/public.txt', 'PUBLIC', LOCK_EX);
file_put_contents($uploadDir . 'foo2/secret.txt', 'SECRET', LOCK_EX);

if (!@symlink('../foo2', $uploadDir . 'foo/link')) {
    sharedSymlinkRmTree($tmpBase);
    fwrite(STDOUT, "SKIP shared folder symlink regressions: symlink unavailable\n");
    exit(0);
}

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
$_SERVER['HTTP_HOST'] = 'localhost';

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/FolderModel.php';

$errors = [];

try {
    $share = \FileRise\Domain\FolderModel::createShareFolderLink('foo', 3600, '', 0, 1, ['mode' => 'browse']);
    sharedSymlinkFailIf(isset($share['error']), 'createShareFolderLink: ' . ($share['error'] ?? ''), $errors);
    $token = (string)($share['token'] ?? '');
    sharedSymlinkFailIf($token === '', 'createShareFolderLink: missing token', $errors);

    if ($token !== '') {
        $public = \FileRise\Domain\FolderModel::getSharedFileInfo($token, 'public.txt');
        sharedSymlinkFailIf(isset($public['error']), 'getSharedFileInfo: public file should be accessible', $errors);
        if (!isset($public['error'])) {
            sharedSymlinkFailIf(
                trim((string)file_get_contents((string)$public['filePath'])) !== 'PUBLIC',
                'getSharedFileInfo: public file content mismatch',
                $errors
            );
        }

        $escapedFile = \FileRise\Domain\FolderModel::getSharedFileInfo($token, 'link/secret.txt');
        sharedSymlinkFailIf(!isset($escapedFile['error']), 'getSharedFileInfo: symlink escape file should be rejected', $errors);

        $escapedFolder = \FileRise\Domain\FolderModel::getSharedFolderData($token, null, 1, 10, 'link');
        sharedSymlinkFailIf(!isset($escapedFolder['error']), 'getSharedFolderData: symlink escape folder should be rejected', $errors);

        $rootListing = \FileRise\Domain\FolderModel::getSharedFolderData($token, null, 1, 10);
        sharedSymlinkFailIf(isset($rootListing['error']), 'getSharedFolderData: share root should list', $errors);
        $entryNames = array_map(
            static fn(array $entry): string => (string)($entry['name'] ?? ''),
            is_array($rootListing['entries'] ?? null) ? $rootListing['entries'] : []
        );
        sharedSymlinkFailIf(in_array('link', $entryNames, true), 'getSharedFolderData: escaping symlink should not be listed', $errors);
    }

    $uploadShare = \FileRise\Domain\FolderModel::createShareFolderLink('foo', 3600, '', 1, 1, ['mode' => 'browse']);
    sharedSymlinkFailIf(isset($uploadShare['error']), 'createShareFolderLink upload: ' . ($uploadShare['error'] ?? ''), $errors);
    $uploadToken = (string)($uploadShare['token'] ?? '');
    if ($uploadToken !== '') {
        $uploadContext = \FileRise\Domain\FolderModel::getSharedUploadContext($uploadToken, null, 'link');
        sharedSymlinkFailIf(!isset($uploadContext['error']), 'getSharedUploadContext: symlink upload target should be rejected', $errors);
    }

    $rootShare = \FileRise\Domain\FolderModel::createShareFolderLink('root', 3600, '', 0, 1, ['mode' => 'browse']);
    sharedSymlinkFailIf(isset($rootShare['error']), 'createShareFolderLink root: ' . ($rootShare['error'] ?? ''), $errors);
    $rootToken = (string)($rootShare['token'] ?? '');
    if ($rootToken !== '') {
        $rootFile = \FileRise\Domain\FolderModel::getSharedFileInfo($rootToken, 'foo2/secret.txt');
        sharedSymlinkFailIf(isset($rootFile['error']), 'getSharedFileInfo: root share should preserve upload-root access', $errors);
    }
} finally {
    sharedSymlinkRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Shared folder symlink regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Shared folder symlink regressions passed\n";
