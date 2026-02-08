<?php

declare(strict_types=1);

namespace FileRise\Support;

use FileRise\Support\ACL;

// src/lib/FS.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

final class FS
{
    /** Hidden/system names to ignore entirely */
    public static function IGNORE(): array
    {
        return ['@eaDir', '#recycle', '.DS_Store', 'Thumbs.db'];
    }

    /** App-specific names to skip from UI */
    public static function SKIP(): array
    {
        return ['trash','profile_pics'];
    }

    /** Optional regex patterns for additional ignores (env FR_IGNORE_REGEX). */
    private static function ignoreRegexes(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $raw = '';
        if (defined('FR_IGNORE_REGEX')) {
            $raw = (string)FR_IGNORE_REGEX;
        } else {
            $env = getenv('FR_IGNORE_REGEX');
            $raw = ($env !== false) ? (string)$env : '';
        }

        $raw = trim($raw);
        if ($raw === '') {
            $cache = [];
            return $cache;
        }

        $patterns = [];
        $lines = preg_split('/\r?\n/', $raw) ?: [];
        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line === '') {
                continue;
            }
            $pattern = self::normalizeIgnoreRegex($line);
            if ($pattern === null) {
                continue;
            }
            if (@preg_match($pattern, '') === false) {
                error_log('FR_IGNORE_REGEX ignored invalid pattern.');
                continue;
            }
            $patterns[] = $pattern;
        }

        $cache = $patterns;
        return $cache;
    }

    private static function normalizeIgnoreRegex(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return null;
        }

        $delim = $raw[0] ?? '';
        if ($delim !== '' && !ctype_alnum($delim) && $delim !== '\\') {
            $quoted = preg_quote($delim, '/');
            if (preg_match('/^' . $quoted . '.+' . $quoted . '[imsxuADU]*$/', $raw)) {
                return $raw;
            }
        }

        $wrap = '~';
        $safe = str_replace($wrap, '\\' . $wrap, $raw);
        return $wrap . $safe . $wrap;
    }

    public static function shouldIgnoreEntry(string $name, string $parentRel = ''): bool
    {
        if ($name === '') {
            return false;
        }
        if (in_array($name, self::IGNORE(), true)) {
            return true;
        }

        $regexes = self::ignoreRegexes();
        if (!$regexes) {
            return false;
        }

        $prefix = str_replace('\\', '/', trim((string)$parentRel));
        if ($prefix === '' || strtolower($prefix) === 'root') {
            $path = $name;
        } else {
            $prefix = trim($prefix, '/');
            $path = $prefix === '' ? $name : ($prefix . '/' . $name);
        }

        foreach ($regexes as $rx) {
            if (preg_match($rx, $name) === 1) {
                return true;
            }
            if ($path !== $name && preg_match($rx, $path) === 1) {
                return true;
            }
        }
        return false;
    }

    public static function isSafeSegment(string $name): bool
    {
        if ($name === '.' || $name === '..') {
            return false;
        }
        if (strpos($name, '/') !== false || strpos($name, '\\') !== false) {
            return false;
        }
        if (strpos($name, "\0") !== false) {
            return false;
        }
        if (preg_match('/[\x00-\x1F]/u', $name)) {
            return false;
        }
        $len = mb_strlen($name);
        return $len > 0 && $len <= 255;
    }

    /** realpath($p) and ensure it remains inside $base (defends symlink escape). */
    public static function safeReal(string $baseReal, string $p): ?string
    {
        $rp = realpath($p);
        if ($rp === false) {
            return null;
        }
        $base = rtrim($baseReal, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        $rp2  = rtrim($rp, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        if (strpos($rp2, $base) !== 0) {
            return null;
        }
        return rtrim($rp, DIRECTORY_SEPARATOR);
    }

    /**
     * Small bounded DFS to learn if an unreadable folder has any readable descendant (for “locked” rows).
     * $maxDepth intentionally small to avoid expensive scans.
     */
    public static function hasReadableDescendant(
        string $baseReal,
        string $absPath,
        string $relPath,
        string $user,
        array $perms,
        int $maxDepth = 2
    ): bool {
        if ($maxDepth <= 0 || !is_dir($absPath)) {
            return false;
        }

        $SKIP   = self::SKIP();

        $items = @scandir($absPath) ?: [];
        foreach ($items as $child) {
            if ($child === '.' || $child === '..') {
                continue;
            }
            if ($child[0] === '.') {
                continue;
            }
            if (self::shouldIgnoreEntry($child, $relPath)) {
                continue;
            }
            if (!self::isSafeSegment($child)) {
                continue;
            }

            $lower = strtolower($child);
            if (in_array($lower, $SKIP, true)) {
                continue;
            }

            $abs = $absPath . DIRECTORY_SEPARATOR . $child;
            if (!@is_dir($abs)) {
                continue;
            }

            // Resolve symlink safely
            if (@is_link($abs)) {
                $safe = self::safeReal($baseReal, $abs);
                if ($safe === null || !is_dir($safe)) {
                    continue;
                }
                $abs = $safe;
            }

            $rel = ($relPath === 'root') ? $child : ($relPath . '/' . $child);

            if (ACL::canRead($user, $perms, $rel) || ACL::canReadOwn($user, $perms, $rel)) {
                return true;
            }
            if ($maxDepth > 1 && self::hasReadableDescendant($baseReal, $abs, $rel, $user, $perms, $maxDepth - 1)) {
                return true;
            }
        }
        return false;
    }
}
