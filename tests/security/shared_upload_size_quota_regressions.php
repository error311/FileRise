<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_shared_upload_size_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';
$chunkDir = $tmpBase . '/chunks/';

function sharedUploadSizeFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function sharedUploadSizeRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        sharedUploadSizeRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

@mkdir($uploadDir, 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
@mkdir($chunkDir, 0775, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/UploadModel.php';
require_once $baseDir . '/src/FileRise/Http/Controllers/FolderController.php';

$errors = [];

try {
    $uploadModel = new ReflectionClass(\FileRise\Domain\UploadModel::class);
    $stagedSize = $uploadModel->getMethod('resumableStagedSize');
    $sizeError = $uploadModel->getMethod('resumableSizeError');

    file_put_contents($chunkDir . '1', str_repeat('a', 400));
    file_put_contents($chunkDir . '2', str_repeat('b', 300));
    file_put_contents($chunkDir . 'ignored.txt', str_repeat('c', 900));

    sharedUploadSizeFailIf(
        $stagedSize->invoke(null, $chunkDir, 2) !== 400,
        'Resumable size accounting did not measure existing server-side chunks.',
        $errors
    );
    sharedUploadSizeFailIf(
        $sizeError->invoke(null, 1, 0, 1024, false) !== 'Invalid total upload size.',
        'A non-positive declared total was not rejected.',
        $errors
    );
    sharedUploadSizeFailIf(
        $sizeError->invoke(null, 1025, 2048, 1024, false) !== 'File size exceeds allowed limit.',
        'Measured chunks exceeding the configured file limit were not rejected.',
        $errors
    );
    sharedUploadSizeFailIf(
        $sizeError->invoke(null, 1025, 1024, 4096, false) !== 'File size exceeds allowed limit.',
        'Measured chunks exceeding the declared total were not rejected.',
        $errors
    );
    sharedUploadSizeFailIf(
        $sizeError->invoke(null, 1023, 1024, 4096, true) !== 'Uploaded file size does not match declared size.',
        'Completed upload size mismatch was not rejected.',
        $errors
    );
    sharedUploadSizeFailIf(
        $sizeError->invoke(null, 1024, 1024, 4096, true) !== null,
        'An exact completed upload size was rejected.',
        $errors
    );

    $controller = new ReflectionClass(\FileRise\Http\Controllers\FolderController::class);
    $maxBytes = $controller->getMethod('sharedUploadMaxBytes');
    $validateRules = $controller->getMethod('validateSharedUploadRules');
    $checkQuota = $controller->getMethod('checkSharedDailyQuota');
    $incrementQuota = $controller->getMethod('incrementSharedDailyQuota');
    $record = [
        'maxFileSizeMb' => 1,
        'allowedTypes' => ['txt'],
        'dailyFileLimit' => 2,
        'maxTotalMbPerDay' => 1,
    ];

    sharedUploadSizeFailIf(
        $maxBytes->invoke(null, $record) !== 1024 * 1024,
        'Share-specific maximum file size was not converted to bytes.',
        $errors
    );
    sharedUploadSizeFailIf(
        $validateRules->invoke(null, $record, 'allowed.txt', (1024 * 1024) + 1)
            !== 'File size exceeds allowed limit.',
        'Server-side measured size did not enforce the share file limit.',
        $errors
    );

    $tokenHash = 'size-regression-token';
    $firstSize = 600 * 1024;
    sharedUploadSizeFailIf(
        $checkQuota->invoke(null, $record, $tokenHash, $firstSize) !== null,
        'First measured upload should fit the daily quota.',
        $errors
    );
    $incrementQuota->invoke(null, $tokenHash, $firstSize);
    sharedUploadSizeFailIf(
        $checkQuota->invoke(null, $record, $tokenHash, 500 * 1024)
            !== 'Daily upload size limit reached for this share.',
        'Daily quota did not use the measured completed-file size.',
        $errors
    );
} finally {
    sharedUploadSizeRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Shared upload size/quota regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Shared upload size/quota regressions passed\n";
