<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_login_method_policy_' . bin2hex(random_bytes(4));

function loginPolicyFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function loginPolicyRmTree(string $dir): void
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
        loginPolicyRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

function loginPolicyCaseScript(string $baseDir, string $caseDir, string $body): string
{
    $baseExport = var_export($baseDir, true);
    $caseExport = var_export($caseDir, true);
    return <<<PHP
<?php
declare(strict_types=1);

\$baseDir = {$baseExport};
\$caseDir = {$caseExport};
\$uploadDir = \$caseDir . '/uploads/';
\$usersDir = \$caseDir . '/users/';
\$metaDir = \$caseDir . '/metadata/';
\$sessionDir = \$caseDir . '/sessions/';

@mkdir(\$uploadDir, 0775, true);
@mkdir(\$usersDir, 0700, true);
@mkdir(\$metaDir, 0775, true);
@mkdir(\$sessionDir, 0700, true);
session_save_path(\$sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . \$uploadDir);
putenv('FR_TEST_USERS_DIR=' . \$usersDir);
putenv('FR_TEST_META_DIR=' . \$metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

\$config = [
    'loginOptions' => [
        'disableFormLogin' => true,
        'disableBasicAuth' => true,
        'disableOIDCLogin' => true,
        'authBypass' => false,
        'authHeaderName' => 'X-Remote-User',
    ],
    'oidc' => [
        'providerUrl' => 'https://oidc.example.test',
        'clientId' => 'client',
        'clientSecret' => 'secret',
        'redirectUri' => 'https://filerise.example.test/api/auth/auth.php?oidc=callback',
        'publicClient' => false,
    ],
];
file_put_contents(\$usersDir . 'adminConfig.json', json_encode(\$config, JSON_PRETTY_PRINT), LOCK_EX);

\$_SERVER['HTTP_HOST'] = 'localhost';
\$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
\$_SERVER['HTTPS'] = 'off';

register_shutdown_function(static function (): void {
    echo "\\n__HTTP_STATUS__" . http_response_code() . "\\n";
});

require_once \$baseDir . '/config/config.php';
require_once \$baseDir . '/src/FileRise/Http/Controllers/AuthController.php';

\$controller = new \\FileRise\\Http\\Controllers\\AuthController();
{$body}
PHP;
}

function loginPolicyRunCase(string $baseDir, string $tmpBase, string $name, string $body): array
{
    $caseDir = $tmpBase . '/' . $name;
    @mkdir($caseDir, 0775, true);
    $script = $caseDir . '/case.php';
    file_put_contents($script, loginPolicyCaseScript($baseDir, $caseDir, $body), LOCK_EX);

    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script);
    $lines = [];
    $exitCode = 0;
    exec($cmd, $lines, $exitCode);
    $output = implode("\n", $lines);
    $status = 0;
    if (preg_match('/__HTTP_STATUS__(\d+)/', $output, $m)) {
        $status = (int)$m[1];
    }

    return [
        'exit' => $exitCode,
        'status' => $status,
        'output' => $output,
    ];
}

$errors = [];

try {
    $form = loginPolicyRunCase(
        $baseDir,
        $tmpBase,
        'form',
        <<<'PHP'
$_SERVER['REQUEST_METHOD'] = 'POST';
$controller->auth();
PHP
    );
    loginPolicyFailIf($form['status'] !== 403, 'form login: disabled method should return HTTP 403', $errors);
    loginPolicyFailIf(!str_contains($form['output'], 'Form login is disabled'), 'form login: disabled method message missing', $errors);

    $basic = loginPolicyRunCase(
        $baseDir,
        $tmpBase,
        'basic',
        <<<'PHP'
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['PHP_AUTH_USER'] = 'alice';
$_SERVER['PHP_AUTH_PW'] = 'Password123!';
$controller->loginBasic();
PHP
    );
    loginPolicyFailIf($basic['status'] !== 403, 'basic auth: disabled method should return HTTP 403', $errors);
    loginPolicyFailIf(!str_contains($basic['output'], 'Basic authentication is disabled'), 'basic auth: disabled method message missing', $errors);

    $oidc = loginPolicyRunCase(
        $baseDir,
        $tmpBase,
        'oidc',
        <<<'PHP'
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/auth/auth.php?oidc=login';
$_GET['oidc'] = 'login';
$controller->auth();
PHP
    );
    loginPolicyFailIf($oidc['status'] !== 403, 'OIDC login: disabled method should return HTTP 403', $errors);
    loginPolicyFailIf(!str_contains($oidc['output'], 'OIDC login is disabled'), 'OIDC login: disabled method message missing', $errors);
} finally {
    loginPolicyRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Login method policy regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Login method policy regressions passed\n";
