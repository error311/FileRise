<?php

declare(strict_types=1);

use FileRise\Support\ACL;
use FileRise\WebDAV\FileRiseDirectory;
use Sabre\DAV\Exception\Forbidden;

$baseDir = dirname(__DIR__, 2);

function davCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function davDenied(callable $operation): void
{
    try {
        $operation();
    } catch (Forbidden $e) {
        return;
    }
    throw new RuntimeException('Protected WebDAV operation was permitted');
}

function davRemoveTree(string $path): void
{
    if (is_file($path) || is_link($path)) {
        unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $name) {
        davRemoveTree($path . '/' . $name);
    }
    rmdir($path);
}

$mode = getenv('FR_DAV_TEST_MODE');
if ($mode !== false && $mode !== '') {
    $fixture = (string)getenv('FR_DAV_TEST_DIR');
    session_save_path($fixture . '/sessions');
    $_SERVER['HTTP_HOST'] = 'localhost';
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    if (str_contains($mode, 'proxy')) {
        $_SERVER['HTTP_X_REMOTE_USER'] = 'admin';
    }
    if (str_contains($mode, 'remember')) {
        $_COOKIE['remember_me_token'] = (string)file_get_contents($fixture . '/token');
    }
    if (str_contains($mode, 'session') || str_contains($mode, 'prestarted')) {
        session_id('fixture-admin-session');
        $_COOKIE[session_name()] = 'fixture-admin-session';
    }
    if ($mode === 'dav-prestarted') {
        session_start();
        // Unsaved changes must not be persisted by the WebDAV bootstrap.
        $_SESSION['unsaved'] = true;
    }
    $dav = str_starts_with($mode, 'dav-');
    if ($dav) {
        define('FR_WEBDAV_REQUEST', true);
    }
    define('DEFAULT_ADMIN_USER', 'admin');
    require $baseDir . '/config/config.php';

    if (!$dav) {
        davCheck(!empty($_SESSION['authenticated']) && !empty($_SESSION['isAdmin']), 'Browser login regressed');
        davCheck(ACL::isAdmin([]), 'Browser ACL session fallback regressed');
        if ($mode === 'browser-session') {
            davCheck(\FileRise\Storage\SourceContext::getActiveId() === 'browser-source', 'Browser source selection regressed');
        }
        session_write_close();
        exit(0);
    }

    davCheck(session_status() === PHP_SESSION_NONE, 'WebDAV opened or retained a browser session');
    davCheck($_SESSION === [], 'WebDAV inherited or created session state');
    davCheck(!ACL::canRead('bob', [], 'secret'), 'Bob gained protected read access');
    davCheck(!ACL::canWrite('bob', [], 'secret'), 'Bob gained protected write access');
    $source = \FileRise\Storage\SourceContext::getActiveId();
    davCheck($source === 'local', 'Browser session selected the WebDAV source');

    foreach ([['isAdmin' => true], ['role' => '1'], ['username' => 'admin']] as $ambient) {
        $_SESSION = $ambient;
        davCheck(!ACL::isAdmin([]), 'Ambient ACL administrator fallback remained active');
        davCheck(!ACL::canManage('bob', [], 'secret'), 'Ambient session granted management');
        davCheck(!ACL::canShare('bob', [], 'secret'), 'Ambient session granted sharing');
    }
    foreach ([['admin' => true], ['isAdmin' => true], ['role' => '1']] as $explicit) {
        davCheck(ACL::isAdmin($explicit), 'Explicit administrator role was lost');
    }

    require_once $baseDir . '/src/FileRise/WebDAV/FileRiseDirectory.php';
    $secret = new FileRiseDirectory(UPLOAD_DIR . 'secret', 'bob', false, []);
    davDenied(fn() => $secret->getChildren());
    davDenied(fn() => $secret->getChild('secret.txt'));
    davDenied(fn() => $secret->createFile('refused.txt', 'refused'));
    davDenied(fn() => $secret->createDirectory('refused'));
    davCheck(!file_exists(UPLOAD_DIR . 'secret/refused.txt'), 'Denied write left a file');

    $_SESSION = [];
    $owned = new FileRiseDirectory(UPLOAD_DIR . 'owned', 'bob', false, []);
    $node = $owned->createFile('allowed.txt', 'allowed');
    $stream = $node->get();
    davCheck(stream_get_contents($stream) === 'allowed', 'Authorized WebDAV read/write regressed');
    fclose($stream);
    $node->put('updated');
    davCheck(file_get_contents(UPLOAD_DIR . 'owned/allowed.txt') === 'updated', 'Own overwrite regressed');
    $readOnly = new FileRiseDirectory(UPLOAD_DIR . 'owned', 'bob', false, ['readOnly' => true]);
    davDenied(fn() => $readOnly->createFile('readonly.txt', 'refused'));
    $disabled = new FileRiseDirectory(UPLOAD_DIR . 'owned', 'bob', false, ['disableUpload' => true]);
    davDenied(fn() => $disabled->createFile('disabled.txt', 'refused'));
    $admin = new FileRiseDirectory(UPLOAD_DIR . 'secret', 'admin', true, ['isAdmin' => true]);
    davCheck(count($admin->getChildren()) === 1, 'Administrator listing regressed');
    exit(0);
}

