<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . '/fr-file-edit-' . bin2hex(random_bytes(6));

$GLOBALS['fileEditHeaders'] = [];
if (!function_exists('getallheaders')) {
    function getallheaders(): array
    {
        return $GLOBALS['fileEditHeaders'];
    }
}

function fileEditCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function fileEditRemove(string $path): void
{
    if (is_file($path) || is_link($path)) {
        unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $name) {
        fileEditRemove($path . '/' . $name);
    }
    rmdir($path);
}

foreach (['uploads/shared', 'users', 'metadata', 'sessions'] as $dir) {
    mkdir($tmp . '/' . $dir, 0700, true);
}

try {
    putenv('FR_TEST_UPLOAD_DIR=' . $tmp . '/uploads/');
    putenv('FR_TEST_USERS_DIR=' . $tmp . '/users/');
    putenv('FR_TEST_META_DIR=' . $tmp . '/metadata/');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    session_save_path($tmp . '/sessions');

    file_put_contents($tmp . '/users/users.txt', "alice:unused:0\nbob:unused:0\ncharlie:unused:0\n");
    file_put_contents($tmp . '/metadata/folder_acl.json', json_encode(['folders' => [
        'root' => ['owners' => ['admin']],
        'shared' => [
            'owners' => ['admin'],
            'read' => ['alice', 'bob', 'charlie'],
            'edit' => ['bob'],
            'explicit' => ['alice' => true, 'bob' => true, 'charlie' => true],
        ],
    ]]));
    file_put_contents($tmp . '/uploads/shared/document.txt', 'original');
    file_put_contents($tmp . '/metadata/shared_metadata.json', json_encode([
        'document.txt' => [
            'uploaded' => '2026-01-01 00:00:00',
            'modified' => '2026-01-01 00:00:00',
            'uploader' => 'alice',
        ],
    ]));

    require $baseDir . '/config/config.php';
    require_once $baseDir . '/src/FileRise/Http/Controllers/FileController.php';

    $controller = new \FileRise\Http\Controllers\FileController();
    $reflection = new ReflectionClass($controller);
    $withBody = $reflection->getMethod('withJsonBodyOverride');
    $save = static function (string $username, string $content) use ($controller, $withBody): array {
        $_SESSION = [
            'authenticated' => true,
            'username' => $username,
            'csrf_token' => 'file-edit-csrf',
        ];
        $GLOBALS['fileEditHeaders'] = ['X-CSRF-Token' => 'file-edit-csrf'];
        http_response_code(200);
        ob_start();
        $withBody->invoke($controller, [
            'folder' => 'shared',
            'fileName' => 'document.txt',
            'content' => $content,
        ], static function () use ($controller): void {
            $controller->saveFile();
        });
        $body = json_decode((string)ob_get_clean(), true);
        return [http_response_code(), is_array($body) ? $body : []];
    };

    [$status, $body] = $save('bob', 'edited by folder editor');
    fileEditCheck($status === 200 && isset($body['success']), 'Folder Edit permission did not authorize content editing');
    fileEditCheck(file_get_contents($tmp . '/uploads/shared/document.txt') === 'edited by folder editor', 'Authorized edit did not update the file');
    $metadata = json_decode((string)file_get_contents($tmp . '/metadata/shared_metadata.json'), true);
    fileEditCheck(($metadata['document.txt']['uploader'] ?? '') === 'alice', 'Editing changed the original uploader');

    [$status] = $save('charlie', 'unauthorized edit');
    fileEditCheck($status === 403, 'User without Edit permission changed file contents');
    fileEditCheck(file_get_contents($tmp . '/uploads/shared/document.txt') === 'edited by folder editor', 'Denied edit changed the file');

    [$status] = $save('alice', 'owner without edit');
    fileEditCheck($status === 403, 'File ownership bypassed the required Edit permission');
    fileEditCheck(file_get_contents($tmp . '/uploads/shared/document.txt') === 'edited by folder editor', 'Denied owner edit changed the file');

    echo "File edit permission regressions passed\n";
} finally {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_abort();
    }
    fileEditRemove($tmp);
}
