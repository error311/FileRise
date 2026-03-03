<?php

declare(strict_types=1);

namespace FileRise\Domain;

use Throwable;

final class AdminDiskUsageApiService
{
    /**
     * @param array<string,mixed> $payload
     * @param array<string,string> $headers
     * @return array{status:int,payload:array<string,mixed>,headers:array<string,string>}
     */
    private static function response(int $status, array $payload, array $headers = []): array
    {
        return [
            'status' => $status,
            'payload' => $payload,
            'headers' => $headers,
        ];
    }

    /**
     * @param array<string,mixed> $session
     */
    private static function isAdminSession(array $session): bool
    {
        return !empty($session['isAdmin'])
            || (!empty($session['admin']) && (string)$session['admin'] === '1');
    }

    /**
     * @param array<string,mixed> $body
     * @param array<string,mixed> $query
     */
    private static function extractSourceId(array $body, array $query): string
    {
        if (isset($body['sourceId'])) {
            return trim((string)$body['sourceId']);
        }
        if (isset($query['sourceId'])) {
            return trim((string)$query['sourceId']);
        }
        return '';
    }

    /**
     * @param array<string,mixed> $query
     * @param array<string,mixed> $session
     * @return array{status:int,payload:array<string,mixed>,headers:array<string,string>}
     */
    public static function summary(array $query, array $session): array
    {
        $authenticated = !empty($session['authenticated']);
        if (!$authenticated || !self::isAdminSession($session)) {
            return self::response(401, [
                'ok' => false,
                'error' => 'Unauthorized',
            ]);
        }

        $topFolders = isset($query['topFolders']) ? max(1, (int)$query['topFolders']) : 5;
        $topFiles = isset($query['topFiles']) ? max(0, (int)$query['topFiles']) : 0;
        $sourceId = isset($query['sourceId']) ? trim((string)$query['sourceId']) : '';

        try {
            $summary = DiskUsageModel::getSummary($topFolders, $topFiles, $sourceId);
            $logInfo = DiskUsageModel::readScanLogTail(4000, $sourceId);
            if ($logInfo !== null) {
                $summary['scanLog'] = $logInfo;
            }

            if (!empty($summary['ok'])) {
                return self::response(200, $summary);
            }

            $error = (string)($summary['error'] ?? '');
            if ($error === 'no_snapshot') {
                return self::response(200, $summary);
            }
            if ($error === 'invalid_source' || $error === 'unsupported_source') {
                return self::response(400, $summary);
            }

            return self::response(404, $summary);
        } catch (Throwable $e) {
            return self::response(500, [
                'ok' => false,
                'error' => 'internal_error',
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @param array<string,mixed> $server
     * @param array<string,mixed> $session
     * @param array<string,mixed> $query
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>,headers:array<string,string>}
     */
    public static function triggerScan(array $server, array $session, array $query, array $body): array
    {
        if (($server['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            return self::response(
                405,
                [
                    'ok' => false,
                    'error' => 'Method not allowed',
                ],
                ['Allow' => 'POST']
            );
        }

        $username = trim((string)($session['username'] ?? ''));
        if ($username === '' || !self::isAdminSession($session)) {
            return self::response(403, [
                'ok' => false,
                'error' => 'Forbidden',
            ]);
        }

        $csrfHeader = trim((string)($server['HTTP_X_CSRF_TOKEN'] ?? ''));
        $csrfSession = (string)($session['csrf_token'] ?? '');
        if ($csrfSession === '' || $csrfHeader === '' || !hash_equals($csrfSession, $csrfHeader)) {
            return self::response(403, [
                'ok' => false,
                'error' => 'Invalid CSRF token',
            ]);
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }

        try {
            $sourceId = self::extractSourceId($body, $query);
            $launch = DiskUsageScanLauncher::launch($sourceId);

            return self::response(200, [
                'ok' => true,
                'pid' => $launch['pid'] ?? null,
                'message' => 'Disk usage scan started in the background.',
                'logFile' => $launch['logFile'] ?? null,
                'logMtime' => $launch['logMtime'] ?? null,
                'sourceId' => $launch['sourceId'] ?? '',
            ]);
        } catch (Throwable $e) {
            $code = (int)$e->getCode();
            if ($code >= 400 && $code <= 599) {
                return self::response($code, [
                    'ok' => false,
                    'error' => ($code === 400) ? 'invalid_source' : 'internal_error',
                    'message' => $e->getMessage(),
                ]);
            }

            return self::response(500, [
                'ok' => false,
                'error' => 'internal_error',
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @param array<string,mixed> $server
     * @param array<string,mixed> $session
     * @param array<string,mixed> $query
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>,headers:array<string,string>}
     */
    public static function deleteSnapshot(array $server, array $session, array $query, array $body): array
    {
        $username = trim((string)($session['username'] ?? ''));
        if ($username === '' || !self::isAdminSession($session)) {
            return self::response(403, [
                'ok' => false,
                'error' => 'Forbidden',
            ]);
        }

        $csrfHeader = (string)($server['HTTP_X_CSRF_TOKEN'] ?? '');
        $csrfSession = (string)($session['csrf_token'] ?? '');
        if ($csrfSession !== '' && $csrfHeader !== '' && !hash_equals($csrfSession, $csrfHeader)) {
            return self::response(400, [
                'ok' => false,
                'error' => 'csrf_mismatch',
            ]);
        }

        try {
            $sourceId = self::extractSourceId($body, $query);

            if ($sourceId !== '') {
                $ctx = DiskUsageModel::resolveSourceContext($sourceId);
                if (empty($ctx['ok'])) {
                    return self::response(400, [
                        'ok' => false,
                        'error' => $ctx['error'] ?? 'invalid_source',
                        'message' => $ctx['message'] ?? 'Invalid source.',
                    ]);
                }
            }

            $deleted = DiskUsageModel::deleteSnapshot($sourceId);

            return self::response(200, [
                'ok' => true,
                'deleted' => $deleted,
                'snapshot' => DiskUsageModel::snapshotPath($sourceId),
                'sourceId' => ($sourceId !== '') ? $sourceId : null,
            ]);
        } catch (Throwable $e) {
            return self::response(500, [
                'ok' => false,
                'error' => 'internal_error',
                'message' => $e->getMessage(),
            ]);
        }
    }
}
