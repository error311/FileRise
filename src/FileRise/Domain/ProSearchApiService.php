<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Support\ACL;

final class ProSearchApiService
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
    public static function query(array $query, string $username, array $permissions): array
    {
        $rawQuery = isset($query['q']) ? (string)$query['q'] : '';
        $limit = isset($query['limit']) ? (int)$query['limit'] : 50;
        $sourceId = isset($query['sourceId']) ? (string)$query['sourceId'] : '';
        $force = !empty($query['force']) && ACL::isAdmin($permissions);

        $result = \ProSearch::query($rawQuery, $limit, $username, $permissions, $force, $sourceId);
        if (!empty($result['ok'])) {
            return self::response(200, $result);
        }

        $status = (($result['error'] ?? '') === 'disabled') ? 503 : 400;
        return self::response($status, $result);
    }
}
