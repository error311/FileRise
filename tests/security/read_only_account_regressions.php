<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = sys_get_temp_dir() . '/filerise_read_only_account_' . bin2hex(random_bytes(6));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function readOnlyAccountFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function readOnlyAccountRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        readOnlyAccountRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function readOnlyAccountAclRecord(string $owner): array
{
    return [
        'owners' => [$owner],
        'read' => [$owner],
        'write' => [$owner],
        'share' => [$owner],
        'read_own' => [],
        'create' => [$owner],
        'upload' => [$owner],
        'edit' => [$owner],
        'rename' => [$owner],
        'copy' => [$owner],
        'move' => [$owner],
        'delete' => [$owner],
        'extract' => [$owner],
        'share_file' => [$owner],
        'share_folder' => [$owner],
        'inherit' => [],
        'explicit' => [$owner => true],
    ];
}

@mkdir($uploadDir . 'owned', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode([
        'folders' => [
            'root' => readOnlyAccountAclRecord('admin'),
            'owned' => readOnlyAccountAclRecord('viewer'),
        ],
        'groups' => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);
file_put_contents($uploadDir . 'owned/existing.txt', "original\n", LOCK_EX);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Http/Controllers/FileController.php';
require_once $baseDir . '/src/FileRise/WebDAV/FileRiseDirectory.php';

$errors = [];
$readOnlyPerms = ['readOnly' => true];
$writablePerms = ['readOnly' => false];

unset($_SESSION['isAdmin'], $_SESSION['admin'], $_SESSION['role']);
$_SESSION['username'] = 'viewer';

try {
    readOnlyAccountFailIf(
        \FileRise\Support\ACL::canMutate($readOnlyPerms),
        'Central account policy allowed mutation for a read-only account',
        $errors
    );
    readOnlyAccountFailIf(
        !\FileRise\Support\ACL::canMutate($writablePerms),
        'Central account policy blocked a writable account',
        $errors
    );
    readOnlyAccountFailIf(
        !\FileRise\Support\ACL::canRead('viewer', $readOnlyPerms, 'owned'),
        'Read-only account lost normal read access',
        $errors
    );
    readOnlyAccountFailIf(
        !\FileRise\Support\ACL::isOwner('viewer', $readOnlyPerms, 'owned'),
        'Read-only account lost folder ownership',
        $errors
    );
    readOnlyAccountFailIf(
        !\FileRise\Support\ACL::canShare('viewer', $readOnlyPerms, 'owned'),
        'Read-only account lost the separately controlled share capability',
        $errors
    );

    $writeChecks = [
        'write' => 'canWrite',
        'create file' => 'canCreate',
        'create folder' => 'canCreateFolder',
        'upload' => 'canUpload',
        'edit' => 'canEdit',
        'rename' => 'canRename',
        'copy' => 'canCopy',
        'move' => 'canMove',
        'move folder' => 'canMoveFolder',
        'delete' => 'canDelete',
        'extract' => 'canExtract',
    ];
    foreach ($writeChecks as $label => $method) {
        readOnlyAccountFailIf(
            \FileRise\Support\ACL::$method('viewer', $readOnlyPerms, 'owned'),
            "Read-only owner retained {$label} capability",
            $errors
        );
        readOnlyAccountFailIf(
            !\FileRise\Support\ACL::$method('viewer', $writablePerms, 'owned'),
            "Writable owner lost {$label} capability",
            $errors
        );
    }

    $fileController = new \FileRise\Http\Controllers\FileController();
    $controllerReflection = new ReflectionClass($fileController);
    $requireWritable = $controllerReflection->getMethod('requireWritableAccount');
    http_response_code(200);
    ob_start();
    $allowed = $requireWritable->invoke($fileController, $readOnlyPerms);
    $body = (string)ob_get_clean();
    $decoded = json_decode($body, true);
    readOnlyAccountFailIf(
        $allowed !== false || http_response_code() !== 403,
        'File mutation guard did not reject the read-only account with HTTP 403',
        $errors
    );
    readOnlyAccountFailIf(
        !is_array($decoded) || ($decoded['error'] ?? '') !== 'Account is read-only.',
        'File mutation guard returned an unexpected response',
        $errors
    );

    $directory = new \FileRise\WebDAV\FileRiseDirectory(
        rtrim($uploadDir . 'owned', '/'),
        'viewer',
        false,
        $readOnlyPerms
    );
    try {
        $directory->createFile('blocked.txt', fopen('php://temp', 'rb'));
        $errors[] = 'WebDAV allowed a read-only account to create a file';
    } catch (\Sabre\DAV\Exception\Forbidden $e) {
        readOnlyAccountFailIf(
            $e->getMessage() !== 'Account is read-only',
            'WebDAV file-create rejection returned an unexpected message',
            $errors
        );
    }
    readOnlyAccountFailIf(
        file_exists($uploadDir . 'owned/blocked.txt'),
        'Rejected WebDAV file creation changed storage',
        $errors
    );

    try {
        $directory->createDirectory('blocked-folder');
        $errors[] = 'WebDAV allowed a read-only account to create a folder';
    } catch (\Sabre\DAV\Exception\Forbidden $e) {
        readOnlyAccountFailIf(
            $e->getMessage() !== 'Account is read-only',
            'WebDAV folder-create rejection returned an unexpected message',
            $errors
        );
    }
    readOnlyAccountFailIf(
        is_dir($uploadDir . 'owned/blocked-folder'),
        'Rejected WebDAV folder creation changed storage',
        $errors
    );

    $file = new \FileRise\WebDAV\FileRiseFile(
        $uploadDir . 'owned/existing.txt',
        'viewer',
        false,
        $readOnlyPerms
    );
    $replacement = fopen('php://temp', 'w+b');
    fwrite($replacement, "replacement\n");
    rewind($replacement);
    try {
        $file->put($replacement);
        $errors[] = 'WebDAV allowed a read-only account to overwrite a file';
    } catch (\Sabre\DAV\Exception\Forbidden $e) {
        readOnlyAccountFailIf(
            $e->getMessage() !== 'Account is read-only',
            'WebDAV overwrite rejection returned an unexpected message',
            $errors
        );
    } finally {
        fclose($replacement);
    }
    readOnlyAccountFailIf(
        file_get_contents($uploadDir . 'owned/existing.txt') !== "original\n",
        'Rejected WebDAV overwrite changed file contents',
        $errors
    );

    try {
        $file->delete();
        $errors[] = 'WebDAV allowed a read-only account to delete a file';
    } catch (\Sabre\DAV\Exception\Forbidden $e) {
        readOnlyAccountFailIf(
            $e->getMessage() !== 'Account is read-only',
            'WebDAV delete rejection returned an unexpected message',
            $errors
        );
    }
    readOnlyAccountFailIf(
        !is_file($uploadDir . 'owned/existing.txt'),
        'Rejected WebDAV deletion removed the file',
        $errors
    );

    $readStream = $file->get();
    $readBody = is_resource($readStream) ? stream_get_contents($readStream) : '';
    if (is_resource($readStream)) {
        fclose($readStream);
    }
    readOnlyAccountFailIf(
        $readBody !== "original\n",
        'Read-only account could no longer download through WebDAV',
        $errors
    );
} finally {
    readOnlyAccountRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Read-only account regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Read-only account regressions passed\n";
