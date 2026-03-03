<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Storage\SourceContext;
use InvalidArgumentException;
use Throwable;

/**
 * Thin API-facing orchestration for Gateway Shares + MCP admin endpoints.
 *
 * Keeps HTTP handlers light while preserving existing Pro runtime behavior.
 */
final class ProGatewayApiService
{
    /**
     * @param array<string,mixed> $payload
     * @return array{status:int,payload:array<string,mixed>}
     */
    private static function response(int $status, array $payload): array
    {
        return [
            'status' => $status,
            'payload' => $payload,
        ];
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listGateways(): array
    {
        $gateways = \ProGateways::getAdminList();
        $out = [];

        foreach ($gateways as $gateway) {
            if (!is_array($gateway)) {
                continue;
            }

            $id = trim((string)($gateway['id'] ?? ''));
            $snippets = $id !== '' ? \ProGateways::buildSnippets($id, false) : null;

            if (is_array($snippets)) {
                $gateway['startCommand'] = $snippets['startCommand'] ?? null;
                $gateway['dockerCompose'] = $snippets['dockerCompose'] ?? null;
                $gateway['systemd'] = $snippets['systemd'] ?? null;
                $gateway['snippets'] = [
                    'startCommand' => $snippets['startCommand'] ?? null,
                    'dockerCompose' => $snippets['dockerCompose'] ?? null,
                    'systemd' => $snippets['systemd'] ?? null,
                ];
            } else {
                $gateway['startCommand'] = $id !== ''
                    ? \ProGateways::buildStartCommand($id, false)
                    : null;
                $gateway['dockerCompose'] = null;
                $gateway['systemd'] = null;
                $gateway['snippets'] = [
                    'startCommand' => $gateway['startCommand'],
                    'dockerCompose' => null,
                    'systemd' => null,
                ];
            }

            $out[] = $gateway;
        }

        return self::response(200, [
            'ok' => true,
            'gateways' => $out,
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveGateway(array $body, string $actor): array
    {
        try {
            if (!class_exists(SourceContext::class, false)) {
                require_once PROJECT_ROOT . '/src/lib/SourceContext.php';
            }

            $gateway = $body['gateway'] ?? $body;
            if (!is_array($gateway)) {
                return self::response(400, ['ok' => false, 'error' => 'Missing gateway payload']);
            }

            $sourceId = trim((string)($gateway['sourceId'] ?? 'local'));
            if (SourceContext::sourcesEnabled()) {
                if ($sourceId !== '' && strcasecmp($sourceId, 'local') !== 0) {
                    $source = SourceContext::getSourceById($sourceId);
                    if (!$source) {
                        return self::response(400, ['ok' => false, 'error' => 'Invalid sourceId']);
                    }
                }
            } else {
                if ($sourceId !== '' && strcasecmp($sourceId, 'local') !== 0) {
                    return self::response(
                        400,
                        [
                            'ok' => false,
                            'error' => 'Sources are not enabled (only local sourceId is supported)',
                        ]
                    );
                }
            }

            $result = \ProGateways::upsertGateway($gateway, trim($actor));
            if (empty($result['ok'])) {
                return self::response(400, [
                    'ok' => false,
                    'error' => (string)($result['error'] ?? 'Failed to save gateway share'),
                ]);
            }

            $saved = is_array($result['gateway'] ?? null) ? $result['gateway'] : null;
            $id = is_array($saved) ? trim((string)($saved['id'] ?? '')) : '';
            $snippets = $id !== '' ? \ProGateways::buildSnippets($id, false) : null;
            $startCommand = is_array($snippets)
                ? ($snippets['startCommand'] ?? null)
                : ($id !== '' ? \ProGateways::buildStartCommand($id, false) : null);

            return self::response(200, [
                'ok' => true,
                'gateway' => $saved,
                'startCommand' => $startCommand,
                'dockerCompose' => is_array($snippets) ? ($snippets['dockerCompose'] ?? null) : null,
                'systemd' => is_array($snippets) ? ($snippets['systemd'] ?? null) : null,
                'snippets' => [
                    'startCommand' => $startCommand,
                    'dockerCompose' => is_array($snippets) ? ($snippets['dockerCompose'] ?? null) : null,
                    'systemd' => is_array($snippets) ? ($snippets['systemd'] ?? null) : null,
                ],
            ]);
        } catch (InvalidArgumentException $e) {
            return self::response(400, [
                'ok' => false,
                'error' => $e->getMessage() !== '' ? $e->getMessage() : 'Invalid gateway payload',
            ]);
        } catch (Throwable $e) {
            error_log('ProGatewayApiService::saveGateway error: ' . $e->getMessage());
            return self::response(500, [
                'ok' => false,
                'error' => 'Failed to save gateway share',
            ]);
        }
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function deleteGateway(array $body): array
    {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        if ($id === '') {
            return self::response(400, ['ok' => false, 'error' => 'Missing gateway id']);
        }

        $ok = \ProGateways::deleteGateway($id);
        if (!$ok) {
            return self::response(500, ['ok' => false, 'error' => 'Failed to delete gateway share']);
        }

        return self::response(200, ['ok' => true]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function testGateway(array $body): array
    {
        try {
            if (!class_exists(GatewayTestService::class, false)) {
                require_once PROJECT_ROOT . '/src/FileRise/Domain/GatewayTestService.php';
            }

            $id = (string)($body['id'] ?? '');
            $includeSecrets = !empty($body['includeSecrets']);
            $result = GatewayTestService::run($id, $includeSecrets);
            return self::response(200, $result);
        } catch (Throwable $e) {
            $status = (int)$e->getCode();
            if ($status >= 400 && $status <= 599) {
                return self::response($status, [
                    'ok' => false,
                    'error' => $e->getMessage(),
                ]);
            }
            throw $e;
        }
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function queueGatewayCleanupJob(array $body, string $actor): array
    {
        $result = \ProAutomation::enqueueGatewayCleanupJob($body, $actor);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function queueMcpAutotagJob(array $body, string $actor): array
    {
        $result = \ProAutomation::enqueueMcpAutotagJob($body, $actor);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function managedAction(array $body): array
    {
        $action = strtolower(trim((string)($body['action'] ?? '')));
        $gatewayId = strtolower(trim((string)($body['id'] ?? '')));
        $allowPublicBind = !empty($body['allowPublicBind']);

        if ($action === '') {
            return self::response(400, ['ok' => false, 'error' => 'Missing action']);
        }
        if ($gatewayId === '' && $action !== 'list') {
            return self::response(400, ['ok' => false, 'error' => 'Missing gateway id']);
        }

        if ($action === 'start') {
            $result = \ProGatewayManaged::startGateway($gatewayId, $allowPublicBind);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'stop') {
            $result = \ProGatewayManaged::stopGateway($gatewayId);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'restart') {
            $result = \ProGatewayManaged::restartGateway($gatewayId, $allowPublicBind);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'delete_runtime' || $action === 'delete') {
            $result = \ProGatewayManaged::deleteGatewayRuntime($gatewayId);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'set_autostart' || $action === 'autostart') {
            $enabled = !empty($body['enabled']);
            $result = \ProGatewayManaged::setGatewayAutostart($gatewayId, $enabled);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'logs' || $action === 'tail_log') {
            $maxBytes = isset($body['maxBytes']) ? (int)$body['maxBytes'] : 32768;
            $result = \ProGatewayManaged::tailGatewayLog($gatewayId, $maxBytes);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }

        return self::response(400, ['ok' => false, 'error' => 'Unsupported action']);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function managedStatus(?string $gatewayId): array
    {
        \ProGatewayManaged::maybeStartAutostartGateways();

        $id = strtolower(trim((string)$gatewayId));
        if ($id !== '') {
            $result = \ProGatewayManaged::getGatewayStatus($id);
            return self::response(!empty($result['ok']) ? 200 : 404, $result);
        }

        $result = \ProGatewayManaged::listGatewayStatuses();
        return self::response(!empty($result['ok']) ? 200 : 500, $result);
    }

    /**
     * @param array<string,mixed> $files
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function uploadManagedRclone(array $files): array
    {
        $upload = $files['rcloneBinary'] ?? null;
        if (!is_array($upload)) {
            return self::response(400, ['ok' => false, 'error' => 'Missing uploaded file']);
        }
        $result = \ProGatewayManaged::installRcloneUpload($upload);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function installManagedRclone(array $body): array
    {
        $arch = isset($body['arch']) ? (string)$body['arch'] : '';
        $result = \ProGatewayManaged::installRcloneFromDownload($arch);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function checkManagedRcloneUpdate(array $body): array
    {
        $force = !array_key_exists('force', $body) || !empty($body['force']);
        $result = \ProGatewayManaged::checkRcloneUpdate($force);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function mcpServiceAction(array $body): array
    {
        $action = strtolower(trim((string)($body['action'] ?? '')));
        $allowPublicBind = !empty($body['allowPublicBind']);

        if ($action === '') {
            return self::response(400, ['ok' => false, 'error' => 'Missing action']);
        }

        if ($action === 'start') {
            $result = \ProMcpRuntime::startService($allowPublicBind);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'stop') {
            $result = \ProMcpRuntime::stopService();
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'restart') {
            $result = \ProMcpRuntime::restartService($allowPublicBind);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'logs' || $action === 'tail_log') {
            $maxBytes = isset($body['maxBytes']) ? (int)$body['maxBytes'] : 32768;
            $result = \ProMcpRuntime::tailServiceLog($maxBytes);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }
        if ($action === 'save_config') {
            $config = [];
            foreach (['listenAddr', 'port', 'autostart', 'allowPublicBind'] as $key) {
                if (array_key_exists($key, $body)) {
                    $config[$key] = $body[$key];
                }
            }
            $result = \ProMcpRuntime::saveServiceConfig($config);
            return self::response(!empty($result['ok']) ? 200 : 400, $result);
        }

        return self::response(400, ['ok' => false, 'error' => 'Unsupported action']);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function mcpServiceStatus(): array
    {
        \ProMcpRuntime::maybeStartAutostartService();
        $result = \ProMcpRuntime::serviceStatus();
        return self::response(!empty($result['ok']) ? 200 : 500, $result);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function mcpListUsers(): array
    {
        $result = \ProMcpRuntime::listUsers();
        return self::response(!empty($result['ok']) ? 200 : 500, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function mcpSaveUser(array $body): array
    {
        $payload = isset($body['user']) && is_array($body['user']) ? $body['user'] : $body;
        if (!is_array($payload)) {
            return self::response(400, ['ok' => false, 'error' => 'Missing MCP user payload']);
        }

        $result = \ProMcpRuntime::upsertUser($payload);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function mcpDeleteUser(array $body): array
    {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') {
            return self::response(400, ['ok' => false, 'error' => 'Missing MCP user id']);
        }

        $result = \ProMcpRuntime::deleteUser($id);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }
}
