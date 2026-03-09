<?php

declare(strict_types=1);

namespace FileRise\Domain;

/**
 * Thin API-facing orchestration for Pro automation admin endpoints.
 */
final class ProAutomationApiService
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
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listJobs(array $query): array
    {
        $filters = [
            'status' => isset($query['status']) ? (string)$query['status'] : '',
            'type' => isset($query['type']) ? (string)$query['type'] : '',
            'limit' => isset($query['limit']) ? (int)$query['limit'] : 100,
            'search' => isset($query['search']) ? (string)$query['search'] : '',
            'triggerRuleId' => isset($query['triggerRuleId']) ? (int)$query['triggerRuleId'] : 0,
            'watchedRuleOnly' => !empty($query['watchedRuleOnly']),
        ];

        $result = \ProAutomation::listJobs($filters);
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function getJob(array $query): array
    {
        $id = isset($query['id']) ? (int)$query['id'] : 0;
        $result = \ProAutomation::getJobDetail($id);
        return self::response(!empty($result['ok']) ? 200 : 404, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function cancelJob(array $body): array
    {
        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $result = \ProAutomation::cancelJob($id);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function retryJob(array $body): array
    {
        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $result = \ProAutomation::retryJob($id);
        if (!empty($result['ok']) && method_exists('\ProAutomation', 'ensureWorkerRunning')) {
            $result['worker'] = \ProAutomation::ensureWorkerRunning('api.jobs.retry');
        }

        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function cleanupHistory(array $body): array
    {
        $maxAgeDays = isset($body['maxAgeDays'])
            ? (int)$body['maxAgeDays']
            : (isset($body['max_age_days']) ? (int)$body['max_age_days'] : 30);

        if ($maxAgeDays <= 0) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid retention period']);
        }

        if (!method_exists('\ProAutomation', 'cleanupHistory')) {
            return self::response(500, [
                'ok' => false,
                'error' => 'Automation history cleanup is not supported',
            ]);
        }

        $result = \ProAutomation::cleanupHistory($maxAgeDays * 86400);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function metrics(): array
    {
        $result = \ProAutomation::metrics();
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function queueScan(array $body, string $actor): array
    {
        $payload = [
            'sourceId' => (string)($body['sourceId'] ?? $body['source_id'] ?? 'local'),
            'folder' => (string)($body['folder'] ?? 'root'),
        ];

        if (isset($body['maxFiles'])) {
            $payload['maxFiles'] = (int)$body['maxFiles'];
        }
        if (isset($body['maxTotalBytes'])) {
            $payload['maxTotalBytes'] = (int)$body['maxTotalBytes'];
        }
        if (isset($body['maxFileBytes'])) {
            $payload['maxFileBytes'] = (int)$body['maxFileBytes'];
        }

        $result = \ProAutomation::enqueueClamavScanJob($payload, $actor);
        if (!empty($result['ok']) && method_exists('\ProAutomation', 'ensureWorkerRunning')) {
            $result['worker'] = \ProAutomation::ensureWorkerRunning('api.scan.queue');
        }

        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveScanSettings(array $body): array
    {
        $payload = $body['scanSchedule'] ?? $body['scan_schedule'] ?? $body;
        if (!is_array($payload)) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid scan settings payload']);
        }

        $hasAnyField = array_key_exists('intervalMinutes', $payload)
            || array_key_exists('interval_minutes', $payload)
            || array_key_exists('unsetInterval', $payload)
            || array_key_exists('unset_interval', $payload);
        if (!$hasAnyField) {
            return self::response(400, ['ok' => false, 'error' => 'No scan settings fields provided']);
        }

        if (!method_exists('\ProAutomation', 'saveScanSettings')) {
            return self::response(500, [
                'ok' => false,
                'error' => 'Automation scan settings are not supported',
            ]);
        }

        $result = \ProAutomation::saveScanSettings($payload);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function getSecuritySettings(): array
    {
        $result = \ProAutomation::getSecuritySettings();
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveSecuritySettings(array $body): array
    {
        $payload = $body['security'] ?? $body;
        if (!is_array($payload)) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid security payload']);
        }

        $hasAnyField = array_key_exists('webhooksEnabled', $payload)
            || array_key_exists('webhooks_enabled', $payload)
            || array_key_exists('allowlistEnabled', $payload)
            || array_key_exists('allowlist_enabled', $payload)
            || array_key_exists('allowedHosts', $payload)
            || array_key_exists('allowed_hosts', $payload)
            || array_key_exists('forcePublicTargets', $payload)
            || array_key_exists('force_public_targets', $payload);
        if (!$hasAnyField) {
            return self::response(400, ['ok' => false, 'error' => 'No security fields provided']);
        }

        $result = \ProAutomation::saveSecuritySettings($payload);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listWebhooks(): array
    {
        $result = \ProAutomation::listEndpoints();
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveWebhook(array $body): array
    {
        $payload = $body['endpoint'] ?? $body;
        if (!is_array($payload)) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid endpoint payload']);
        }

        $result = \ProAutomation::saveEndpoint($payload);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function deleteWebhook(array $body): array
    {
        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $result = \ProAutomation::deleteEndpoint($id);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function testWebhook(array $body, string $actor): array
    {
        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $result = \ProAutomation::enqueueTestDelivery($id, $actor);
        if (!empty($result['ok']) && method_exists('\ProAutomation', 'ensureWorkerRunning')) {
            $result['worker'] = \ProAutomation::ensureWorkerRunning('api.webhook.test');
        }

        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function startWorker(array $body): array
    {
        $force = !empty($body['force']);

        if (!method_exists('\ProAutomation', 'ensureWorkerRunning')) {
            return self::response(500, [
                'ok' => false,
                'error' => 'Automation worker start is not supported',
            ]);
        }

        $result = \ProAutomation::ensureWorkerRunning('api.worker.start', $force);
        return self::response(!empty($result['ok']) ? 200 : 500, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function cleanupWorker(array $body): array
    {
        $maxAgeSeconds = isset($body['maxAgeSeconds'])
            ? (int)$body['maxAgeSeconds']
            : (isset($body['max_age_seconds']) ? (int)$body['max_age_seconds'] : 86400);

        if (!method_exists('\ProAutomation', 'cleanupWorkers')) {
            return self::response(500, [
                'ok' => false,
                'error' => 'Automation worker cleanup is not supported',
            ]);
        }

        $result = \ProAutomation::cleanupWorkers($maxAgeSeconds);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listAiWatchRules(): array
    {
        $result = \ProAutomation::listAiWatchRules();
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveAiWatchRule(array $body): array
    {
        $payload = $body['rule'] ?? $body;
        if (!is_array($payload)) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid watched rule payload']);
        }

        try {
            $result = \ProAutomation::saveAiWatchRule($payload);
        } catch (\InvalidArgumentException $e) {
            return self::response(400, ['ok' => false, 'error' => $e->getMessage()]);
        }

        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function deleteAiWatchRule(array $body): array
    {
        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $result = \ProAutomation::deleteAiWatchRule($id);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }

    /**
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listAiApprovals(array $query): array
    {
        $filters = [
            'status' => isset($query['status']) ? (string)$query['status'] : '',
            'limit' => isset($query['limit']) ? (int)$query['limit'] : 100,
            'search' => isset($query['search']) ? (string)$query['search'] : '',
        ];
        $result = \ProAutomation::listAiApprovals($filters);
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function decideAiApproval(array $body, string $actor = ''): array
    {
        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $decision = isset($body['decision']) ? (string)$body['decision'] : '';
        $result = \ProAutomation::decideAiApproval($id, $decision, $actor);
        return self::response(!empty($result['ok']) ? 200 : 400, $result);
    }
}
