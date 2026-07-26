<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

if (getenv('FR_PORTAL_GET_AUTH_CHILD') === '1') {
    $sessionDir = (string)getenv('FR_PORTAL_GET_AUTH_SESSION_DIR');
    if ($sessionDir !== '') {
        session_save_path($sessionDir);
    }

    if (getenv('FR_PORTAL_GET_AUTH_MODE') === 'authenticated') {
        session_start();
        $_SESSION['authenticated'] = true;
        $_SESSION['username'] = 'portal_user';
        $_SESSION['role'] = '0';
        $_SESSION['isAdmin'] = false;
        session_write_close();
    }

    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_SERVER['HTTP_HOST'] = 'localhost';
    $_GET = ['slug' => 'client-portal'];

    register_shutdown_function(static function (): void {
        echo "\n__STATUS__=" . http_response_code();
    });

    require $baseDir . '/public/api/pro/portals/get.php';
    exit(0);
}

$tmpBase = $baseDir . '/tests/.tmp_portal_get_auth_' . bin2hex(random_bytes(4));
$usersDir = $tmpBase . '/users/';
$uploadDir = $tmpBase . '/uploads/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';
$proDir = $usersDir . 'pro/';

function portalGetAuthRmTree(string $dir): void
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
        portalGetAuthRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

/**
 * @return array{status:int,payload:array<string,mixed>,error?:string}
 */
function portalGetAuthRunCase(
    string $mode,
    string $usersDir,
    string $uploadDir,
    string $metaDir,
    string $sessionDir
): array {
    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__);
    $env = array_merge($_ENV, [
        'FR_PORTAL_GET_AUTH_CHILD' => '1',
        'FR_PORTAL_GET_AUTH_MODE' => $mode,
        'FR_PORTAL_GET_AUTH_SESSION_DIR' => $sessionDir,
        'FR_TEST_USERS_DIR' => $usersDir,
        'FR_TEST_UPLOAD_DIR' => $uploadDir,
        'FR_TEST_META_DIR' => $metaDir,
        'PERSISTENT_TOKENS_KEY' => 'test_persistent_tokens_key_32bytes!',
    ]);
    $process = proc_open(
        $command,
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        dirname(__DIR__, 2),
        $env
    );
    if (!is_resource($process)) {
        return ['status' => 0, 'payload' => [], 'error' => 'failed to start child process'];
    }

    $stdout = (string)stream_get_contents($pipes[1]);
    $stderr = (string)stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if (!preg_match('/\n__STATUS__=(\d+)\s*$/', $stdout, $match)) {
        return [
            'status' => 0,
            'payload' => [],
            'error' => 'missing status code: ' . trim($stdout . ' ' . $stderr),
        ];
    }

    $json = substr($stdout, 0, (int)strrpos($stdout, "\n__STATUS__="));
    $payload = json_decode(trim($json), true);
    if ($exitCode !== 0 || !is_array($payload)) {
        return [
            'status' => (int)$match[1],
            'payload' => [],
            'error' => 'invalid child response: ' . trim($stdout . ' ' . $stderr),
        ];
    }

    return ['status' => (int)$match[1], 'payload' => $payload];
}

$errors = [];

try {
    foreach ([$usersDir, $uploadDir, $metaDir, $sessionDir, $proDir] as $dir) {
        @mkdir($dir, 0775, true);
    }

    file_put_contents($usersDir . 'users.txt', 'portal_user:unused:0' . PHP_EOL, LOCK_EX);
    file_put_contents($proDir . 'bootstrap_pro.php', "<?php\ndefine('FR_PRO_ACTIVE', true);\n", LOCK_EX);
    file_put_contents(
        $proDir . 'ProPortals.php',
        <<<'PHP'
<?php
final class ProPortals
{
    public function __construct(string $baseDir)
    {
    }

    public function listPortals(): array
    {
        return [
            'client-portal' => [
                'label' => 'Client Portal',
                'folder' => 'confidential/client-acme-contracts',
                'clientEmail' => 'legal-contact@client-acme.example',
                'uploadOnly' => true,
                'allowDownload' => false,
                'uploadMaxSizeMb' => 25,
                'uploadExtWhitelist' => 'pdf,docx',
                'uploadMaxPerDay' => 10,
            ],
        ];
    }
}
PHP,
        LOCK_EX
    );

    $anonymous = portalGetAuthRunCase('anonymous', $usersDir, $uploadDir, $metaDir, $sessionDir);
    if (($anonymous['status'] ?? 0) !== 401) {
        $errors[] = 'anonymous request should return HTTP 401';
    }
    if (($anonymous['payload']['error'] ?? '') !== 'Unauthorized') {
        $errors[] = 'anonymous request should return Unauthorized JSON';
    }
    if (str_contains(json_encode($anonymous['payload']), 'client-acme-contracts')) {
        $errors[] = 'anonymous response disclosed the internal portal folder';
    }
    if (str_contains(json_encode($anonymous['payload']), 'legal-contact@client-acme.example')) {
        $errors[] = 'anonymous response disclosed the client email';
    }

    $authenticated = portalGetAuthRunCase('authenticated', $usersDir, $uploadDir, $metaDir, $sessionDir);
    if (($authenticated['status'] ?? 0) !== 200 || empty($authenticated['payload']['success'])) {
        $errors[] = 'authenticated non-admin portal user should retain access';
    }
    if (($authenticated['payload']['portal']['folder'] ?? '') !== 'confidential/client-acme-contracts') {
        $errors[] = 'authenticated portal response should retain the configured folder';
    }
} finally {
    portalGetAuthRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Portal get auth regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "PASS portal get auth regressions\n";
