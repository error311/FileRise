<?php
declare(strict_types=1);

use FileRise\Domain\AuthModel;
use FileRise\WebDAV\CurrentUser;
use FileRise\WebDAV\FileRiseDirectory;
use FileRise\WebDAV\RequestPath;
use Sabre\DAV\Server;
use Sabre\HTTP\Request;
use Sabre\HTTP\Response;

if (($argv[1] ?? '') === '--base') {
    putenv('FR_TEST_UPLOAD_DIR=' . $argv[2] . '/uploads/');
    putenv('FR_TEST_USERS_DIR=' . $argv[2] . '/users/');
    putenv('FR_TEST_META_DIR=' . $argv[2] . '/metadata/');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    putenv('FR_BASE_PATH=' . $argv[3]);
    $_SERVER['HTTP_X_FORWARDED_PREFIX'] = $argv[4];
    $_SERVER['SCRIPT_NAME'] = $argv[5];
    define('FR_WEBDAV_REQUEST', true);
    require dirname(__DIR__, 2) . '/config/config.php';
    echo FR_BASE_PATH;
    exit;
}

function davPathCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

function davPathRemove(string $path): void
{
    if (is_file($path) || is_link($path)) {
        unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $name) {
        davPathRemove($path . '/' . $name);
    }
    rmdir($path);
}

function davPathRequest(string $method, string $url, string $destination, string $base, array $options = []): array
{
    $user = $options['user'] ?? 'admin';
    $admin = $user === 'admin';
    $perms = ['admin' => $admin, 'isAdmin' => $admin, 'readOnly' => $options['readOnly'] ?? false];
    CurrentUser::set($user);
    $server = new Server(new FileRiseDirectory(rtrim(UPLOAD_DIR, '/'), $user, $admin, $perms));
    $headers = [
        'Destination' => $destination, 'Overwrite' => $options['overwrite'] ?? 'F',
        'Authorization' => 'Basic ' . base64_encode($user . ':' . ($options['password'] ?? 'FixturePass123!')),
    ];
    $request = new Request($method, $url, $headers);
    $server->httpRequest = $request;
    $response = new Response();
    $server->httpResponse = $response;
    $server->addPlugin(new \Sabre\DAV\Auth\Plugin(new \Sabre\DAV\Auth\Backend\BasicCallBack(
        static fn(string $username, string $password): bool => AuthModel::authenticateWebDav($username, $password)
    )));
    RequestPath::configure($server, $base, is_dir(UPLOAD_DIR . 'uploads'));
    $request->setBaseUrl($server->getBaseUri());
    try {
        $server->invokeMethod($request, $response, false);
    } catch (\Sabre\DAV\Exception $e) {
        $response->setStatus($e->getHTTPCode());
        $error = $e->getMessage();
    }
    return [$response->getStatus(), $server->getBaseUri(), $request->getHeader('Destination'), $error ?? ''];
}

