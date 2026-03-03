<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Http\Controllers\AdminController;

final class ProGroupsApiService
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
    public static function listGroups(): array
    {
        $ctrl = new AdminController();
        $groups = $ctrl->getProGroups();

        return self::response(200, [
            'success' => true,
            'groups' => $groups,
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveGroups(array $body): array
    {
        $groups = $body['groups'] ?? null;
        if (!is_array($groups)) {
            return self::response(400, [
                'success' => false,
                'error' => 'Invalid groups format.',
            ]);
        }

        $ctrl = new AdminController();
        $ctrl->saveProGroups($groups);

        return self::response(200, ['success' => true]);
    }
}
