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
$outsideDir = $tmpBase . '/outside/';

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

function zipExtractFindExecutable(array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_executable($candidate)) {
            return $candidate;
        }
    }
    return null;
}

@mkdir($uploadDir . 'docs', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
@mkdir($outsideDir, 0775, true);
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

    file_put_contents($uploadDir . 'docs/overwrite.txt', 'OLD');
    $compatZipPath = $uploadDir . 'docs/compat.zip';
    $zip = new ZipArchive();
    if ($zip->open($compatZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('failed to create compatibility zip');
    }
    $zip->addFromString('normal/nested.txt', 'NESTED');
    $zip->addFromString('overwrite.txt', 'NEW');
    $zip->addEmptyDir('empty-dir');
    $zip->close();

    $compatResult = \FileRise\Domain\FileModel::extractZipArchive('docs', ['compat.zip']);
    zipExtractFailIf(empty($compatResult['success']), 'extractZipArchive: normal compatibility archive should succeed', $errors);
    zipExtractFailIf(
        file_get_contents($uploadDir . 'docs/normal/nested.txt') !== 'NESTED',
        'extractZipArchive: normal nested file should persist',
        $errors
    );
    zipExtractFailIf(
        file_get_contents($uploadDir . 'docs/overwrite.txt') !== 'NEW',
        'extractZipArchive: ordinary file overwrite should remain supported',
        $errors
    );
    zipExtractFailIf(
        !is_dir($uploadDir . 'docs/empty-dir') || is_link($uploadDir . 'docs/empty-dir'),
        'extractZipArchive: safe empty directory should remain supported',
        $errors
    );

    $victimPath = $outsideDir . 'victim.txt';
    file_put_contents($victimPath, 'ORIGINAL-VICTIM');
    $linkPath = $uploadDir . 'docs/existing-link';
    if (@symlink('../../outside', $linkPath)) {
        $symlinkZipPath = $uploadDir . 'docs/preexisting-symlink.zip';
        $zip = new ZipArchive();
        if ($zip->open($symlinkZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('failed to create pre-existing symlink zip');
        }
        $zip->addFromString('existing-link/victim.txt', 'OVERWRITTEN-BY-ARCHIVE');
        $zip->close();

        $symlinkResult = \FileRise\Domain\FileModel::extractZipArchive('docs', ['preexisting-symlink.zip']);
        zipExtractFailIf(
            !empty($symlinkResult['success']),
            'extractZipArchive: pre-existing destination symlink should be rejected',
            $errors
        );
        zipExtractFailIf(
            !is_file($victimPath) || file_get_contents($victimPath) !== 'ORIGINAL-VICTIM',
            'extractZipArchive: external symlink target was modified or deleted',
            $errors
        );
        zipExtractFailIf(
            !is_link($linkPath),
            'extractZipArchive: rejected destination symlink should remain untouched',
            $errors
        );

        $sevenZip = null;
        foreach (['/usr/bin/7zz', '/usr/local/bin/7zz', '/usr/bin/7z', '/usr/local/bin/7z'] as $candidate) {
            if (is_file($candidate) && is_executable($candidate)) {
                $sevenZip = $candidate;
                break;
            }
        }
        if ($sevenZip !== null && function_exists('exec')) {
            $sevenZipSource = $tmpBase . '/sevenzip-source';
            @mkdir($sevenZipSource . '/existing-link', 0775, true);
            file_put_contents($sevenZipSource . '/existing-link/victim.txt', 'OVERWRITTEN-BY-7Z');
            $sevenZipPath = $uploadDir . 'docs/preexisting-symlink.7z';
            $output = [];
            $status = 1;
            $command = 'cd ' . escapeshellarg($sevenZipSource)
                . ' && ' . escapeshellarg($sevenZip)
                . ' a -bd -y ' . escapeshellarg($sevenZipPath)
                . ' ' . escapeshellarg('existing-link/victim.txt');
            @exec($command, $output, $status);
            if ($status !== 0 || !is_file($sevenZipPath)) {
                throw new RuntimeException('failed to create pre-existing symlink 7z archive');
            }

            $sevenZipResult = \FileRise\Domain\FileModel::extractZipArchive('docs', ['preexisting-symlink.7z']);
            zipExtractFailIf(
                !empty($sevenZipResult['success']),
                'extractZipArchive: 7z pre-existing destination symlink should be rejected',
                $errors
            );
            zipExtractFailIf(
                !is_file($victimPath) || file_get_contents($victimPath) !== 'ORIGINAL-VICTIM',
                'extractZipArchive: 7z modified or deleted the external symlink target',
                $errors
            );
        }
    }

    $boundaryWorkspace = $tmpBase . '/boundary-workspace';
    @mkdir($boundaryWorkspace, 0700, true);
    $boundaryFile = $outsideDir . 'boundary-sentinel.txt';
    file_put_contents($boundaryFile, 'UNCHANGED-OUTSIDE-WORKSPACE');
    $redirectRoot = $boundaryWorkspace . '/redirect';
    if (@symlink($outsideDir, $redirectRoot)) {
        $placeArchiveFiles = new ReflectionMethod(
            \FileRise\Domain\FileModel::class,
            'placeArchiveFiles'
        );
        $placement = $placeArchiveFiles->invoke(
            null,
            $redirectRoot,
            $boundaryWorkspace,
            $uploadDir . 'docs',
            ['boundary-sentinel.txt'],
            ['boundary-sentinel.txt']
        );
        zipExtractFailIf(
            !empty($placement['placed']),
            'placeArchiveFiles: an extracted object redefined the original workspace boundary',
            $errors
        );
        zipExtractFailIf(
            empty($placement['failed']),
            'placeArchiveFiles: an out-of-workspace source was not reported as refused',
            $errors
        );
        zipExtractFailIf(
            is_file($uploadDir . 'docs/boundary-sentinel.txt'),
            'placeArchiveFiles: an out-of-workspace file was copied into the destination',
            $errors
        );
        zipExtractFailIf(
            file_get_contents($boundaryFile) !== 'UNCHANGED-OUTSIDE-WORKSPACE',
            'placeArchiveFiles: the unrelated out-of-workspace file was changed',
            $errors
        );
    }

    $unar = zipExtractFindExecutable([
        '/usr/bin/unar',
        '/usr/local/bin/unar',
        '/bin/unar',
    ]);
    $tar = zipExtractFindExecutable([
        '/usr/bin/tar',
        '/usr/local/bin/tar',
        '/bin/tar',
    ]);
    if ($unar !== null && $tar !== null && function_exists('exec')) {
        $fixtureSource = $tmpBase . '/archive-boundary-fixture';
        @mkdir($fixtureSource, 0700, true);
        $safeFixtureName = 'ordinary-archive-file.txt';
        $safeFixturePath = $fixtureSource . DIRECTORY_SEPARATOR . $safeFixtureName;
        $safeArchivePath = $uploadDir . 'docs/ordinary-archive.rar';
        file_put_contents($safeFixturePath, 'ORDINARY-ARCHIVE-CONTENT');
        $output = [];
        $status = 1;
        $safeCommand = escapeshellarg($tar)
            . ' -cf ' . escapeshellarg($safeArchivePath)
            . ' -C ' . escapeshellarg($fixtureSource)
            . ' ' . escapeshellarg($safeFixtureName);
        @exec($safeCommand, $output, $status);
        if ($status !== 0 || !is_file($safeArchivePath)) {
            throw new RuntimeException('failed to create ordinary archive fixture');
        }
        $safeArchiveResult = \FileRise\Domain\FileModel::extractZipArchive(
            'docs',
            ['ordinary-archive.rar']
        );
        zipExtractFailIf(
            empty($safeArchiveResult['success']),
            'extractZipArchive: ordinary unar extraction should remain supported',
            $errors
        );
        zipExtractFailIf(
            !is_file($uploadDir . 'docs/' . $safeFixtureName)
                || file_get_contents($uploadDir . 'docs/' . $safeFixtureName)
                    !== 'ORDINARY-ARCHIVE-CONTENT',
            'extractZipArchive: ordinary unar content was not placed correctly',
            $errors
        );

        $fixtureName = 'archive-boundary-sentinel.txt';
        $fixturePath = $fixtureSource . DIRECTORY_SEPARATOR . $fixtureName;
        $outsideFixturePath = $outsideDir . $fixtureName;
        $archivePath = $uploadDir . 'docs/archive-boundary.rar';
        file_put_contents($outsideFixturePath, 'UNCHANGED-ARCHIVE-SENTINEL');
        file_put_contents($fixturePath, '');

        $output = [];
        $status = 1;
        $createCommand = escapeshellarg($tar)
            . ' -cf ' . escapeshellarg($archivePath)
            . ' -C ' . escapeshellarg($fixtureSource)
            . ' ' . escapeshellarg($fixtureName);
        @exec($createCommand, $output, $status);
        if ($status !== 0 || !is_file($archivePath)) {
            throw new RuntimeException('failed to create archive boundary fixture');
        }

        @unlink($fixturePath);
        if (!@symlink($outsideDir, $fixturePath)) {
            throw new RuntimeException('failed to prepare archive boundary fixture');
        }
        $output = [];
        $status = 1;
        $appendCommand = escapeshellarg($tar)
            . ' -rf ' . escapeshellarg($archivePath)
            . ' -C ' . escapeshellarg($fixtureSource)
            . ' ' . escapeshellarg($fixtureName);
        @exec($appendCommand, $output, $status);
        if ($status !== 0) {
            throw new RuntimeException('failed to finalize archive boundary fixture');
        }

        $archiveBoundaryResult = \FileRise\Domain\FileModel::extractZipArchive(
            'docs',
            ['archive-boundary.rar']
        );
        zipExtractFailIf(
            !empty($archiveBoundaryResult['success']),
            'extractZipArchive: crafted local fixture should not produce an accepted file',
            $errors
        );
        zipExtractFailIf(
            is_file($uploadDir . 'docs/' . $fixtureName),
            'extractZipArchive: crafted local fixture copied a file from outside the workspace',
            $errors
        );
        zipExtractFailIf(
            file_get_contents($outsideFixturePath) !== 'UNCHANGED-ARCHIVE-SENTINEL',
            'extractZipArchive: crafted local fixture changed an unrelated outside file',
            $errors
        );
    }

    $workspaceRoot = $uploadDir . '.filerise-archive-tmp';
    $workspaceEntries = is_dir($workspaceRoot)
        ? array_values(array_diff(scandir($workspaceRoot) ?: [], ['.', '..']))
        : [];
    zipExtractFailIf(
        $workspaceEntries !== [],
        'extractZipArchive: private extraction workspace was not cleaned',
        $errors
    );
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
