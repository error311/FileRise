<?php

declare(strict_types=1);

namespace FileRise\Storage;

use FileRise\Storage\StorageAdapterInterface;
use FileRise\Storage\ReadOnlyAdapter;
use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageFactory;

// src/lib/StorageRegistry.php

require_once PROJECT_ROOT . '/src/lib/StorageAdapterInterface.php';
require_once PROJECT_ROOT . '/src/lib/StorageFactory.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';
require_once PROJECT_ROOT . '/src/lib/ReadOnlyAdapter.php';

final class StorageRegistry
{
    /** @var array<string, StorageAdapterInterface> */
    private static array $adapters = [];
    private static ?StorageAdapterInterface $legacyAdapter = null;

    public static function setAdapter(StorageAdapterInterface $adapter): void
    {
        self::$legacyAdapter = $adapter;
        self::$adapters = [];
    }

    public static function setAdapterForSource(string $sourceId, StorageAdapterInterface $adapter): void
    {
        self::$adapters[$sourceId] = $adapter;
    }

    public static function getAdapter(?string $sourceId = null): StorageAdapterInterface
    {
        if (self::$legacyAdapter !== null) {
            if (!class_exists('SourceContext') || !SourceContext::sourcesEnabled()) {
                return self::$legacyAdapter;
            }
        }

        $sourceId = $sourceId ?? (class_exists('SourceContext') ? SourceContext::getActiveId() : 'local');
        if (isset(self::$adapters[$sourceId])) {
            return self::$adapters[$sourceId];
        }

        $adapter = StorageFactory::createAdapterForSource($sourceId);
        self::$adapters[$sourceId] = $adapter;
        return $adapter;
    }
}