$tmp = sys_get_temp_dir() . '/fr-dav-path-' . bin2hex(random_bytes(6));
try {
    foreach (['uploads', 'users', 'metadata'] as $dir) {
        mkdir($tmp . '/' . $dir, 0700, true);
    }
    putenv('FR_TEST_UPLOAD_DIR=' . $tmp . '/uploads/');
    putenv('FR_TEST_USERS_DIR=' . $tmp . '/users/');
    putenv('FR_TEST_META_DIR=' . $tmp . '/metadata/');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    define('FR_WEBDAV_REQUEST', true);
    require dirname(__DIR__, 2) . '/config/config.php';
    $hash = password_hash('FixturePass123!', PASSWORD_BCRYPT);
    file_put_contents(USERS_DIR . 'users.txt', "admin:$hash:1\nbob:$hash:0\n");
    file_put_contents(META_DIR . 'folder_acl.json', json_encode(['folders' => [
        'root' => ['read' => ['bob'], 'inherit' => ['bob' => true]],
        'blocked' => ['read' => ['bob']],
    ]]));
    mkdir(UPLOAD_DIR . 'blocked');
    mkdir(UPLOAD_DIR . 'source');
    mkdir(UPLOAD_DIR . 'target');

    $cases = [
        'root' => ['', '/webdav.php/', '/webdav.php/'],
        'stripped' => ['/filerise', '/webdav.php/', '/filerise/webdav.php/'],
        'retained' => ['/filerise', '/filerise/webdav.php/', '/filerise/webdav.php/'],
        'nested-prefix' => ['/apps/files', '/webdav.php/', '/apps/files/webdav.php/'],
        'existing-workaround' => ['/filerise', '/webdav.php/', '/webdav.php/'],
        'legacy-root' => ['', '/webdav.php/uploads/', '/webdav.php/uploads/'],
        'legacy-stripped' => ['/filerise', '/webdav.php/uploads/', '/filerise/webdav.php/uploads/'],
        'legacy-retained' => ['/filerise', '/filerise/webdav.php/uploads/', '/filerise/webdav.php/uploads/'],
    ];
    foreach ($cases as $label => [$base, $sourcePrefix, $destPrefix]) {
        foreach (['MOVE', 'COPY'] as $method) {
            foreach (['', 'https://example.com:8443'] as $origin) {
                $name = $label . '-' . strtolower($method) . ($origin === '' ? '-path' : '-absolute');
                file_put_contents(UPLOAD_DIR . 'source/' . $name . '.txt', 'DAV PATH CANARY');
                $target = $name . ' moved.txt';
                [$status, $baseUri, , $error] = davPathRequest(
                    $method, $sourcePrefix . 'source/' . $name . '.txt', $origin . $destPrefix . 'target/' . rawurlencode($target), $base
                );
                davPathCheck($status === 201, "$label $method failed with $status: $error");
                davPathCheck($baseUri === $sourcePrefix, "$label changed the source base URI");
                davPathCheck(file_get_contents(UPLOAD_DIR . 'target/' . $target) === 'DAV PATH CANARY', "$label wrote wrong content/path");
                davPathCheck(is_file(UPLOAD_DIR . 'source/' . $name . '.txt') === ($method === 'COPY'), "$label source handling regressed");
            }
        }
    }

    foreach ([
        ['/explicit', '/forwarded', '/webdav.php', '/explicit'],
        ['', '/filerise', '/webdav.php', '/filerise'],
        ['', '', '/filerise/webdav.php', '/filerise'],
        ['', '', '/webdav.php', ''],
    ] as [$envBase, $forwarded, $scriptName, $expected]) {
        $proc = proc_open([PHP_BINARY, __FILE__, '--base', $tmp, $envBase, $forwarded, $scriptName], [
            1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
        ], $pipes);
        davPathCheck(is_resource($proc), 'Could not start base-path fixture');
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);
        davPathCheck($code === 0 && $out === $expected, 'Base-path discovery failed: ' . $err);
    }

    // A real uploads child is a real folder, not the historical root alias.
    mkdir(UPLOAD_DIR . 'uploads');
    mkdir(UPLOAD_DIR . 'uploads/source');
    mkdir(UPLOAD_DIR . 'uploads/target');
    file_put_contents(UPLOAD_DIR . 'uploads/source/source.txt', 'REAL CHILD');
    [$status, $baseUri] = davPathRequest('MOVE', '/webdav.php/uploads/source/source.txt', '/filerise/webdav.php/uploads/target/dest.txt', '/filerise');
    davPathCheck($status === 201 && $baseUri === '/webdav.php/' && is_file(UPLOAD_DIR . 'uploads/target/dest.txt'), 'Real uploads directory became an alias');

    file_put_contents(UPLOAD_DIR . 'source/source.txt', 'UNCHANGED SOURCE');
    file_put_contents(UPLOAD_DIR . 'existing.txt', 'UNCHANGED TARGET');
    foreach (['MOVE', 'COPY'] as $method) {
        foreach ([
            '/filerise-other/webdav.php/no.txt',
            '/filerise/webdav.php-other/no.txt',
            '/elsewhere/no.txt',
            '/filerise/webdav.php/../../outside.txt',
        ] as $destination) {
            [$status] = davPathRequest($method, '/webdav.php/source/source.txt', 'https://example.com' . $destination, '/filerise');
            davPathCheck($status === 403, 'Out-of-base destination was accepted');
        }
        [$status] = davPathRequest($method, '/webdav.php/source/source.txt', '/filerise/webdav.php/existing.txt', '/filerise');
        davPathCheck($status === 412 && file_get_contents(UPLOAD_DIR . 'existing.txt') === 'UNCHANGED TARGET', 'Overwrite:F regressed');
        [$status] = davPathRequest($method, '/webdav.php/source/source.txt', '/filerise/webdav.php/blocked/no.txt', '/filerise', ['user' => 'bob']);
        davPathCheck($status === 403 && !file_exists(UPLOAD_DIR . 'blocked/no.txt'), 'Destination folder ACL was bypassed');
        [$status] = davPathRequest($method, '/webdav.php/source/source.txt', '/filerise/webdav.php/readonly.txt', '/filerise', ['readOnly' => true]);
        davPathCheck($status === 403 && !file_exists(UPLOAD_DIR . 'readonly.txt'), 'Read-only account restriction was bypassed');
        [$status] = davPathRequest($method, '/webdav.php/source/source.txt', '/filerise/webdav.php/invalid.txt', '/filerise', ['password' => 'wrong']);
        davPathCheck($status === 401 && !file_exists(UPLOAD_DIR . 'invalid.txt'), 'Invalid credentials were accepted');
        davPathCheck(file_get_contents(UPLOAD_DIR . 'source/source.txt') === 'UNCHANGED SOURCE', 'Denied operation modified the source');
    }
    // Non-MOVE/COPY requests and unrelated URI components must be untouched.
    [$status, , $destination] = davPathRequest('GET', '/webdav.php/source/source.txt', 'https://example.com/filerise/webdav.php/no.txt', '/filerise');
    davPathCheck($status === 200 && $destination === 'https://example.com/filerise/webdav.php/no.txt', 'GET handling changed');
    $server = new Server();
    $server->httpRequest = new Request('COPY', '/webdav.php/source/source.txt', [
        'Destination' => 'https://example.com:8443/filerise/webdav.php/a%2520b%20c.txt',
    ]);
    RequestPath::configure($server, '/filerise', false);
    davPathCheck($server->httpRequest->getHeader('Destination') === 'https://example.com:8443/webdav.php/a%2520b%20c.txt', 'URI authority or percent encoding changed');
    davPathCheck(session_status() === PHP_SESSION_NONE, 'WebDAV started a browser session');
    echo "WebDAV subpath regressions passed\n";
} finally {
    davPathRemove($tmp);
}
