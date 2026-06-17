<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_shared_upload_name_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function sharedUploadNameFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function sharedUploadNameRmTree(string $dir): void
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
        sharedUploadNameRmTree($dir . DIRECTORY_SEPARATOR . $item);
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
require_once $baseDir . '/src/FileRise/Support/UploadNamePolicy.php';

$errors = [];
$usersFile = $usersDir . 'users.txt';
file_put_contents($usersFile, 'admin:original:1' . PHP_EOL, LOCK_EX);

try {
    sharedUploadNameFailIf(
        \FileRise\Support\UploadNamePolicy::isAllowedForWrite('..%2fusers%2fusers.txt') !== false,
        'UploadNamePolicy: encoded forward-slash traversal should be rejected',
        $errors
    );
    sharedUploadNameFailIf(
        \FileRise\Support\UploadNamePolicy::isAllowedForWrite('..%5cusers%5cusers.txt') !== false,
        'UploadNamePolicy: encoded backslash traversal should be rejected',
        $errors
    );
    sharedUploadNameFailIf(
        \FileRise\Support\UploadNamePolicy::isAllowedForWrite('normal.txt') !== true,
        'UploadNamePolicy: normal filename should remain allowed',
        $errors
    );

    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SESSION['username'] = 'share:regression';
    $result = \FileRise\Domain\UploadModel::handleUpload(
        ['folder' => 'drop', 'source' => 'shared'],
        [
            'file' => [
                'name' => '..%2f..%2fusers%2fusers.txt',
                'tmp_name' => $tmpBase . '/fake-upload.tmp',
                'error' => UPLOAD_ERR_OK,
            ],
        ]
    );

    sharedUploadNameFailIf(
        !isset($result['error']) || !str_contains((string)$result['error'], 'Invalid file name'),
        'handleUpload: encoded traversal filename should be rejected before write',
        $errors
    );
    sharedUploadNameFailIf(
        trim((string)file_get_contents($usersFile)) !== 'admin:original:1',
        'handleUpload: users.txt should not be modified by rejected upload name',
        $errors
    );
} finally {
    sharedUploadNameRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Shared upload filename regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Shared upload filename regressions passed\n";
