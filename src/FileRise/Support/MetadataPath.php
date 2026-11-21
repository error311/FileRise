<?php

namespace FileRise\Support;

final class MetadataPath
{
    private const ROOT_FILE = 'root_metadata.json';

    public static function folderKey(string $folder): string
    {
        $folder = trim(str_replace('\\', '/', $folder), "/ \t\n\r\0\x0B");
        if ($folder === '' || strcasecmp($folder, 'root') === 0) {
            return 'root';
        }
        return $folder;
    }

    public static function path(string $metaRoot, string $folder): string
    {
        $metaRoot = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR;
        $folder = self::folderKey($folder);

        if ($folder === 'root') {
            return $metaRoot . self::ROOT_FILE;
        }

        $legacyPath = $metaRoot . self::legacyFileName($folder);
        if (!self::isCollisionSensitive($folder)) {
            return $legacyPath;
        }

        $encodedPath = $metaRoot . self::encodedFileName($folder);
        if (!is_file($encodedPath) && is_file($legacyPath)) {
            self::copyLegacyMetadata($legacyPath, $encodedPath);
        }

        return $encodedPath;
    }

    public static function encodedFileName(string $folder): string
    {
        $folder = self::folderKey($folder);
        if ($folder === 'root') {
            return self::ROOT_FILE;
        }
        return 'folder-' . rawurlencode($folder) . '_metadata.json';
    }

    public static function legacyFileName(string $folder): string
    {
        $folder = self::folderKey($folder);
        if ($folder === 'root') {
            return self::ROOT_FILE;
        }
        return str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
    }

    public static function deleteSubtree(string $metaRoot, string $folder): void
    {
        $metaRoot = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR;
        $folder = self::folderKey($folder);
        if ($folder === 'root') {
            return;
        }

        $exact = self::encodedFileName($folder);
        $prefix = 'folder-' . rawurlencode($folder . '/');
        $legacyExact = self::isCollisionSensitive($folder) ? null : self::legacyFileName($folder);
        foreach (self::metadataFiles($metaRoot) as $name) {
            if ($name === $exact || $name === $legacyExact || str_starts_with($name, $prefix)) {
                @unlink($metaRoot . $name);
            }
        }
        // Dashed legacy names are ambiguous: never delete them by prefix.
    }

    /**
     * Preserve unvisited legacy descendants before a rename, using real folder paths.
     * The callback is lazy: modern metadata needs no storage-tree traversal.
     *
     * @param callable(): iterable<string> $descendants
     */
    public static function prepareSubtreeRename(string $metaRoot, string $folder, callable $descendants): void
    {
        $metaRoot = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR;
        $folder = self::folderKey($folder);
        if ($folder === 'root') {
            return;
        }
        $legacyPrefix = substr(self::legacyFileName($folder), 0, -strlen('_metadata.json')) . '-';
        foreach (self::metadataFiles($metaRoot) as $name) {
            if (!str_starts_with($name, $legacyPrefix)) {
                continue;
            }
            foreach ($descendants() as $child) {
                $child = self::folderKey($child);
                if (str_starts_with($child, $folder . '/')) {
                    self::path($metaRoot, $child);
                }
            }
            return;
        }
    }

    public static function renameSubtree(string $metaRoot, string $oldFolder, string $newFolder): void
    {
        $metaRoot = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR;
        $oldFolder = self::folderKey($oldFolder);
        $newFolder = self::folderKey($newFolder);
        if ($oldFolder === 'root' || $newFolder === 'root' || $oldFolder === $newFolder) {
            return;
        }

        // Use the same authoritative path as readers, including legacy copy-on-read.
        $oldExact = self::path($metaRoot, $oldFolder);
        $newExact = self::isCollisionSensitive($newFolder)
            ? self::encodedFileName($newFolder)
            : self::legacyFileName($newFolder);
        if (is_file($oldExact)) {
            @rename($oldExact, $metaRoot . $newExact);
        }

        $oldPrefix = 'folder-' . rawurlencode($oldFolder . '/');
        $newPrefix = 'folder-' . rawurlencode($newFolder . '/');
        foreach (self::metadataFiles($metaRoot) as $name) {
            if (str_starts_with($name, $oldPrefix)) {
                $newName = $newPrefix . substr($name, strlen($oldPrefix));
                @rename($metaRoot . $name, $metaRoot . $newName);
            }
        }
        // Retain ambiguous legacy copies for other folders that may still need them.
    }

    private static function isCollisionSensitive(string $folder): bool
    {
        return preg_match('/[\\s\\-\\/\\\\]/', $folder) === 1;
    }

    private static function copyLegacyMetadata(string $legacyPath, string $encodedPath): void
    {
        $raw = @file_get_contents($legacyPath);
        if (!is_string($raw)) {
            return;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return;
        }
        @file_put_contents($encodedPath, json_encode($decoded, JSON_PRETTY_PRINT), LOCK_EX);
    }

    /** @return list<string> */
    private static function metadataFiles(string $metaRoot): array
    {
        $files = [];
        foreach (@scandir($metaRoot) ?: [] as $name) {
            if (str_ends_with($name, '_metadata.json') && is_file($metaRoot . $name)) {
                $files[] = $name;
            }
        }
        return $files;
    }
}
