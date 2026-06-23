<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_upload_overwrite_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function uploadOverwriteFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function uploadOverwriteRmTree(string $dir): void
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
        uploadOverwriteRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir . 'drop', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/UploadModel.php';

$errors = [];
$target = $uploadDir . 'drop/shared.txt';
$metaFile = $metaDir . 'drop_metadata.json';

try {
    file_put_contents($target, 'ORIGINAL', LOCK_EX);
    file_put_contents(
        $metaFile,
        json_encode(['shared.txt' => ['uploaded' => 'original-date', 'uploader' => 'victim']], JSON_PRETTY_PRINT),
        LOCK_EX
    );

    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SESSION['username'] = 'share:overwrite-regression';
    $_SESSION['authenticated'] = false;
    $_SESSION['isAdmin'] = false;

    $sharedResult = \FileRise\Domain\UploadModel::handleUpload(
        ['folder' => 'drop', 'source' => 'shared'],
        [
            'file' => [
                'name' => 'shared.txt',
                'tmp_name' => $tmpBase . '/fake-shared-upload.tmp',
                'error' => UPLOAD_ERR_OK,
            ],
        ]
    );

    uploadOverwriteFailIf(($sharedResult['code'] ?? null) !== 409, 'shared upload: duplicate filename should return code 409', $errors);
    uploadOverwriteFailIf((string)($sharedResult['error'] ?? '') !== 'File already exists.', 'shared upload: duplicate filename should be rejected', $errors);
    uploadOverwriteFailIf((string)file_get_contents($target) !== 'ORIGINAL', 'shared upload: existing file should not be overwritten', $errors);

    $_SESSION['username'] = 'uploader';
    $_SESSION['authenticated'] = true;
    $_SESSION['isAdmin'] = false;

    $authResult = \FileRise\Domain\UploadModel::handleUpload(
        ['folder' => 'drop'],
        [
            'file' => [
                'name' => 'shared.txt',
                'tmp_name' => $tmpBase . '/fake-auth-upload.tmp',
                'error' => UPLOAD_ERR_OK,
            ],
        ]
    );

    uploadOverwriteFailIf(($authResult['code'] ?? null) !== 403, 'authenticated upload: overwrite without edit/ownership should return code 403', $errors);
    uploadOverwriteFailIf(!isset($authResult['error']), 'authenticated upload: overwrite without edit/ownership should be rejected', $errors);
    uploadOverwriteFailIf((string)file_get_contents($target) !== 'ORIGINAL', 'authenticated upload: existing file should not be overwritten', $errors);
} finally {
    uploadOverwriteRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Upload overwrite regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Upload overwrite regressions passed\n";
