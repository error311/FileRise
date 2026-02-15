<?php
// public/api/pro/gateways/test.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';
require_once PROJECT_ROOT . '/src/lib/FS.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();
    \FileRise\Http\Controllers\AdminController::requireAdmin();
    \FileRise\Http\Controllers\AdminController::requireCsrf();

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProGateways')) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Pro is not active']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
        exit;
    }

    $id = strtolower(trim((string)($body['id'] ?? '')));
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing gateway id']);
        exit;
    }

    $stored = ProGateways::getStoredGateway($id);
    if (!$stored) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Gateway share not found']);
        exit;
    }

    $warnings = [];
    $errors = [];

    $type = strtolower(trim((string)($stored['gatewayType'] ?? 'sftp')));
    if (!in_array($type, ['sftp', 's3', 'mcp'], true)) {
        $errors[] = 'Invalid gatewayType.';
    }

    $listenAddr = trim((string)($stored['listenAddr'] ?? '127.0.0.1'));
    $port = (int)($stored['port'] ?? 0);
    if ($port < 1024 || $port > 65535) {
        $errors[] = 'Port must be 1024-65535.';
    }
    if ($listenAddr === '' || preg_match('/[\s\'"]/', $listenAddr)) {
        $errors[] = 'Invalid listenAddr.';
    }

    // --- rclone presence (best-effort) ---
    $rclonePath = '';
    if (function_exists('shell_exec')) {
        $out = @shell_exec('command -v rclone 2>/dev/null');
        $rclonePath = is_string($out) ? trim($out) : '';
    }
    if ($rclonePath === '') {
        foreach (['/usr/bin/rclone', '/usr/local/bin/rclone', '/opt/homebrew/bin/rclone'] as $p) {
            if (is_file($p) && is_executable($p)) {
                $rclonePath = $p;
                break;
            }
        }
    }
    if ($rclonePath === '') {
        $warnings[] = 'rclone not found on PATH (cannot verify).';
    }

    // --- port bind test (warn only; some environments restrict binding) ---
    if (!$errors && $port >= 1024 && $port <= 65535) {
        $uri = 'tcp://' . $listenAddr . ':' . $port;
        $errno = 0;
        $errstr = '';
        $sock = @stream_socket_server($uri, $errno, $errstr);
        if ($sock === false) {
            $warnings[] = 'Port bind failed (port may be in use or address is not bindable).';
        } else {
            @fclose($sock);
        }
    }

    // --- root boundary checks (local sources only) ---
    $sourceId = trim((string)($stored['sourceId'] ?? 'local'));
    $rootPath = trim((string)($stored['rootPath'] ?? 'root'));
    $src = null;
    if (class_exists('SourceContext') && SourceContext::sourcesEnabled() && $sourceId !== '' && strcasecmp($sourceId, 'local') !== 0) {
        $src = SourceContext::getSourceById($sourceId);
        if (!$src) {
            $errors[] = 'Invalid sourceId.';
        }
    } else {
        // Local-only mode (or local id)
        $src = [
            'id' => 'local',
            'type' => 'local',
            'config' => ['path' => (string)UPLOAD_DIR],
        ];
    }

    if ($src && is_array($src)) {
        $srcType = strtolower((string)($src['type'] ?? ''));
        if ($srcType === 'local') {
            $cfg = isset($src['config']) && is_array($src['config']) ? $src['config'] : [];
            $base = trim((string)($cfg['path'] ?? $cfg['root'] ?? UPLOAD_DIR));
            if ($base === '') $base = (string)UPLOAD_DIR;
            $base = rtrim($base, "/\\");
            if (!is_dir($base)) {
                $warnings[] = 'Local source path not found.';
            } elseif (!is_readable($base)) {
                $warnings[] = 'Local source path not readable.';
            } else {
                $baseReal = realpath($base);
                if ($baseReal === false || $baseReal === '') {
                    $warnings[] = 'Local source path realpath() failed.';
                } else {
                    $rel = str_replace('\\', '/', $rootPath);
                    $rel = trim($rel, '/');
                    if ($rel === '' || strcasecmp($rel, 'root') === 0) {
                        $target = $baseReal;
                    } else {
                        $target = $baseReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
                    }
                    $safe = FS::safeReal($baseReal, $target);
                    if ($safe === null) {
                        $errors[] = 'Root boundary check failed (path escapes base).';
                    }
                }
            }
        } else {
            $warnings[] = 'Non-local sources: boundary enforcement is not implemented for rclone command generation in v1.';
        }
    }

    // --- credential presence checks ---
    if ($type === 'sftp') {
        $sftp = isset($stored['sftp']) && is_array($stored['sftp']) ? $stored['sftp'] : [];
        $user = trim((string)($sftp['user'] ?? ''));
        if ($user === '') {
            $errors[] = 'SFTP user is missing.';
        }
        $hasPass = !empty($sftp['passEnc']);
        $hasKeys = trim((string)($sftp['authorizedKeys'] ?? '')) !== '';
        if (!$hasPass && !$hasKeys) {
            $warnings[] = 'SFTP has no password or authorized keys configured.';
        }
    } elseif ($type === 's3') {
        $s3 = isset($stored['s3']) && is_array($stored['s3']) ? $stored['s3'] : [];
        $keys = isset($s3['keys']) && is_array($s3['keys']) ? $s3['keys'] : [];
        if (!$keys) {
            $errors[] = 'S3 gateway has no keypairs configured.';
        } else {
            $k0 = $keys[0] ?? null;
            if (!is_array($k0) || empty($k0['accessKeyEnc']) || empty($k0['secretKeyEnc'])) {
                $errors[] = 'S3 keypair is incomplete.';
            }
        }
    } elseif ($type === 'mcp') {
        $mcp = isset($stored['mcp']) && is_array($stored['mcp']) ? $stored['mcp'] : [];
        if (empty($mcp['tokenEnc'])) {
            $warnings[] = 'MCP token is missing.';
        }
        $warnings[] = 'MCP gateway server is not implemented in v1 bundle.';
    }

    $includeSecrets = !empty($body['includeSecrets']);
    $snippets = ProGateways::buildSnippets($id, false);
    $snippetsSecrets = $includeSecrets ? ProGateways::buildSnippets($id, true) : null;
    $cmd = is_array($snippets) ? ($snippets['startCommand'] ?? null) : ProGateways::buildStartCommand($id, false);
    $cmdSecrets = is_array($snippetsSecrets) ? ($snippetsSecrets['startCommand'] ?? null) : ($includeSecrets ? ProGateways::buildStartCommand($id, true) : null);

    echo json_encode([
        'ok' => empty($errors),
        'errors' => $errors,
        'warnings' => $warnings,
        'startCommand' => $cmd,
        'startCommandWithSecrets' => $cmdSecrets,
        'dockerCompose' => is_array($snippets) ? ($snippets['dockerCompose'] ?? null) : null,
        'systemd' => is_array($snippets) ? ($snippets['systemd'] ?? null) : null,
        'dockerComposeWithSecrets' => is_array($snippetsSecrets) ? ($snippetsSecrets['dockerCompose'] ?? null) : null,
        'systemdWithSecrets' => is_array($snippetsSecrets) ? ($snippetsSecrets['systemd'] ?? null) : null,
        'snippets' => [
            'startCommand' => $cmd,
            'dockerCompose' => is_array($snippets) ? ($snippets['dockerCompose'] ?? null) : null,
            'systemd' => is_array($snippets) ? ($snippets['systemd'] ?? null) : null,
        ],
        'snippetsWithSecrets' => [
            'startCommand' => $cmdSecrets,
            'dockerCompose' => is_array($snippetsSecrets) ? ($snippetsSecrets['dockerCompose'] ?? null) : null,
            'systemd' => is_array($snippetsSecrets) ? ($snippetsSecrets['systemd'] ?? null) : null,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error testing gateway share'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
