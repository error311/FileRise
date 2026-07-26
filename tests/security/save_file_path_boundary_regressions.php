<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = sys_get_temp_dir() . '/filerise_save_file_boundary_' . bin2hex(random_bytes(6));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';
$outsideDir = $tmpBase . '/outside/';

function saveFileBoundaryFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function saveFileBoundaryRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        saveFileBoundaryRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function saveFileBoundaryAclRecord(string $owner): array
{
    return [
        'owners' => [$owner],
        'read' => [],
        'write' => [],
        'share' => [],
        'read_own' => [],
        'create' => [],
        'upload' => [],
        'edit' => [],
        'rename' => [],
        'copy' => [],
        'move' => [],
        'delete' => [],
        'extract' => [],
        'share_file' => [],
        'share_folder' => [],
        'inherit' => [],
        'explicit' => [$owner => true],
    ];
}

@mkdir($uploadDir . 'team', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
@mkdir($outsideDir, 0775, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

$teamAcl = saveFileBoundaryAclRecord('admin');
$teamAcl['edit'] = ['low'];
$teamAcl['inherit'] = ['low' => true];
file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode([
        'folders' => [
            'root' => saveFileBoundaryAclRecord('admin'),
            'team' => $teamAcl,
        ],
        'groups' => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

require_once $baseDir . '/config/config.php';

$errors = [];

try {
    foreach ([
        'team/../outside',
        'team/../../outside',
        'team/%2e%2e/outside',
        'team/%252e%252e/outside',
        'team\\..\\outside',
    ] as $unsafeFolder) {
        saveFileBoundaryFailIf(
            \FileRise\Support\LogicalPathPolicy::isSafeFolder($unsafeFolder),
            'Logical path policy accepted unsafe folder: ' . $unsafeFolder,
            $errors
        );
        saveFileBoundaryFailIf(
            \FileRise\Support\ACL::canEdit('low', [], $unsafeFolder),
            'ACL inherited edit access through unsafe folder: ' . $unsafeFolder,
            $errors
        );
    }

    foreach (['team/releases..2026', 'team/.../drafts', 'team/normal-child'] as $safeFolder) {
        saveFileBoundaryFailIf(
            !\FileRise\Support\LogicalPathPolicy::isSafeFolder($safeFolder),
            'Logical path policy rejected compatible folder: ' . $safeFolder,
            $errors
        );
    }

    saveFileBoundaryFailIf(
        !\FileRise\Support\ACL::canEdit('low', [], 'team/normal-child'),
        'Valid inherited edit access no longer works',
        $errors
    );

    $safeResult = \FileRise\Domain\FileModel::saveFile(
        'team',
        'safe.txt',
        "safe\n",
        'low'
    );
    saveFileBoundaryFailIf(
        empty($safeResult['success']) || !is_file($uploadDir . 'team/safe.txt'),
        'Normal saveFile write failed',
        $errors
    );

    $prefixEscape = \FileRise\Domain\FileModel::saveFile(
        'team/../../uploads_peer',
        'escape.txt',
        "outside\n",
        'low'
    );
    saveFileBoundaryFailIf(
        !isset($prefixEscape['error']),
        'Prefix-collision traversal was accepted by saveFile',
        $errors
    );
    saveFileBoundaryFailIf(
        is_dir($tmpBase . '/uploads_peer') || is_file($tmpBase . '/uploads_peer/escape.txt'),
        'Rejected traversal created an out-of-root directory or file',
        $errors
    );

    $encodedEscape = \FileRise\Domain\FileModel::saveFile(
        'team/%252e%252e/outside',
        'encoded.txt',
        "outside\n",
        'low'
    );
    saveFileBoundaryFailIf(
        !isset($encodedEscape['error']),
        'Repeatedly encoded dot segment was accepted by saveFile',
        $errors
    );

    $symlinkPath = $uploadDir . 'linked-outside';
    if (@symlink($outsideDir, $symlinkPath)) {
        $symlinkEscape = \FileRise\Domain\FileModel::saveFile(
            'linked-outside/new-child',
            'symlink.txt',
            "outside\n",
            'low'
        );
        saveFileBoundaryFailIf(
            !isset($symlinkEscape['error']) || is_file($outsideDir . 'new-child/symlink.txt'),
            'Symlinked ancestor escaped the local upload root',
            $errors
        );
    }

    $adapter = \FileRise\Storage\WebDavAdapter::fromConfig([
        'baseUrl' => 'https://dav.example.test',
        'root' => 'vault/root',
        'username' => 'test-user',
        'password' => 'test-password',
    ], rtrim($uploadDir, '/'));
    saveFileBoundaryFailIf($adapter === null, 'Safe WebDAV configuration was rejected', $errors);
    if ($adapter !== null) {
        $reflection = new ReflectionClass($adapter);
        $relativePath = $reflection->getMethod('relativePath');
        saveFileBoundaryFailIf(
            $relativePath->invoke($adapter, $uploadDir . 'team/../../outside') !== null,
            'WebDAV adapter accepted raw dot-segment traversal',
            $errors
        );
        saveFileBoundaryFailIf(
            $relativePath->invoke($adapter, $uploadDir . 'team/%2e%2e/outside') !== null,
            'WebDAV adapter accepted encoded dot-segment traversal',
            $errors
        );
        saveFileBoundaryFailIf(
            $relativePath->invoke($adapter, $tmpBase . '/uploads_peer/file.txt') !== null,
            'WebDAV adapter confused a sibling path with its configured local root',
            $errors
        );
        saveFileBoundaryFailIf(
            $relativePath->invoke($adapter, $uploadDir . 'team/safe.txt') !== 'team/safe.txt',
            'WebDAV adapter rejected a safe in-root path',
            $errors
        );
    }
} finally {
    saveFileBoundaryRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Save-file path boundary regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Save-file path boundary regressions passed\n";
