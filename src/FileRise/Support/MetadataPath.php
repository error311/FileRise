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

        foreach (self::newSubtreeGlobPatterns($metaRoot, $folder) as $pattern) {
            foreach (glob($pattern) ?: [] as $path) {
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }

        if (!self::isCollisionSensitive($folder)) {
            $legacyPrefix = str_replace(['/', '\\', ' '], '-', $folder);
            foreach (glob($metaRoot . $legacyPrefix . '*_metadata.json') ?: [] as $path) {
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }
    }

    public static function renameSubtree(string $metaRoot, string $oldFolder, string $newFolder): void
    {
        $metaRoot = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR;
        $oldFolder = self::folderKey($oldFolder);
        $newFolder = self::folderKey($newFolder);
        if ($oldFolder === 'root' || $newFolder === 'root') {
            return;
        }

        $oldExact = $metaRoot . self::encodedFileName($oldFolder);
        if (is_file($oldExact)) {
            @rename($oldExact, $metaRoot . self::encodedFileName($newFolder));
        }

        $oldPrefix = 'folder-' . rawurlencode($oldFolder . '/');
        $newPrefix = 'folder-' . rawurlencode($newFolder . '/');
        foreach (glob($metaRoot . $oldPrefix . '*_metadata.json') ?: [] as $oldPath) {
            if (!is_file($oldPath)) {
                continue;
            }
            $baseName = basename($oldPath);
            $newBase = preg_replace('/^' . preg_quote($oldPrefix, '/') . '/', $newPrefix, $baseName);
            if (is_string($newBase) && $newBase !== '') {
                @rename($oldPath, $metaRoot . $newBase);
            }
        }

        if (!self::isCollisionSensitive($oldFolder) && !self::isCollisionSensitive($newFolder)) {
            $oldLegacyPrefix = str_replace(['/', '\\', ' '], '-', $oldFolder);
            $newLegacyPrefix = str_replace(['/', '\\', ' '], '-', $newFolder);
            foreach (glob($metaRoot . $oldLegacyPrefix . '*_metadata.json') ?: [] as $oldPath) {
                if (!is_file($oldPath)) {
                    continue;
                }
                $baseName = basename($oldPath);
                $newBase = preg_replace('/^' . preg_quote($oldLegacyPrefix, '/') . '/', $newLegacyPrefix, $baseName);
                if (is_string($newBase) && $newBase !== '') {
                    @rename($oldPath, $metaRoot . $newBase);
                }
            }
        }
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

    /**
     * @return list<string>
     */
    private static function newSubtreeGlobPatterns(string $metaRoot, string $folder): array
    {
        $exact = $metaRoot . self::encodedFileName($folder);
        $descendants = $metaRoot . 'folder-' . rawurlencode($folder . '/') . '*_metadata.json';
        return [$exact, $descendants];
    }
}
