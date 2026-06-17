<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (!class_exists('ZipArchive')) {
    fwrite(STDOUT, "SKIP ZIP extraction blocklist regressions: ZipArchive unavailable\n");
    exit(0);
}

$tmpBase = $baseDir . '/tests/.tmp_zip_extract_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function zipExtractFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function zipExtractRmTree(string $dir): void
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
        zipExtractRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir . 'docs', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
$_SESSION['username'] = 'alice';

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/FileModel.php';

$errors = [];
$zipPath = $uploadDir . 'docs/payload.zip';

try {
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('failed to create test zip');
    }
    $zip->addFromString('safe.txt', 'SAFE');
    $zip->addFromString('proof.php', '<?php echo "blocked";');
    $zip->addFromString('nested/shell.phtml', '<?php echo "blocked";');
    $zip->close();

    $result = \FileRise\Domain\FileModel::extractZipArchive('docs', ['payload.zip']);
    zipExtractFailIf(empty($result['success']), 'extractZipArchive: mixed safe/blocked archive should extract safe files', $errors);
    zipExtractFailIf(!is_file($uploadDir . 'docs/safe.txt'), 'extractZipArchive: safe file should be extracted', $errors);
    zipExtractFailIf(is_file($uploadDir . 'docs/proof.php'), 'extractZipArchive: blocked top-level PHP file should not be written', $errors);
    zipExtractFailIf(is_file($uploadDir . 'docs/nested/shell.phtml'), 'extractZipArchive: blocked nested PHTML file should not be written', $errors);
    zipExtractFailIf(
        !isset($result['warning']) || !str_contains((string)$result['warning'], 'blocked file type'),
        'extractZipArchive: skipped blocked file types should be reported as a warning',
        $errors
    );

    $metadataPath = $metaDir . 'docs_metadata.json';
    $metadata = is_file($metadataPath) ? json_decode((string)file_get_contents($metadataPath), true) : [];
    zipExtractFailIf(!is_array($metadata) || !isset($metadata['safe.txt']), 'extractZipArchive: safe file metadata should be stamped', $errors);
    zipExtractFailIf(is_array($metadata) && isset($metadata['proof.php']), 'extractZipArchive: blocked file metadata should not be stamped', $errors);
} catch (Throwable $e) {
    $errors[] = 'test setup failed: ' . $e->getMessage();
} finally {
    zipExtractRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "ZIP extraction blocklist regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "ZIP extraction blocklist regressions passed\n";
