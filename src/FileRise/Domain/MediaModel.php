<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Support\ACL;

// src/models/MediaModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

class MediaModel
{
    private static function baseDir(): string
    {
        $dir = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . 'user_state';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir . DIRECTORY_SEPARATOR;
    }

    private static function filePathFor(string $username): string
    {
        // case-insensitive username file
        $safe = strtolower(preg_replace('/[^a-z0-9_\-\.]/i', '_', $username));
        return self::baseDir() . $safe . '_media.json';
    }

    private static function loadState(string $username): array
    {
        $path = self::filePathFor($username);
        if (!file_exists($path)) {
            return ["version" => 1, "items" => []];
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        return (is_array($data) && isset($data['items'])) ? $data : ["version" => 1, "items" => []];
    }

    private static function saveState(string $username, array $state): bool
    {
        $path = self::filePathFor($username);
        $tmp  = $path . '.tmp';
        $ok   = file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
        if ($ok === false) {
            return false;
        }
        return @rename($tmp, $path);
    }

    /** Save/merge a single file progress record. */
    public static function saveProgress(string $username, string $folder, string $file, float $seconds, ?float $duration, ?bool $completed): array
    {
        $folderKey = ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder;
        $nowIso    = date('c');

        $state = self::loadState($username);
        if (!isset($state['items'][$folderKey])) {
            $state['items'][$folderKey] = [];
        }
        if (!isset($state['items'][$folderKey][$file])) {
            $state['items'][$folderKey][$file] = [
                "seconds"   => 0,
                "duration"  => $duration ?? 0,
                "completed" => false,
                "updatedAt" => $nowIso
            ];
        }

        $row =& $state['items'][$folderKey][$file];
        if ($duration !== null && $duration > 0) {
            $row['duration'] = $duration;
        }
        if ($seconds >= 0) {
            $row['seconds'] = $seconds;
        }
        if ($completed !== null) {
            $row['completed'] = (bool)$completed;
        }
        // auto-complete if we’re basically done
        if (!$row['completed'] && $row['duration'] > 0 && $row['seconds'] >= max(0, $row['duration'] * 0.95)) {
            $row['completed'] = true;
        }
        $row['updatedAt'] = $nowIso;

        self::saveState($username, $state);
        return $row;
    }

    /** Get a single file progress record. */
    public static function getProgress(string $username, string $folder, string $file): array
    {
        $folderKey = ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder;
        $state = self::loadState($username);
        $row   = $state['items'][$folderKey][$file] ?? null;
        return is_array($row) ? $row : ["seconds" => 0,"duration" => 0,"completed" => false,"updatedAt" => null];
    }

    /** Folder map: filename => {seconds,duration,completed,updatedAt} */
    public static function getFolderMap(string $username, string $folder): array
    {
        $folderKey = ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder;
        $state = self::loadState($username);
        $items = $state['items'][$folderKey] ?? [];
        return is_array($items) ? $items : [];
    }

    /** Clear one file’s progress (e.g., “mark unviewed”). */
    public static function clearProgress(string $username, string $folder, string $file): bool
    {
        $folderKey = ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder;
        $state = self::loadState($username);
        if (isset($state['items'][$folderKey][$file])) {
            unset($state['items'][$folderKey][$file]);
            return self::saveState($username, $state);
        }
        return true;
    }
}
