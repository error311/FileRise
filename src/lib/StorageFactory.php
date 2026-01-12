<?php
// src/lib/StorageFactory.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/src/lib/StorageAdapterInterface.php';
require_once PROJECT_ROOT . '/src/lib/LocalFsAdapter.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';
require_once PROJECT_ROOT . '/src/lib/ReadOnlyAdapter.php';

final class StorageFactory
{
    public static function createDefaultAdapter(): StorageAdapterInterface
    {
        return new LocalFsAdapter();
    }

    public static function createAdapterFromSourceConfig(array $source, bool $wrapReadOnly = true): ?StorageAdapterInterface
    {
        $type = strtolower((string)($source['type'] ?? 'local'));
        $cfg = isset($source['config']) && is_array($source['config']) ? $source['config'] : [];
        $root = rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
        if ($type === 'local') {
            $path = trim((string)($cfg['path'] ?? ''));
            if ($path !== '') {
                $root = rtrim($path, "/\\") . DIRECTORY_SEPARATOR;
            } elseif (class_exists('SourceContext') && !empty($source['id'])) {
                $root = SourceContext::uploadRootForId((string)$source['id']);
            }
        } elseif (class_exists('SourceContext') && !empty($source['id'])) {
            $root = SourceContext::uploadRootForId((string)$source['id']);
        }

        $adapter = null;
        if ($type === 's3') {
            if (!class_exists('ProS3Adapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $autoload = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
                if (is_file($autoload)) {
                    require_once $autoload;
                }
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProS3Adapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }

            if (class_exists('ProS3Adapter')) {
                $adapter = ProS3Adapter::fromConfig($cfg, $root);
            }
        } elseif ($type === 'sftp') {
            if (!class_exists('ProSftpAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProSftpAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProSftpAdapter')) {
                $adapter = ProSftpAdapter::fromConfig($cfg, $root);
            }
        } elseif ($type === 'ftp') {
            if (!class_exists('ProFtpAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProFtpAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProFtpAdapter')) {
                $adapter = ProFtpAdapter::fromConfig($cfg, $root);
            }
        } elseif ($type === 'webdav') {
            if (!class_exists('ProWebDavAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProWebDavAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProWebDavAdapter')) {
                $adapter = ProWebDavAdapter::fromConfig($cfg, $root);
            }
        } elseif ($type === 'smb') {
            if (!class_exists('ProSmbAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProSmbAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProSmbAdapter')) {
                $adapter = ProSmbAdapter::fromConfig($cfg, $root);
            }
        } elseif ($type === 'gdrive') {
            if (!class_exists('ProGDriveAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProGDriveAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProGDriveAdapter')) {
                $adapter = ProGDriveAdapter::fromConfig($cfg, $root);
            }
        } else {
            $adapter = new LocalFsAdapter();
        }

        if (!$adapter) {
            return null;
        }

        if ($wrapReadOnly && !empty($source['readOnly'])) {
            return new ReadOnlyAdapter($adapter);
        }

        return $adapter;
    }

    public static function createAdapterForSource(string $sourceId): StorageAdapterInterface
    {
        if (!class_exists('SourceContext') || !SourceContext::sourcesEnabled()) {
            return self::createDefaultAdapter();
        }

        if (!class_exists('ProSources')) {
            return self::createDefaultAdapter();
        }

        $source = ProSources::getSource($sourceId);
        if (!$source || empty($source['enabled'])) {
            $source = ProSources::getFirstEnabledSource();
        }
        if (!$source) {
            $source = ProSources::getDefaultSource();
        }
        $type = strtolower((string)($source['type'] ?? 'local'));

        $adapter = null;
        if ($type === 's3') {
            if (!class_exists('ProS3Adapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $autoload = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
                if (is_file($autoload)) {
                    require_once $autoload;
                }
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProS3Adapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }

            if (class_exists('ProS3Adapter')) {
                $root = SourceContext::uploadRootForId((string)($source['id'] ?? ''));
                $adapter = ProS3Adapter::fromConfig($source['config'] ?? [], $root);
            }
        } elseif ($type === 'sftp') {
            if (!class_exists('ProSftpAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProSftpAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProSftpAdapter')) {
                $root = SourceContext::uploadRootForId((string)($source['id'] ?? ''));
                $adapter = ProSftpAdapter::fromConfig($source['config'] ?? [], $root);
            }
        } elseif ($type === 'ftp') {
            if (!class_exists('ProFtpAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProFtpAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProFtpAdapter')) {
                $root = SourceContext::uploadRootForId((string)($source['id'] ?? ''));
                $adapter = ProFtpAdapter::fromConfig($source['config'] ?? [], $root);
            }
        } elseif ($type === 'webdav') {
            if (!class_exists('ProWebDavAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProWebDavAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProWebDavAdapter')) {
                $root = SourceContext::uploadRootForId((string)($source['id'] ?? ''));
                $adapter = ProWebDavAdapter::fromConfig($source['config'] ?? [], $root);
            }
        } elseif ($type === 'smb') {
            if (!class_exists('ProSmbAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProSmbAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProSmbAdapter')) {
                $root = SourceContext::uploadRootForId((string)($source['id'] ?? ''));
                $adapter = ProSmbAdapter::fromConfig($source['config'] ?? [], $root);
            }
        } elseif ($type === 'gdrive') {
            if (!class_exists('ProGDriveAdapter') && defined('FR_PRO_BUNDLE_DIR') && FR_PRO_BUNDLE_DIR) {
                $adapterPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . DIRECTORY_SEPARATOR . 'ProGDriveAdapter.php';
                if (is_file($adapterPath)) {
                    require_once $adapterPath;
                }
            }
            if (class_exists('ProGDriveAdapter')) {
                $root = SourceContext::uploadRootForId((string)($source['id'] ?? ''));
                $adapter = ProGDriveAdapter::fromConfig($source['config'] ?? [], $root);
            }
        } else {
            $adapter = new LocalFsAdapter();
        }

        if (!$adapter) {
            $adapter = self::createDefaultAdapter();
        }

        if (!empty($source['readOnly'])) {
            return new ReadOnlyAdapter($adapter);
        }

        return $adapter;
    }
}