$tmp = sys_get_temp_dir() . '/fr-dav-isolation-' . bin2hex(random_bytes(6));
foreach (['users/pro', 'uploads/secret', 'uploads/owned', 'other-source', 'metadata', 'sessions'] as $dir) {
    mkdir($tmp . '/' . $dir, 0700, true);
}
try {
    foreach (['USERS' => 'users', 'UPLOAD' => 'uploads', 'META' => 'metadata'] as $key => $dir) {
        putenv('FR_TEST_' . $key . '_DIR=' . $tmp . '/' . $dir);
    }
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    putenv('FR_TRUSTED_PROXIES=127.0.0.1');
    file_put_contents($tmp . '/users/users.txt', "admin:unused:1\nbob:unused:0\n");
    file_put_contents($tmp . '/users/adminConfig.json', json_encode([
        'enableWebDAV' => true,
        'loginOptions' => ['authBypass' => true, 'authHeaderName' => 'X-Remote-User'],
    ]));
    file_put_contents($tmp . '/users/pro/sources.json', json_encode([
        'enabled' => true,
        'sources' => [
            ['id' => 'local', 'type' => 'local', 'enabled' => true, 'config' => ['path' => $tmp . '/uploads']],
            ['id' => 'browser-source', 'type' => 'local', 'enabled' => true, 'config' => ['path' => $tmp . '/other-source']],
        ],
    ]));
    file_put_contents($tmp . '/metadata/folder_acl.json', json_encode(['folders' => [
        'root' => ['owners' => ['admin']],
        'secret' => ['owners' => ['admin']],
        'owned' => ['owners' => ['bob']],
    ]]));
    file_put_contents($tmp . '/uploads/secret/secret.txt', 'secret');
    session_save_path($tmp . '/sessions');
    session_id('fixture-admin-session');
    require $baseDir . '/config/config.php';
    $_SESSION = ['authenticated' => true, 'username' => 'admin', 'isAdmin' => true, 'active_source' => 'browser-source'];
    session_write_close();
    $sessionPath = $tmp . '/sessions/sess_fixture-admin-session';
    $sessionBefore = file_get_contents($sessionPath);
    $token = \FileRise\Domain\AuthModel::issueRememberToken('admin', true);
    file_put_contents($tmp . '/token', $token['token']);
    $tokensPath = $tmp . '/users/persistent_tokens.json';
    $tokensBefore = file_get_contents($tokensPath);
    putenv('FR_DAV_TEST_DIR=' . $tmp);
    foreach (['dav-session', 'dav-remember', 'dav-proxy', 'dav-prestarted', 'browser-session', 'browser-proxy', 'browser-remember'] as $case) {
        putenv('FR_DAV_TEST_MODE=' . $case);
        $process = proc_open([PHP_BINARY, '-d', 'display_errors=stderr', __FILE__], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        davCheck(is_resource($process), 'Unable to start test child');
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        davCheck(proc_close($process) === 0, $case . ' failed: ' . $stdout . $stderr);
        if (str_starts_with($case, 'dav-')) {
            davCheck(file_get_contents($sessionPath) === $sessionBefore, 'WebDAV changed the stored admin session');
            davCheck(file_get_contents($tokensPath) === $tokensBefore, 'WebDAV consumed/rotated the remember token');
        }
    }
    echo "WebDAV session isolation regressions passed\n";
} finally {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_abort();
    }
    davRemoveTree($tmp);
}
