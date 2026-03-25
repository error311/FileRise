<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Storage\SourceContext;
use FileRise\Support\FS;
use FileRise\Support\WorkerLauncher;
use RuntimeException;

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';
require_once PROJECT_ROOT . '/src/lib/FS.php';

final class GatewayTestService
{
    /**
     * @return array<string,mixed>
     */
    public static function run(string $id, bool $includeSecrets = false): array
    {
        $id = strtolower(trim($id));
        if ($id === '') {
            throw new RuntimeException('Missing gateway id', 400);
        }

        if (!class_exists('ProGateways')) {
            throw new RuntimeException('Pro is not active', 403);
        }

        $stored = \ProGateways::getStoredGateway($id);
        if (!$stored) {
            throw new RuntimeException('Gateway share not found', 404);
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

        $rclonePath = self::findRclonePath();
        if ($rclonePath === '') {
            $warnings[] = 'rclone not found on PATH (cannot verify).';
        }

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

        self::runRootBoundaryChecks($stored, $errors, $warnings);
        self::runCredentialChecks($type, $stored, $errors, $warnings);

        $snippets = \ProGateways::buildSnippets($id, false);
        $snippetsSecrets = $includeSecrets ? \ProGateways::buildSnippets($id, true) : null;
        $cmd = is_array($snippets)
            ? ($snippets['startCommand'] ?? null)
            : \ProGateways::buildStartCommand($id, false);
        $cmdSecrets = is_array($snippetsSecrets)
            ? ($snippetsSecrets['startCommand'] ?? null)
            : ($includeSecrets ? \ProGateways::buildStartCommand($id, true) : null);

        return [
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
        ];
    }

    private static function findRclonePath(): string
    {
        $rclonePath = '';
        $out = WorkerLauncher::captureCommand('command -v rclone 2>/dev/null');
        if (is_string($out)) {
            $rclonePath = is_string($out) ? trim($out) : '';
        }

        if ($rclonePath === '') {
            foreach (['/usr/bin/rclone', '/usr/local/bin/rclone', '/opt/homebrew/bin/rclone'] as $p) {
                if (is_file($p) && is_executable($p)) {
                    return $p;
                }
            }
        }

        return $rclonePath;
    }

    /**
     * @param array<string,mixed> $stored
     * @param array<int,string> $errors
     * @param array<int,string> $warnings
     */
    private static function runRootBoundaryChecks(array $stored, array &$errors, array &$warnings): void
    {
        $sourceId = trim((string)($stored['sourceId'] ?? 'local'));
        $rootPath = trim((string)($stored['rootPath'] ?? 'root'));

        $src = null;
        if (
            class_exists('SourceContext')
            && SourceContext::sourcesEnabled()
            && $sourceId !== ''
            && strcasecmp($sourceId, 'local') !== 0
        ) {
            $src = SourceContext::getSourceById($sourceId);
            if (!$src) {
                $errors[] = 'Invalid sourceId.';
            }
        } else {
            $src = [
                'id' => 'local',
                'type' => 'local',
                'config' => ['path' => (string)UPLOAD_DIR],
            ];
        }

        if (!$src || !is_array($src)) {
            return;
        }

        $srcType = strtolower((string)($src['type'] ?? ''));
        if ($srcType !== 'local') {
            $warnings[] = 'Non-local sources: boundary enforcement is not implemented for rclone command generation in v1.';
            return;
        }

        $cfg = isset($src['config']) && is_array($src['config']) ? $src['config'] : [];
        $base = trim((string)($cfg['path'] ?? $cfg['root'] ?? UPLOAD_DIR));
        if ($base === '') {
            $base = (string)UPLOAD_DIR;
        }

        $base = rtrim($base, "/\\");
        if (!is_dir($base)) {
            $warnings[] = 'Local source path not found.';
            return;
        }
        if (!is_readable($base)) {
            $warnings[] = 'Local source path not readable.';
            return;
        }

        $baseReal = realpath($base);
        if ($baseReal === false || $baseReal === '') {
            $warnings[] = 'Local source path realpath() failed.';
            return;
        }

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

    /**
     * @param array<string,mixed> $stored
     * @param array<int,string> $errors
     * @param array<int,string> $warnings
     */
    private static function runCredentialChecks(string $type, array $stored, array &$errors, array &$warnings): void
    {
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
            return;
        }

        if ($type === 's3') {
            $s3 = isset($stored['s3']) && is_array($stored['s3']) ? $stored['s3'] : [];
            $keys = isset($s3['keys']) && is_array($s3['keys']) ? $s3['keys'] : [];
            if (!$keys) {
                $errors[] = 'S3 gateway has no keypairs configured.';
                return;
            }

            $k0 = $keys[0] ?? null;
            if (!is_array($k0) || empty($k0['accessKeyEnc']) || empty($k0['secretKeyEnc'])) {
                $errors[] = 'S3 keypair is incomplete.';
            }
            return;
        }

        if ($type === 'mcp') {
            $mcp = isset($stored['mcp']) && is_array($stored['mcp']) ? $stored['mcp'] : [];
            if (empty($mcp['tokenEnc'])) {
                $warnings[] = 'MCP token is missing.';
            }
            $warnings[] = 'MCP gateway server is not implemented in v1 bundle.';
        }
    }
}
