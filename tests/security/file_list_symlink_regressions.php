<?php
declare(strict_types=1);

use FileRise\Domain\FileModel;
use FileRise\Http\Controllers\FileController;

$baseDir = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . '/fr-list-symlink-' . bin2hex(random_bytes(6));
$errors = [];

function listSymlinkCheck(bool $condition, string $message): void
{
    if (!$condition) {
        $GLOBALS['errors'][] = $message;
    }
}

function listSymlinkRemove(string $path): void
{
    if (is_link($path) || is_file($path)) {
        unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $entry) {
        listSymlinkRemove($path . '/' . $entry);
    }
    rmdir($path);
}

function listSymlinkRequest(string $folder, array $options = []): array
{
    $_GET = array_merge(['folder' => $folder, 'includeContent' => '1'], $options);
    http_response_code(200);
    ob_start();
    (new FileController())->getFileList();
    $body = (string)ob_get_clean();
    return [http_response_code(), json_decode($body, true), $body];
}

try {
    foreach (['uploads/team/inside', 'uploads/private', 'uploads-backup', 'outside', 'users/pro', 'metadata/sources/ext', 'sessions'] as $dir) {
        mkdir($tmp . '/' . $dir, 0775, true);
    }
    // The configured root itself may be a symlink, as in an existing deployment.
    if (!symlink($tmp . '/uploads', $tmp . '/root-link')) {
        throw new RuntimeException('Symlinks are required for this regression test.');
    }
    file_put_contents($tmp . '/uploads/team/normal.txt', 'NORMAL CONTENT');
    file_put_contents($tmp . '/uploads/team/inside/large.txt', str_repeat('A', 9000));
    file_put_contents($tmp . '/outside/secret.txt', 'OUTSIDE ROOT SECRET');
    file_put_contents($tmp . '/uploads-backup/secret.txt', 'SIBLING ROOT SECRET');
    file_put_contents($tmp . '/users/users.txt', "bob:unused:0\n");
    file_put_contents($tmp . '/metadata/folder_acl.json', json_encode(['folders' => [
        'team' => ['read' => ['bob'], 'inherit' => ['bob' => true]],
    ]]));
    if (in_array('--sources', $argv, true)) {
        file_put_contents($tmp . '/users/pro/sources.json', json_encode([
            'enabled' => true,
            'sources' => [
                ['id' => 'local', 'type' => 'local', 'enabled' => true, 'config' => ['path' => $tmp . '/root-link']],
                ['id' => 'ext', 'type' => 'local', 'enabled' => true, 'config' => ['path' => $tmp . '/uploads/team/inside']],
            ],
        ]));
        file_put_contents($tmp . '/metadata/sources/ext/folder_acl.json', json_encode(['folders' => [
            'root' => ['read' => ['bob'], 'inherit' => ['bob' => true]],
        ]]));
    }
    foreach ([
        'escape' => $tmp . '/outside',
        'sibling' => $tmp . '/uploads-backup',
        'inside-link' => 'inside',
        'outside.txt' => $tmp . '/outside/secret.txt',
        'sibling.txt' => $tmp . '/uploads-backup/secret.txt',
        'inside.txt' => 'normal.txt',
        'broken.txt' => $tmp . '/missing',
    ] as $name => $target) {
        symlink($target, $tmp . '/uploads/team/' . $name);
    }

    session_save_path($tmp . '/sessions');
    putenv('FR_TEST_UPLOAD_DIR=' . $tmp . '/root-link/');
    putenv('FR_TEST_USERS_DIR=' . $tmp . '/users/');
    putenv('FR_TEST_META_DIR=' . $tmp . '/metadata/');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    require $baseDir . '/config/config.php';
    require_once $baseDir . '/src/FileRise/Http/Controllers/FileController.php';

    $_SESSION = [];
    [$status] = listSymlinkRequest('team/escape');
    listSymlinkCheck($status === 401, 'Unauthenticated listing must be rejected.');
    $_SESSION = ['authenticated' => true, 'username' => 'bob', 'isAdmin' => false];
    [$status] = listSymlinkRequest('private');
    listSymlinkCheck($status === 403, 'Folder ACL denial must remain effective.');

    foreach (['team/escape', 'team/sibling'] as $folder) {
        foreach (['0', '1'] as $includeContent) {
            [$status, $result, $body] = listSymlinkRequest($folder, ['includeContent' => $includeContent]);
            listSymlinkCheck($status === 400 && isset($result['error']), "$folder must reject an outside directory.");
            listSymlinkCheck(!str_contains($body, 'secret.txt') && !str_contains($body, 'ROOT SECRET'), "$folder leaked outside data.");
        }
    }
    [$status, $result] = listSymlinkRequest('team');
    $files = array_column($result['files'] ?? [], null, 'name');
    listSymlinkCheck($status === 200 && count($files) === 2, 'Only the ordinary file and in-root file link should be listed.');
    foreach (['normal.txt', 'inside.txt'] as $name) {
        listSymlinkCheck(($files[$name]['content'] ?? '') === 'NORMAL CONTENT', "$name should retain its snippet.");
    }
    [$status, $result] = listSymlinkRequest('team', ['pageSize' => 1, 'sortBy' => 'name', 'sortDir' => 'asc']);
    listSymlinkCheck($status === 200 && count($result['files'] ?? []) === 1, 'Pagination should still work.');
    listSymlinkCheck(($result['paging']['total'] ?? null) === 2, 'Paging totals must exclude outside file links.');
    [$status, $result] = listSymlinkRequest('team/inside-link');
    listSymlinkCheck($status === 200 && strlen($result['files'][0]['content'] ?? '') === 8192, 'In-root directory links must preserve bounded snippets.');
    listSymlinkCheck(($result['files'][0]['contentTruncated'] ?? false) === true, 'Large snippets must remain marked truncated.');
    [$status, $result] = listSymlinkRequest('team', ['includeContent' => '0']);
    listSymlinkCheck($status === 200 && ($result['files'][0]['content'] ?? null) === '', 'Default metadata listing must not inline content.');

    foreach ([['team/sibling', 'secret.txt'], ['team', 'sibling.txt'], ['team/escape', 'secret.txt']] as [$folder, $name]) {
        listSymlinkCheck(isset(FileModel::getDownloadInfo($folder, $name)['error']), "Download must reject $folder/$name outside the root.");
    }
    listSymlinkCheck(!isset(FileModel::getDownloadInfo('team', 'inside.txt')['error']), 'In-root linked downloads must remain supported.');
    [$status] = listSymlinkRequest('team/missing');
    listSymlinkCheck($status === 400, 'Missing directory should remain an error.');
    if (in_array('--sources', $argv, true)) {
        symlink('../normal.txt', $tmp . '/uploads/team/inside/other-source.txt');
        symlink('..', $tmp . '/uploads/team/inside/other-source');
        [$status, $result] = listSymlinkRequest('root', ['sourceId' => 'ext']);
        listSymlinkCheck($status === 200 && count($result['files'] ?? []) === 1, 'Listing must use the selected source root, not the global upload root.');
        listSymlinkCheck(($result['files'][0]['name'] ?? '') === 'large.txt', 'Selected source must preserve its own files.');
        [$status] = listSymlinkRequest('other-source', ['sourceId' => 'ext']);
        listSymlinkCheck($status === 400, 'Directory link crossing the selected source root must be rejected.');
    }
} finally {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    listSymlinkRemove($tmp);
}

if ($errors) {
    fwrite(STDERR, "File list symlink regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}
if (!in_array('--sources', $argv, true)) {
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' --sources', $sourceStatus);
    if ($sourceStatus !== 0) {
        exit($sourceStatus);
    }
}
echo "File list symlink regressions passed\n";
