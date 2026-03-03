<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Storage\SourceContext;
use FileRise\Storage\SourcesConfig;
use RuntimeException;

final class ProSourcesApiService
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
    public static function listSources(): array
    {
        $cfg = SourcesConfig::getAdminList();
        $activeId = SourceContext::getActiveId();

        return self::response(200, [
            'ok' => true,
            'enabled' => !empty($cfg['enabled']),
            'sources' => $cfg['sources'] ?? [],
            'activeId' => $activeId,
            'available' => !empty($cfg['available']),
            'proExtended' => !empty($cfg['proExtended']),
            'allowedTypes' => $cfg['allowedTypes'] ?? [],
            'coreTypes' => $cfg['coreTypes'] ?? [],
            'proTypes' => $cfg['proTypes'] ?? [],
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function saveSources(array $body): array
    {
        if (!is_array($body)) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid JSON body']);
        }

        $result = SourceAdminService::save($body);

        return self::response(200, [
            'ok' => true,
            'source' => $result['source'] ?? null,
            'autoTested' => $result['autoTested'] ?? false,
            'autoTestOk' => $result['autoTestOk'] ?? null,
            'autoTestLimited' => $result['autoTestLimited'] ?? false,
            'autoTestError' => $result['autoTestError'] ?? '',
            'autoTest' => $result['autoTest'] ?? null,
            'autoDisabled' => $result['autoDisabled'] ?? false,
            'autoDisableFailed' => $result['autoDisableFailed'] ?? false,
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function deleteSource(array $body): array
    {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') {
            return self::response(400, ['ok' => false, 'error' => 'Missing source id']);
        }

        $result = SourcesConfig::deleteSource($id);
        if (empty($result['ok'])) {
            return self::response(400, [
                'ok' => false,
                'error' => $result['error'] ?? 'Failed to delete source',
            ]);
        }

        self::refreshPublicSiteConfig();

        return self::response(200, ['ok' => true]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function testSource(array $body): array
    {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') {
            return self::response(400, ['ok' => false, 'error' => 'Missing source id']);
        }

        $result = SourceAdminService::testById($id);
        return self::response(200, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @param array<string,mixed> $permissions
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function selectSource(array $body, string $username, array $permissions): array
    {
        $id = trim((string)($body['id'] ?? ''));
        SourceAccessService::requireSelectableSource($id);

        if (!SourceAccessService::userCanAccessSourceRoot($id, $username, $permissions)) {
            return self::response(403, ['ok' => false, 'error' => 'Access denied']);
        }

        SourceContext::setActiveId($id, true);

        return self::response(200, [
            'ok' => true,
            'activeId' => $id,
        ]);
    }

    /**
     * @param array<string,mixed> $permissions
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function visibleSources(string $username, array $permissions): array
    {
        $activeId = SourceContext::getActiveId();
        $cfg = SourcesConfig::getPublicConfig();
        $enabled = !empty($cfg['enabled']);
        $sources = isset($cfg['sources']) && is_array($cfg['sources']) ? $cfg['sources'] : [];

        if (!$enabled || !$sources) {
            return self::response(200, [
                'ok' => true,
                'enabled' => (bool)$enabled,
                'sources' => [],
                'activeId' => $activeId,
                'available' => !empty($cfg['available']),
                'proExtended' => !empty($cfg['proExtended']),
                'allowedTypes' => $cfg['allowedTypes'] ?? [],
                'coreTypes' => $cfg['coreTypes'] ?? [],
                'proTypes' => $cfg['proTypes'] ?? [],
            ]);
        }

        $visible = SourceAccessService::filterVisibleSources($sources, $username, $permissions);

        return self::response(200, [
            'ok' => true,
            'enabled' => (bool)$enabled,
            'sources' => $visible,
            'activeId' => $activeId,
            'available' => !empty($cfg['available']),
            'proExtended' => !empty($cfg['proExtended']),
            'allowedTypes' => $cfg['allowedTypes'] ?? [],
            'coreTypes' => $cfg['coreTypes'] ?? [],
            'proTypes' => $cfg['proTypes'] ?? [],
        ]);
    }

    private static function refreshPublicSiteConfig(): void
    {
        $cfg = AdminModel::getConfig();
        if (isset($cfg['error'])) {
            return;
        }

        $public = AdminModel::buildPublicSubset($cfg);
        AdminModel::writeSiteConfig($public);
    }
}
