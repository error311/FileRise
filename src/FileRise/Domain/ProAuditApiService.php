<?php

declare(strict_types=1);

namespace FileRise\Domain;

use Throwable;

final class ProAuditApiService
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
     * @param array<string,mixed> $permissions
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function list(array $query, string $username, array $permissions): array
    {
        try {
            $folder = AuditAccessPolicy::normalizeFolderFilter((string)($query['folder'] ?? ''));
            AuditAccessPolicy::assertAuditFolderReadable($folder, $username, $permissions);
            $filters = AuditAccessPolicy::buildFilters($query, $folder);

            $limit = isset($query['limit']) ? (int)$query['limit'] : 200;
            $limit = max(1, min(500, $limit));

            $result = \ProAudit::list($filters, $limit);
            if (empty($result['ok'])) {
                $status = (($result['error'] ?? '') === 'pro_required') ? 403 : 400;
                return self::response($status, $result);
            }

            return self::response(200, $result);
        } catch (Throwable $e) {
            $code = (int)$e->getCode();
            if ($code < 400 || $code > 599) {
                $code = 500;
            }
            return self::response($code, [
                'ok' => false,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @param array<string,mixed> $query
     * @param array<string,mixed> $permissions
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function prepareCsvExport(array $query, string $username, array $permissions): array
    {
        try {
            $folder = AuditAccessPolicy::normalizeFolderFilter((string)($query['folder'] ?? ''));
            AuditAccessPolicy::assertAuditFolderReadable($folder, $username, $permissions);
            $filters = AuditAccessPolicy::buildFilters($query, $folder);

            $limit = isset($query['limit']) ? (int)$query['limit'] : 1000;
            $limit = max(1, min(5000, $limit));

            return self::response(200, [
                'ok' => true,
                'filters' => $filters,
                'limit' => $limit,
            ]);
        } catch (Throwable $e) {
            $code = (int)$e->getCode();
            if ($code < 400 || $code > 599) {
                $code = 500;
            }
            return self::response($code, [
                'ok' => false,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @param array<string,mixed> $filters
     * @return array<string,mixed>
     */
    public static function exportCsv(array $filters, int $limit): array
    {
        return \ProAudit::exportCsv($filters, $limit);
    }
}
