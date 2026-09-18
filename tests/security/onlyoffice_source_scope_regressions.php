<?php

declare(strict_types=1);

// Keep the callback's input and Document Server transport deterministic and offline.
namespace FileRise\Http\Controllers {
    function file_get_contents($filename, ...$args)
    {
        if ($filename === 'php://input') {
            return $GLOBALS['ooSourceCallbackBody'] ?? '';
        }
        if ($filename === 'https://docs.example.test/saved.docx') {
            $GLOBALS['ooSourceFetchCount']++;
            return 'saved-document';
        }
        return \file_get_contents($filename, ...$args);
    }

    function function_exists(string $name): bool
    {
        // Exercise the controller's stream transport rather than making a cURL request.
        return $name !== 'curl_init' && \function_exists($name);
    }
}

namespace {
    use FileRise\Http\Controllers\OnlyOfficeController;
    use FileRise\Storage\SourceContext;

    $baseDir = dirname(__DIR__, 2);
    $tmp = sys_get_temp_dir() . '/fr-oo-source-' . bin2hex(random_bytes(6));

    function ooSourceCheck(bool $condition, string $message): void
    {
        if (!$condition) {
            throw new RuntimeException($message);
        }
    }

    function ooSourceRemove(string $path): void
    {
        if (is_file($path) || is_link($path)) {
            unlink($path);
            return;
        }
        foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
            ooSourceRemove($path . '/' . $item);
        }
        rmdir($path);
    }

    function ooSourceAcl(array $read, array $edit): array
    {
        return ['owners' => ['admin'], 'read' => $read, 'edit' => $edit];
    }

    function ooSourceB64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    function ooSourceToken(array $payload): string
    {
        $data = (string)json_encode($payload);
        return ooSourceB64($data) . '.' . ooSourceB64(hash_hmac('sha256', $data, ONLYOFFICE_JWT_SECRET, true));
    }

    function ooSourceConfig(OnlyOfficeController $controller, string $active, array $query): array
    {
        SourceContext::setActiveId($active, false);
        $_GET = $query;
        http_response_code(200);
        ob_start();
        $controller->config();
        $body = (string)ob_get_clean();
        ooSourceCheck(SourceContext::getActiveId() === $active, 'Config did not restore the previous source');
        $decoded = json_decode($body, true);
        ooSourceCheck(is_array($decoded), 'Config returned invalid JSON');
        return [http_response_code(), $decoded];
    }

    foreach (['users/pro', 'metadata/sources/ext', 'sessions', 'uploads', 'ext'] as $dir) {
        mkdir($tmp . '/' . $dir, 0700, true);
    }
    try {
        foreach (['USERS' => 'users', 'UPLOAD' => 'uploads', 'META' => 'metadata'] as $key => $dir) {
            putenv('FR_TEST_' . $key . '_DIR=' . $tmp . '/' . $dir);
        }
        putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
        session_save_path($tmp . '/sessions');
        define('ONLYOFFICE_ENABLED', true);
        define('ONLYOFFICE_JWT_SECRET', 'onlyoffice-source-test-secret');
        define('ONLYOFFICE_DOCS_ORIGIN', 'https://docs.example.test');
        define('ONLYOFFICE_FILE_ORIGIN_FOR_DOCS', 'https://files.example.test');
        file_put_contents($tmp . '/users/users.txt', "bob:unused:0\nadmin:unused:1\n");
        file_put_contents($tmp . '/users/pro/sources.json', json_encode([
            'enabled' => true,
            'sources' => [
                ['id' => 'local', 'type' => 'local', 'enabled' => true, 'config' => ['path' => $tmp . '/uploads']],
                ['id' => 'ext', 'type' => 'local', 'enabled' => true, 'config' => ['path' => $tmp . '/ext']],
                ['id' => 'disabled', 'type' => 'local', 'enabled' => false, 'config' => ['path' => $tmp . '/ext']],
            ],
        ]));
        $localAcl = [
            'root' => ooSourceAcl([], []),
            'secret' => ooSourceAcl(['bob'], ['bob']),
            'view' => ooSourceAcl(['bob'], ['bob']),
            'edit' => ooSourceAcl(['bob'], []),
            'reverse' => ooSourceAcl([], []),
        ];
        $extAcl = [
            'root' => ooSourceAcl([], []),
            'secret' => ooSourceAcl([], []),
            'view' => ooSourceAcl(['bob'], []),
            'edit' => ooSourceAcl(['bob'], ['bob']),
            'reverse' => ooSourceAcl(['bob'], ['bob']),
        ];
        file_put_contents($tmp . '/metadata/folder_acl.json', json_encode(['folders' => $localAcl]));
        file_put_contents($tmp . '/metadata/sources/ext/folder_acl.json', json_encode(['folders' => $extAcl]));
        foreach (['uploads', 'ext'] as $source) {
            foreach (['secret', 'view', 'edit', 'reverse'] as $folder) {
                mkdir($tmp . '/' . $source . '/' . $folder);
                file_put_contents($tmp . '/' . $source . '/' . $folder . '/file.docx', $source . '-' . $folder);
            }
        }
        require $baseDir . '/config/config.php';
        require_once $baseDir . '/src/FileRise/Http/Controllers/OnlyOfficeController.php';
        $_SESSION = ['authenticated' => true, 'username' => 'bob', 'isAdmin' => false];
        $controller = new OnlyOfficeController();
        $query = ['folder' => 'secret', 'file' => 'file.docx', 'sourceId' => 'ext'];
        [$code, $body] = ooSourceConfig($controller, 'local', $query);
        ooSourceCheck($code === 403 && $body === ['error' => 'Forbidden'], 'Cross-source read returned a capability');
        $query['file'] = 'missing.docx';
        [$code] = ooSourceConfig($controller, 'local', $query);
        ooSourceCheck($code === 403, 'Unauthorized nonexistent file must fail authorization first');
        $query['file'] = 'file.docx';

        foreach (['view' => false, 'edit' => true, 'reverse' => true] as $folder => $editable) {
            $query['folder'] = $folder;
            [$code, $body] = ooSourceConfig($controller, 'local', $query);
            ooSourceCheck($code === 200, 'Authorized target source config was denied: ' . $folder);
            ooSourceCheck($body['document']['permissions']['edit'] === $editable, 'Edit permission used the wrong source');
            ooSourceCheck(isset($body['editorConfig']['callbackUrl']) === $editable, 'Save capability used the wrong source');
            parse_str((string)parse_url($body['document']['url'], PHP_URL_QUERY), $tokenQuery);
            $session = $_SESSION;
            $_SESSION = [];
            $_GET = $tokenQuery;
            SourceContext::setActiveId('local', false);
            http_response_code(200);
            ob_start();
            $controller->signedDownload();
            $download = (string)ob_get_clean();
            ooSourceCheck(http_response_code() === 200 && $download === 'ext-' . $folder, 'Authorized sessionless download regressed');
            ooSourceCheck(SourceContext::getActiveId() === 'local', 'Signed download did not restore source');
            $_SESSION = $session;
        }
        // Selecting local must not use ext's grants or bypass a denial via the legacy fallback.
        $query = ['folder' => 'reverse', 'file' => 'file.docx', 'sourceId' => 'local'];
        [$code] = ooSourceConfig($controller, 'ext', $query);
        ooSourceCheck($code === 403, 'Cross-source local request bypassed authorization');
        unset($query['sourceId']);
        [$code, $body] = ooSourceConfig($controller, 'ext', $query);
        ooSourceCheck($code === 200 && $body['document']['permissions']['edit'], 'Implicit active source regressed');
        $query['sourceId'] = 'disabled';
        [$code] = ooSourceConfig($controller, 'local', $query);
        ooSourceCheck($code === 400, 'Non-admin accessed disabled source');
        $query['sourceId'] = '../ext';
        [$code] = ooSourceConfig($controller, 'local', $query);
        ooSourceCheck($code === 400, 'Invalid source was accepted');
        $query = ['folder' => 'secret', 'file' => 'file.docx', 'sourceId' => 'ext'];
        $_SESSION = ['authenticated' => true, 'username' => 'admin', 'isAdmin' => true];
        [$code, $body] = ooSourceConfig($controller, 'local', $query);
        ooSourceCheck($code === 200 && $body['document']['permissions']['edit'], 'Administrator access regressed');
        $_SESSION = [];
        [$code] = ooSourceConfig($controller, 'local', $query);
        ooSourceCheck($code === 401, 'Unauthenticated config was accepted');

        // Simulate valid server-signed callbacks, including capabilities issued before ACL changes.
        $GLOBALS['ooSourceFetchCount'] = 0;
        foreach (['secret' => false, 'view' => false, 'edit' => true, 'reverse' => true] as $folder => $allowed) {
            $_SESSION = [];
            SourceContext::setActiveId('local', false);
            $_GET = ['tok' => ooSourceToken([
                'f' => $folder, 'n' => 'file.docx', 'u' => 'bob', 'sid' => 'ext',
                'edit' => true, 'op' => 'onlyoffice_save', 'exp' => time() + 600,
            ])];
            $payload = ['status' => 2, 'url' => 'https://docs.example.test/saved.docx'];
            $header = ooSourceB64((string)json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
            $jwtBody = ooSourceB64((string)json_encode($payload));
            $payload['token'] = $header . '.' . $jwtBody . '.'
                . ooSourceB64(hash_hmac('sha256', $header . '.' . $jwtBody, ONLYOFFICE_JWT_SECRET, true));
            $GLOBALS['ooSourceCallbackBody'] = json_encode($payload);
            $fetchBefore = $GLOBALS['ooSourceFetchCount'];
            ob_start();
            $controller->callback();
            $response = json_decode((string)ob_get_clean(), true);
            ooSourceCheck(($response['error'] ?? -1) === ($allowed ? 0 : 6), 'Callback used wrong source permission: ' . $folder);
            ooSourceCheck($GLOBALS['ooSourceFetchCount'] === $fetchBefore + ($allowed ? 1 : 0), 'Denied callback fetched content');
            ooSourceCheck(file_get_contents($tmp . '/ext/' . $folder . '/file.docx') === ($allowed ? 'saved-document' : 'ext-' . $folder), 'Incorrect target write');
            ooSourceCheck(file_get_contents($tmp . '/uploads/' . $folder . '/file.docx') === 'uploads-' . $folder, 'Callback changed active-source file');
            ooSourceCheck(SourceContext::getActiveId() === 'local', 'Callback did not restore source');
        }
        echo "ONLYOFFICE source scope regressions passed\n";
    } finally {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_abort();
        }
        ooSourceRemove($tmp);
    }
}
