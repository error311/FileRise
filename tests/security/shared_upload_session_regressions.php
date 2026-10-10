<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_shared_upload_session_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';
$chunkDir = $tmpBase . '/chunks/';

function sharedUploadSessionFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function sharedUploadSessionRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        sharedUploadSessionRmTree($path . DIRECTORY_SEPARATOR . $item);
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
    $controller = new ReflectionClass(\FileRise\Http\Controllers\FolderController::class);
    $issueToken = $controller->getMethod('issueSharedUploadToken');
    $tokenScope = $controller->getMethod('sharedUploadTokenScope');

    $firstToken = $issueToken->invoke(null, 'share-token', 'share-password');
    $secondToken = $issueToken->invoke(null, 'share-token', 'share-password');
    sharedUploadSessionFailIf(
        !is_string($firstToken) || $firstToken === '' || $firstToken === $secondToken,
        'Shared upload page tokens were not independently randomized.',
        $errors
    );
    sharedUploadSessionFailIf(
        !is_string($tokenScope->invoke(null, 'share-token', 'share-password', $firstToken)),
        'A valid randomized shared upload token was rejected.',
        $errors
    );
    sharedUploadSessionFailIf(
        $tokenScope->invoke(null, 'different-share', 'share-password', $firstToken) !== null,
        'A shared upload token was accepted for a different share.',
        $errors
    );
    sharedUploadSessionFailIf(
        $tokenScope->invoke(null, 'share-token', 'different-password', $firstToken) !== null,
        'A shared upload token was accepted for a different share password.',
        $errors
    );

    $uploadModel = new ReflectionClass(\FileRise\Domain\UploadModel::class);
    $bindMetadata = $uploadModel->getMethod('bindResumableMetadata');
    $chunkContentError = $uploadModel->getMethod('resumableChunkContentError');
    $metadata = [
        'filename' => 'document.txt',
        'relativeSubDir' => '',
        'totalChunks' => 2,
        'totalSize' => 12,
    ];

    sharedUploadSessionFailIf(
        $bindMetadata->invoke(null, $chunkDir, $metadata, 2)
            !== 'Upload session must start with the first chunk.',
        'A new shared upload session accepted a later chunk before its first chunk.',
        $errors
    );
    sharedUploadSessionFailIf(
        $bindMetadata->invoke(null, $chunkDir, $metadata, 1) !== null,
        'The first chunk did not initialize resumable metadata.',
        $errors
    );
    sharedUploadSessionFailIf(
        $bindMetadata->invoke(null, $chunkDir, $metadata, 2) !== null,
        'Matching resumable metadata was rejected.',
        $errors
    );
    $renamed = $metadata;
    $renamed['filename'] = 'renamed.txt';
    sharedUploadSessionFailIf(
        $bindMetadata->invoke(null, $chunkDir, $renamed, 2)
            !== 'Upload session does not match the initial chunk.',
        'A resumable session accepted a filename change.',
        $errors
    );
    $resized = $metadata;
    $resized['totalSize'] = 13;
    sharedUploadSessionFailIf(
        $bindMetadata->invoke(null, $chunkDir, $resized, 2)
            !== 'Upload session does not match the initial chunk.',
        'A resumable session accepted a total-size change.',
        $errors
    );

    file_put_contents($chunkDir . 'existing', 'same-content');
    file_put_contents($chunkDir . 'matching', 'same-content');
    file_put_contents($chunkDir . 'different', 'different-content');
    sharedUploadSessionFailIf(
        $chunkContentError->invoke(null, $chunkDir . 'existing', $chunkDir . 'matching') !== null,
        'An identical chunk retry was rejected.',
        $errors
    );
    sharedUploadSessionFailIf(
        $chunkContentError->invoke(null, $chunkDir . 'existing', $chunkDir . 'different')
            !== 'Upload chunk does not match the existing session data.',
        'A conflicting replacement chunk was accepted.',
        $errors
    );
} finally {
    sharedUploadSessionRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Shared upload session regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Shared upload session regressions passed\n";
