<?php

declare(strict_types=1);

namespace FileRise\Storage;

use ProSources;

require_once PROJECT_ROOT . '/config/config.php';

final class SourcesConfig
{
    private const FILE_NAME = 'sources.json';
    private const DEFAULT_ID = 'local';
    private const CORE_TYPES = ['local', 'webdav'];
    private const ALL_TYPES = ['local', 's3', 'sftp', 'ftp', 'webdav', 'smb', 'gdrive', 'onedrive', 'dropbox'];

    private static function proSourcesAvailable(): bool
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProSources')) {
            return false;
        }
        if (!defined('FR_PRO_API_REQUIRE_SOURCES') || !function_exists('fr_pro_api_level_at_least')) {
            return true;
        }
        return fr_pro_api_level_at_least((int)FR_PRO_API_REQUIRE_SOURCES);
    }

    public static function isProExtendedAvailable(): bool
    {
        return self::proSourcesAvailable();
    }

    public static function allowedTypes(): array
    {
        return self::proSourcesAvailable() ? self::ALL_TYPES : self::CORE_TYPES;
    }

    public static function isTypeAllowed(string $type): bool
    {
        $type = strtolower(trim($type));
        return in_array($type, self::allowedTypes(), true);
    }

    public static function capabilityInfo(): array
    {
        $pro = self::proSourcesAvailable();
        return [
            'available' => true,
            'proExtended' => $pro,
            'allowedTypes' => self::allowedTypes(),
            'coreTypes' => self::CORE_TYPES,
            'proTypes' => array_values(array_diff(self::ALL_TYPES, self::CORE_TYPES)),
        ];
    }

    private static function withCapabilities(array $cfg): array
    {
        return array_merge($cfg, self::capabilityInfo());
    }

    private static function baseDir(): string
    {
        $base = defined('FR_PRO_BUNDLE_DIR') ? rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") : '';
        if ($base === '') {
            $base = rtrim((string)USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . 'pro';
        }
        return $base;
    }

    private static function filePath(): string
    {
        $base = self::baseDir();
        return $base !== '' ? ($base . DIRECTORY_SEPARATOR . self::FILE_NAME) : '';
    }

    private static function ensureDir(): void
    {
        $base = self::baseDir();
        if ($base !== '' && !is_dir($base)) {
            @mkdir($base, 0755, true);
        }
    }

    private static function decryptSecret(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        $plain = decryptData($value, $GLOBALS['encryptionKey']);
        return ($plain === false || $plain === null) ? '' : (string)$plain;
    }

    private static function encryptSecret(string $value): string
    {
        $value = (string)$value;
        if ($value === '') {
            return '';
        }
        return encryptData($value, $GLOBALS['encryptionKey']);
    }

    private static function defaultLocalSource(): array
    {
        return [
            'id' => self::DEFAULT_ID,
            'name' => 'Local',
            'type' => 'local',
            'enabled' => true,
            'readOnly' => false,
            'disableTrash' => false,
            'config' => [
                'path' => (string)UPLOAD_DIR,
            ],
        ];
    }

    private static function rawSourceMap(array $raw): array
    {
        $sourcesRaw = isset($raw['sources']) && is_array($raw['sources']) ? $raw['sources'] : [];
        $out = [];

        foreach ($sourcesRaw as $key => $src) {
            if (!is_array($src)) {
                continue;
            }
            if (!isset($src['id']) && is_string($key)) {
                $src['id'] = $key;
            }
            $id = trim((string)($src['id'] ?? ''));
            if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
                continue;
            }
            $out[$id] = $src;
        }

        return $out;
    }

    private static function coreConfigFromRaw(array $raw): array
    {
        $enabled = !empty($raw['enabled']);
        $sources = [];

        foreach (self::rawSourceMap($raw) as $src) {
            $normalized = self::normalizeSourceStored($src);
            if ($normalized) {
                $sources[$normalized['id']] = $normalized;
            }
        }

        if (!isset($sources[self::DEFAULT_ID])) {
            $sources[self::DEFAULT_ID] = self::normalizeSourceStored(self::defaultLocalSource());
        }

        return [
            'enabled' => $enabled,
            'sources' => $sources,
        ];
    }

    private static function normalizeSourceStored(array $src): ?array
    {
        $id = trim((string)($src['id'] ?? ''));
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return null;
        }

        $type = strtolower((string)($src['type'] ?? 'local'));
        if (!self::isTypeAllowed($type)) {
            return null;
        }

        $name = trim((string)($src['name'] ?? ''));
        if ($name === '') {
            $name = ($id === self::DEFAULT_ID) ? 'Local' : $id;
        }

        $enabled = !isset($src['enabled']) || $src['enabled'] !== false;
        $readOnly = !empty($src['readOnly']);
        $disableTrash = !empty($src['disableTrash']);

        $config = isset($src['config']) && is_array($src['config']) ? $src['config'] : [];
        if ($type === 'local') {
            $path = trim((string)($config['path'] ?? $config['root'] ?? ''));
            if ($path === '') {
                $path = (string)UPLOAD_DIR;
            }
            $configStore = [
                'path' => $path,
            ];
        } else {
            $baseUrl = trim((string)($config['baseUrl'] ?? $config['url'] ?? ''));
            $username = trim((string)($config['username'] ?? ''));
            if ($baseUrl === '' || $username === '') {
                return null;
            }
            $root = trim((string)($config['root'] ?? $config['path'] ?? ''));
            $verifyTls = !isset($config['verifyTls']) || $config['verifyTls'] !== false;
            $configStore = [
                'baseUrl' => $baseUrl,
                'username' => $username,
                'root' => $root,
                'verifyTls' => $verifyTls ? 1 : 0,
            ];
            if (isset($config['passwordEnc'])) {
                $configStore['passwordEnc'] = (string)$config['passwordEnc'];
            }
        }

        return [
            'id' => $id,
            'name' => $name,
            'type' => $type,
            'enabled' => $enabled,
            'readOnly' => $readOnly,
            'disableTrash' => $disableTrash,
            'config' => $configStore,
        ];
    }

    private static function buildSourceView(array $src, bool $includeSecrets, bool $adminView): array
    {
        $out = [
            'id' => $src['id'],
            'name' => $src['name'],
            'type' => $src['type'],
            'enabled' => !empty($src['enabled']),
            'readOnly' => !empty($src['readOnly']),
            'disableTrash' => !empty($src['disableTrash']),
        ];

        $cfg = isset($src['config']) && is_array($src['config']) ? $src['config'] : [];
        if ($src['type'] === 'local') {
            $out['config'] = [
                'path' => (string)($cfg['path'] ?? ''),
            ];
            return $out;
        }

        if ($src['type'] === 'webdav') {
            $config = [
                'baseUrl' => (string)($cfg['baseUrl'] ?? $cfg['url'] ?? ''),
                'username' => (string)($cfg['username'] ?? ''),
                'root' => (string)($cfg['root'] ?? $cfg['path'] ?? ''),
                'verifyTls' => !isset($cfg['verifyTls']) || $cfg['verifyTls'] !== false,
            ];
            $hasPassword = !empty($cfg['passwordEnc']);

            if ($includeSecrets) {
                $config['password'] = $hasPassword ? self::decryptSecret((string)$cfg['passwordEnc']) : '';
            } elseif ($adminView) {
                $config['hasPassword'] = $hasPassword;
            }

            $out['config'] = $config;
            return $out;
        }

        $out['config'] = [];
        return $out;
    }

    public static function sourcesEnabled(): bool
    {
        return !empty(self::getConfig()['enabled']);
    }

    public static function getConfig(): array
    {
        if (self::proSourcesAvailable()) {
            return self::withCapabilities(ProSources::getConfig());
        }

        $cfg = self::coreConfigFromRaw(self::loadRaw());
        $out = [
            'enabled' => !empty($cfg['enabled']),
            'sources' => [],
        ];

        foreach ($cfg['sources'] as $src) {
            $out['sources'][] = self::buildSourceView($src, true, false);
        }

        return self::withCapabilities($out);
    }

    public static function getPublicConfig(): array
    {
        if (self::proSourcesAvailable()) {
            return self::withCapabilities(ProSources::getPublicConfig());
        }

        $cfg = self::coreConfigFromRaw(self::loadRaw());
        $out = [
            'enabled' => !empty($cfg['enabled']),
            'sources' => [],
        ];

        foreach ($cfg['sources'] as $src) {
            if (empty($src['enabled'])) {
                continue;
            }
            $view = self::buildSourceView($src, false, false);
            unset($view['config']);
            $out['sources'][] = $view;
        }

        return self::withCapabilities($out);
    }

    public static function getAdminList(): array
    {
        if (self::proSourcesAvailable()) {
            return self::withCapabilities(ProSources::getAdminList());
        }

        $cfg = self::coreConfigFromRaw(self::loadRaw());
        $out = [
            'enabled' => !empty($cfg['enabled']),
            'sources' => [],
        ];

        foreach ($cfg['sources'] as $src) {
            $out['sources'][] = self::buildSourceView($src, false, true);
        }

        return self::withCapabilities($out);
    }

    public static function getSource(?string $id): ?array
    {
        if (self::proSourcesAvailable()) {
            return ProSources::getSource($id);
        }

        $cfg = self::coreConfigFromRaw(self::loadRaw());
        $id = trim((string)$id);
        if ($id !== '' && isset($cfg['sources'][$id])) {
            return self::buildSourceView($cfg['sources'][$id], true, false);
        }

        return null;
    }

    public static function getFirstEnabledSource(): ?array
    {
        if (self::proSourcesAvailable()) {
            return ProSources::getFirstEnabledSource();
        }

        $cfg = self::coreConfigFromRaw(self::loadRaw());
        foreach ($cfg['sources'] as $src) {
            if (!empty($src['enabled'])) {
                return self::buildSourceView($src, true, false);
            }
        }

        return null;
    }

    public static function getDefaultSource(): array
    {
        if (self::proSourcesAvailable()) {
            return ProSources::getDefaultSource();
        }

        return self::buildSourceView(self::normalizeSourceStored(self::defaultLocalSource()), true, false);
    }

    public static function saveEnabled(bool $enabled): bool
    {
        if (self::proSourcesAvailable()) {
            return ProSources::saveEnabled($enabled);
        }

        $raw = self::loadRaw();
        $raw['enabled'] = $enabled ? true : false;
        return self::saveRaw($raw);
    }

    public static function upsertSource(array $source): array
    {
        if (self::proSourcesAvailable()) {
            return ProSources::upsertSource($source);
        }

        $id = isset($source['id']) ? trim((string)$source['id']) : '';
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return ['ok' => false, 'error' => 'Invalid source id'];
        }

        $rawType = strtolower(trim((string)($source['type'] ?? 'local')));
        if (!self::isTypeAllowed($rawType)) {
            return ['ok' => false, 'error' => 'Source type requires FileRise Pro'];
        }

        $raw = self::loadRaw();
        $sourceMap = self::rawSourceMap($raw);
        $existingRaw = isset($sourceMap[$id]) && is_array($sourceMap[$id]) ? $sourceMap[$id] : null;
        $existing = is_array($existingRaw) ? self::normalizeSourceStored($existingRaw) : null;

        $normalized = self::normalizeSourceStored($source);
        if (!$normalized) {
            return ['ok' => false, 'error' => 'Invalid source configuration'];
        }

        if (!array_key_exists('disableTrash', $source) && $existing && isset($existing['disableTrash'])) {
            $normalized['disableTrash'] = !empty($existing['disableTrash']);
        }

        if ($normalized['type'] === 'webdav') {
            $cfgStore = $normalized['config'];
            $password = isset($source['config']['password']) ? trim((string)$source['config']['password']) : '';

            if ($password !== '') {
                $cfgStore['passwordEnc'] = self::encryptSecret($password);
            } elseif (
                $existingRaw
                && isset($existingRaw['config'])
                && is_array($existingRaw['config'])
                && isset($existingRaw['config']['passwordEnc'])
            ) {
                $cfgStore['passwordEnc'] = (string)$existingRaw['config']['passwordEnc'];
            }

            if (empty($cfgStore['passwordEnc'])) {
                return ['ok' => false, 'error' => 'WebDAV requires a password'];
            }

            $normalized['config'] = $cfgStore;
        }

        $sourceMap[$id] = $normalized;
        $raw['sources'] = $sourceMap;

        if (!self::saveRaw($raw)) {
            return ['ok' => false, 'error' => 'Failed to save sources'];
        }

        return ['ok' => true, 'source' => self::buildSourceView($normalized, false, true)];
    }

    public static function deleteSource(string $id): array
    {
        if (self::proSourcesAvailable()) {
            return ProSources::deleteSource($id);
        }

        $id = trim($id);
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return ['ok' => false, 'error' => 'Invalid source id'];
        }
        if ($id === self::DEFAULT_ID) {
            return ['ok' => false, 'error' => 'Cannot delete the default Local source'];
        }

        $raw = self::loadRaw();
        $sourceMap = self::rawSourceMap($raw);
        if (!isset($sourceMap[$id])) {
            return ['ok' => true];
        }

        unset($sourceMap[$id]);
        $raw['sources'] = $sourceMap;

        if (!self::saveRaw($raw)) {
            return ['ok' => false, 'error' => 'Failed to delete source'];
        }

        return ['ok' => true];
    }

    private static function loadRaw(): array
    {
        $path = self::filePath();
        if ($path === '' || !is_file($path)) {
            return ['enabled' => false, 'sources' => []];
        }

        $raw = @file_get_contents($path);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($data) ? $data : ['enabled' => false, 'sources' => []];
    }

    private static function saveRaw(array $cfg): bool
    {
        $path = self::filePath();
        if ($path === '') {
            return false;
        }
        self::ensureDir();

        $json = json_encode($cfg, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return false;
        }

        $tmp = $path . '.tmp';
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
            return false;
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        @chmod($path, 0644);
        return true;
    }
}
