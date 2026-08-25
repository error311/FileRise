<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_onlyoffice_config_auth_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function onlyOfficeConfigAuthFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function onlyOfficeConfigAuthRmTree(string $dir): void
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
        onlyOfficeConfigAuthRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

foreach ([$uploadDir, $usersDir, $metaDir, $sessionDir] as $dir) {
    @mkdir($dir, 0775, true);
}
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

define('ONLYOFFICE_ENABLED', true);
define('ONLYOFFICE_JWT_SECRET', 'onlyoffice-config-auth-regression-secret');
define('ONLYOFFICE_DOCS_ORIGIN', 'https://docs.example.test');
define('ONLYOFFICE_PUBLIC_ORIGIN', 'https://files.example.test');
define('ONLYOFFICE_FILE_ORIGIN_FOR_DOCS', 'https://files.example.test');

file_put_contents(
    $usersDir . 'users.txt',
    'anonymous:$2y$10$unused.regression.password.hash:0' . PHP_EOL,
    LOCK_EX
);
file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode([
        'folders' => [
            'root' => [
                'owners' => [],
                'read' => ['anonymous'],
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
                'explicit' => ['anonymous' => true],
            ],
        ],
        'groups' => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);
file_put_contents($uploadDir . 'onlyoffice-secret.txt', 'ONLYOFFICE AUTH BOUNDARY', LOCK_EX);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Http/Controllers/OnlyOfficeController.php';

$errors = [];
$controller = new \FileRise\Http\Controllers\OnlyOfficeController();

try {
    unset($_SESSION['authenticated'], $_SESSION['username'], $_SESSION['isAdmin']);
    $_GET = ['folder' => 'root', 'file' => 'onlyoffice-secret.txt'];
    http_response_code(200);

    ob_start();
    $controller->config();
    $anonymousBody = (string)ob_get_clean();
    $anonymousPayload = json_decode($anonymousBody, true);

    onlyOfficeConfigAuthFailIf(
        http_response_code() !== 401,
        'Unauthenticated ONLYOFFICE config requests should return HTTP 401',
        $errors
    );
    onlyOfficeConfigAuthFailIf(
        !is_array($anonymousPayload) || ($anonymousPayload['error'] ?? '') !== 'Unauthorized',
        'Unauthenticated ONLYOFFICE config requests should return Unauthorized JSON',
        $errors
    );
    onlyOfficeConfigAuthFailIf(
        str_contains($anonymousBody, 'signed-download.php') || str_contains($anonymousBody, 'anonymous'),
        'Unauthenticated requests must not receive a signed URL or fallback identity',
        $errors
    );

    $_SESSION['authenticated'] = true;
    $_SESSION['username'] = 'anonymous';
    $_SESSION['isAdmin'] = false;
    http_response_code(200);

    ob_start();
    $controller->config();
    $authenticatedBody = (string)ob_get_clean();
    $authenticatedPayload = json_decode($authenticatedBody, true);

    onlyOfficeConfigAuthFailIf(
        http_response_code() !== 200,
        'An authenticated permitted user should retain ONLYOFFICE config access',
        $errors
    );
    onlyOfficeConfigAuthFailIf(
        ($authenticatedPayload['editorConfig']['user']['id'] ?? '') !== 'anonymous',
        'The authenticated user identity should be retained in the editor config',
        $errors
    );

    $signedUrl = (string)($authenticatedPayload['document']['url'] ?? '');
    parse_str((string)parse_url($signedUrl, PHP_URL_QUERY), $signedQuery);
    onlyOfficeConfigAuthFailIf(
        empty($signedQuery['tok']),
        'An authenticated permitted user should receive a signed download capability',
        $errors
    );

    unset($_SESSION['authenticated'], $_SESSION['username'], $_SESSION['isAdmin']);
    $_GET = ['tok' => (string)($signedQuery['tok'] ?? '')];
    http_response_code(200);

    ob_start();
    $controller->signedDownload();
    $downloadBody = (string)ob_get_clean();

    onlyOfficeConfigAuthFailIf(
        http_response_code() !== 200 || $downloadBody !== 'ONLYOFFICE AUTH BOUNDARY',
        'The Document Server should retain sessionless access to a valid signed download URL',
        $errors
    );
} finally {
    onlyOfficeConfigAuthRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "ONLYOFFICE config authentication regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "ONLYOFFICE config authentication regressions passed\n";
