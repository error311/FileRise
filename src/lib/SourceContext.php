<?php
// src/lib/SourceContext.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';

final class SourceContext
{
    private const DEFAULT_ID = 'local';
    private const META_SOURCES_DIR = 'sources';

    private static bool $initialized = false;
    private static ?string $activeId = null;
    private static ?array $activeSource = null;
    private static ?string $overrideId = null;
    private static ?bool $overrideAllowDisabled = null;

    private static function init(): void
    {
        if (self::$initialized) {
            return;
        }
        self::$initialized = true;

        $sessionId = null;
        $allowDisabled = false;
        if (self::$overrideId !== null) {
            $sessionId = self::$overrideId;
            self::$overrideId = null;
            $allowDisabled = self::$overrideAllowDisabled === true;
            self::$overrideAllowDisabled = null;
        } elseif (!empty($_SESSION['active_source'])) {
            $sessionId = (string)$_SESSION['active_source'];
        }

        if (defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE && class_exists('ProSources')) {
            $cfg = ProSources::getConfig();
            $enabled = !empty($cfg['enabled']);
            if ($enabled) {
                $source = ProSources::getSource($sessionId);
                if (!$source || (empty($source['enabled']) && !$allowDisabled)) {
                    $source = ProSources::getFirstEnabledSource();
                }
                if (!$source) {
                    $source = ProSources::getDefaultSource();
                }
                self::$activeSource = $source;
                self::$activeId = (string)($source['id'] ?? self::DEFAULT_ID);
                return;
            }
        }

        self::$activeId = self::DEFAULT_ID;
        self::$activeSource = [
            'id' => self::DEFAULT_ID,
            'name' => 'Local',
            'type' => 'local',
            'enabled' => true,
            'readOnly' => false,
            'config' => [
                'path' => (string)UPLOAD_DIR,
            ],
            'default' => true,
        ];
    }

    public static function sourcesEnabled(): bool
    {
        if (defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE && class_exists('ProSources')) {
            $cfg = ProSources::getConfig();
            return !empty($cfg['enabled']);
        }
        return false;
    }

    public static function getActiveId(): string
    {
        self::init();
        return self::$activeId ?: self::DEFAULT_ID;
    }

    public static function setActiveId(string $id, bool $persistSession = false, bool $allowDisabled = false): void
    {
        self::$activeId = $id;
        self::$activeSource = null;
        self::$overrideId = $id;
        self::$overrideAllowDisabled = $allowDisabled ? true : null;
        self::$initialized = false;
        if ($persistSession && session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION['active_source'] = $id;
        }
    }

    public static function getActiveSource(): array
    {
        self::init();
        return self::$activeSource ?: [];
    }

    public static function getSourceById(?string $id): ?array
    {
        if (!self::sourcesEnabled() || !class_exists('ProSources')) {
            return null;
        }
        $id = trim((string)$id);
        if ($id === '') return null;
        return ProSources::getSource($id);
    }

    public static function listAllSources(): array
    {
        if (!self::sourcesEnabled() || !class_exists('ProSources')) {
            return [self::getActiveSource()];
        }
        $cfg = ProSources::getConfig();
        $sources = isset($cfg['sources']) && is_array($cfg['sources']) ? $cfg['sources'] : [];
        return $sources ?: [self::getActiveSource()];
    }

    public static function isReadOnly(): bool
    {
        $src = self::getActiveSource();
        return !empty($src['readOnly']);
    }

    public static function uploadRoot(): string
    {
        return self::uploadRootForSource(self::getActiveSource());
    }

    public static function uploadRootForId(string $id): string
    {
        $src = self::getSourceById($id);
        if ($src) {
            return self::uploadRootForSource($src);
        }
        return rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
    }

    private static function uploadRootForSource(array $src): string
    {
        $type = strtolower((string)($src['type'] ?? 'local'));
        $cfg = is_array($src['config'] ?? null) ? $src['config'] : [];

        if ($type === 'local') {
            $path = (string)($cfg['path'] ?? '');
            if ($path !== '') {
                return rtrim($path, "/\\") . DIRECTORY_SEPARATOR;
            }
        }

        return rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
    }

    public static function trashRoot(): string
    {
        return rtrim(self::uploadRoot(), "/\\") . DIRECTORY_SEPARATOR . 'trash' . DIRECTORY_SEPARATOR;
    }

    public static function metaRoot(): string
    {
        return self::metaRootForSource(self::getActiveSource());
    }

    public static function metaRootForId(string $id): string
    {
        $src = self::getSourceById($id);
        if ($src) {
            return self::metaRootForSource($src);
        }
        return rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR;
    }

    private static function metaRootForSource(array $src): string
    {
        $base = rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR;
        if (!self::sourcesEnabled()) {
            return $base;
        }
        $id = (string)($src['id'] ?? self::DEFAULT_ID);
        $type = strtolower((string)($src['type'] ?? ''));
        if ($id === self::DEFAULT_ID && $type === 'local') {
            return $base;
        }
        $safeId = self::safeId($id);
        return $base . self::META_SOURCES_DIR . DIRECTORY_SEPARATOR . $safeId . DIRECTORY_SEPARATOR;
    }

    public static function ensureMetaDir(): void
    {
        $dir = self::metaRoot();
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
    }

    public static function metaPath(string $fileName): string
    {
        return self::metaRoot() . $fileName;
    }

    private static function safeId(string $id): string
    {
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return $id;
        }
        return self::DEFAULT_ID;
    }
}
