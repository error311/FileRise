<?php
declare(strict_types=1);

// Separate PHP processes exercise the real request bootstrap and persisted sessions.
if (($argv[1] ?? '') === '--request') {
    $roleTestRoot = $argv[2];
    $roleTestAction = $argv[3];
    $roleTestSession = $argv[4];
    session_save_path($roleTestRoot . '/sessions');
    session_id($roleTestSession);
    putenv('FR_TEST_UPLOAD_DIR=' . $roleTestRoot . '/uploads/');
    putenv('FR_TEST_USERS_DIR=' . $roleTestRoot . '/users/');
    putenv('FR_TEST_META_DIR=' . $roleTestRoot . '/metadata/');
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    // Exercise the admin-panel configuration rather than an environment override.
    putenv('FR_OIDC_ALLOW_DEMOTE');
    if ($roleTestAction === 'legacy-acl') {
        define('DEFAULT_ADMIN_USER', 'operator');
    }
    require dirname(__DIR__, 2) . '/config/config.php';
    http_response_code(200);
    ob_start();
    register_shutdown_function(static function (): void {
        $body = (string)ob_get_clean();
        echo json_encode([
            'status' => http_response_code(),
            'body' => json_decode($body, true),
            'session' => $_SESSION,
            'sessionId' => session_id(),
        ]);
    });
    switch ($roleTestAction) {
        case 'seed':
            $_SESSION = [
                'authenticated' => true, 'username' => 'operator', 'isAdmin' => true,
                'role' => 'admin', 'admin' => true, 'csrf_token' => 'role-refresh-test-token',
                'authenticated_at' => 123456789, 'view_preference' => 'list',
            ];
            break;
        case 'sync':
            $bound = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
                'operator', true, 'https://issuer.example.test', 'operator-subject', 'operator'
            );
            $demoted = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
                'operator', false, 'https://issuer.example.test', 'operator-subject'
            );
            echo json_encode([
                'bound' => $bound, 'demoted' => $demoted,
                'role' => \FileRise\Domain\UserModel::getUserRole('operator'),
            ]);
            break;
        case 'users':
            (new \FileRise\Http\Controllers\UserController())->getUsers();
            break;
        case 'admin':
            \FileRise\Http\Controllers\AdminController::requireAdmin();
            echo json_encode(['allowed' => true]);
            break;
        case 'add':
            $_SERVER['REQUEST_METHOD'] = 'POST';
            $_SERVER['HTTP_X_CSRF_TOKEN'] = $_SESSION['csrf_token'] ?? '';
            (new \FileRise\Http\Controllers\UserController())->addUser();
            break;
        case 'secret':
        case 'team':
            $_GET = ['folder' => $roleTestAction, 'includeContent' => '1'];
            (new \FileRise\Http\Controllers\FileController())->getFileList();
            break;
        case 'legacy-acl':
            echo json_encode(['admin' => \FileRise\Support\ACL::isAdmin([
                'admin' => true, 'isAdmin' => true, 'role' => '1',
            ])]);
            break;
        case 'check':
            (new \FileRise\Http\Controllers\AuthController())->checkAuth();
            break;
    }
    exit;
}

function roleRefreshCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function roleRefreshRequest(string $root, string $action, string $session): array
{
    $proc = proc_open([PHP_BINARY, __FILE__, '--request', $root, $action, $session], [
        1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('Could not start PHP request fixture.');
    }
    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    $result = json_decode($out, true);
    roleRefreshCheck($code === 0 && is_array($result), "$action failed: $err");
    return $result;
}

function roleRefreshConfig(string $path, bool $allowDemote): void
{
    $iv = random_bytes(16);
    $cipher = openssl_encrypt(
        json_encode(['oidc' => ['allowDemote' => $allowDemote]]),
        'AES-256-CBC', 'test_persistent_tokens_key_32bytes!', OPENSSL_RAW_DATA, $iv
    );
    file_put_contents($path, base64_encode($iv . $cipher));
}

function roleRefreshRemove(string $path): void
{
    if (is_file($path) || is_link($path)) {
        unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $name) {
        roleRefreshRemove($path . '/' . $name);
    }
    rmdir($path);
}

$root = sys_get_temp_dir() . '/fr-session-role-' . bin2hex(random_bytes(6));
try {
    foreach (['users', 'sessions', 'metadata', 'uploads/secret', 'uploads/team'] as $dir) {
        mkdir($root . '/' . $dir, 0700, true);
    }
    file_put_contents($root . '/users/users.txt', "owner:unused:1\noperator:unused:1\n");
    file_put_contents($root . '/metadata/folder_acl.json', json_encode(['folders' => [
        'secret' => ['read' => ['owner']], 'team' => ['read' => ['operator']],
    ]]));
    file_put_contents($root . '/uploads/secret/canary.txt', 'PROTECTED ROLE TEST');
    file_put_contents($root . '/uploads/team/normal.txt', 'AUTHORIZED ROLE TEST');
    $config = $root . '/users/adminConfig.json';
    roleRefreshConfig($config, false);
    foreach (['old-device-a', 'old-device-b'] as $session) {
        roleRefreshRequest($root, 'seed', $session);
    }
    $sync = roleRefreshRequest($root, 'sync', 'oidc-sync');
    roleRefreshCheck(($sync['body']['role'] ?? null) === '1', 'Default-disabled demotion changed an admin role.');
    foreach (['users', 'admin', 'secret'] as $action) {
        $result = roleRefreshRequest($root, $action, 'old-device-a');
        roleRefreshCheck($result['status'] === 200, "Existing admin lost $action access.");
    }
    roleRefreshConfig($config, true);
    $sync = roleRefreshRequest($root, 'sync', 'oidc-sync');
    roleRefreshCheck(!empty($sync['body']['demoted']['success']) && $sync['body']['role'] === '0', 'OIDC did not persist the role reduction.');
    foreach (['old-device-a', 'old-device-b'] as $session) {
        foreach (['users', 'admin', 'secret', 'add'] as $action) {
            $result = roleRefreshRequest($root, $action, $session);
            roleRefreshCheck($result['status'] === 403, "Revoked session retained $action access.");
        }
        $check = roleRefreshRequest($root, 'check', $session);
        roleRefreshCheck($check['body']['authenticated'] && !$check['body']['isAdmin'], 'Demotion should retain the regular-user login.');
        roleRefreshCheck($check['sessionId'] === $session, 'Role refresh unexpectedly rotated the session.');
        roleRefreshCheck($check['session']['csrf_token'] === 'role-refresh-test-token', 'CSRF token changed on role refresh.');
        roleRefreshCheck($check['session']['authenticated_at'] === 123456789, 'Role refresh must not count as fresh authentication.');
        roleRefreshCheck($check['session']['view_preference'] === 'list', 'Session preferences changed.');
        roleRefreshCheck($check['session']['role'] === '0' && $check['session']['admin'] === false, 'Legacy admin flags remained elevated.');
        $team = roleRefreshRequest($root, 'team', $session);
        roleRefreshCheck($team['status'] === 200 && ($team['body']['files'][0]['content'] ?? '') === 'AUTHORIZED ROLE TEST', 'Regular-user ACL access was lost.');
    }
    $legacy = roleRefreshRequest($root, 'legacy-acl', 'old-device-a');
    roleRefreshCheck($legacy['body']['admin'] === false, 'Legacy ACL defaults overrode the refreshed non-admin role.');
    // Existing ordinary sessions should observe a legitimate promotion as well.
    file_put_contents($root . '/users/users.txt', "owner:unused:1\noperator:unused:1\n");
    $promoted = roleRefreshRequest($root, 'users', 'old-device-a');
    roleRefreshCheck($promoted['status'] === 200 && $promoted['session']['isAdmin'], 'Legitimate role promotion was not observed.');
    file_put_contents($root . '/users/users.txt', "owner:unused:1\n");
    $deleted = roleRefreshRequest($root, 'users', 'old-device-a');
    roleRefreshCheck($deleted['status'] === 401, 'Deleted account retained access.');
    roleRefreshCheck(!array_intersect(['role', 'admin', 'isAdmin'], array_keys($deleted['session'])), 'Deletion left legacy privilege flags.');
    echo "Session role refresh regressions passed\n";
} finally {
    roleRefreshRemove($root);
}
