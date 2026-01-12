<?php
// src/models/FolderMeta.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';
require_once __DIR__ . '/../../src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class FolderMeta
{
    private static function path(): string {
        $base = class_exists('SourceContext')
            ? rtrim(SourceContext::metaRoot(), '/\\')
            : rtrim((string)META_DIR, '/\\');
        return $base . DIRECTORY_SEPARATOR . 'folder_colors.json';
    }

    public static function normalizeFolder(string $folder): string {
        $f = trim(str_replace('\\','/',$folder), "/ \t\r\n");
        return ($f === '' || $f === 'root') ? 'root' : $f;
    }

    /** Normalize hex (accepts #RGB or #RRGGBB, returns #RRGGBB) */
    public static function normalizeHex(?string $hex): ?string {
        if ($hex === null || $hex === '') return null;
        if (!preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $hex)) {
            throw new \InvalidArgumentException('Invalid color hex');
        }
        if (strlen($hex) === 4) {
            $hex = '#' . $hex[1].$hex[1] . $hex[2].$hex[2] . $hex[3].$hex[3];
        }
        return strtoupper($hex);
    }

    /** Read full map from disk */
    public static function getMap(): array {
        $file = self::path();
        $raw  = @file_get_contents($file);
        $map  = is_string($raw) ? json_decode($raw, true) : [];
        return is_array($map) ? $map : [];
    }

    /** Write full map to disk (atomic-ish) */
    private static function writeMap(array $map): void {
        $file = self::path();
        $dir  = dirname($file);
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $tmp = $file . '.tmp';
        @file_put_contents($tmp, json_encode($map, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES), LOCK_EX);
        @rename($tmp, $file);
        @chmod($file, 0664);
    }

    /** Set or clear a color for one folder */
    public static function setColor(string $folder, ?string $hex): array {
        $folder = self::normalizeFolder($folder);
        $hex    = self::normalizeHex($hex);
        $map    = self::getMap();

        if ($hex === null) unset($map[$folder]);
        else $map[$folder] = $hex;

        self::writeMap($map);
        return ['folder'=>$folder, 'color'=>$map[$folder] ?? null];
    }

    /** Migrate color entries for a whole subtree (used by move/rename) */
    public static function migrateSubtree(string $source, string $target): array {
        $src = self::normalizeFolder($source);
        $dst = self::normalizeFolder($target);
        if ($src === 'root') return ['changed'=>false, 'moved'=>0];

        $map = self::getMap();
        if (!$map) return ['changed'=>false, 'moved'=>0];

        $new   = $map;
        $moved = 0;

        foreach ($map as $key => $hex) {
            $isSelf = ($key === $src);
            $isSub  = str_starts_with($key.'/', $src.'/');
            if (!$isSelf && !$isSub) continue;

            unset($new[$key]);
            $suffix = substr($key, strlen($src)); // '' or '/child/...'
            $newKey = $dst === 'root' ? ltrim($suffix,'/') : rtrim($dst,'/') . $suffix;
            $new[$newKey] = $hex;
            $moved++;
        }

        if ($moved) self::writeMap($new);
        return ['changed'=> (bool)$moved, 'moved'=> $moved];
    }
}
