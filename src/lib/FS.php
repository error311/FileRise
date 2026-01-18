<?php
// src/lib/FS.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

final class FS
{
    /** Hidden/system names to ignore entirely */
    public static function IGNORE(): array {
        $raw = '';
        if (defined('FR_IGNORE_NAMES')) {
            $raw = FR_IGNORE_NAMES;
        } else {
            $env = getenv('FR_IGNORE_NAMES');
            if ($env !== false && $env !== '') {
                $raw = $env;
            }
        }

        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $parts = array_map('trim', explode(',', $raw));
        return array_values(array_filter($parts, fn($part) => $part !== ''));
    }

    /** App-specific names to skip from UI */
    public static function SKIP(): array {
        return ['trash','profile_pics'];
    }

    public static function isSafeSegment(string $name): bool {
        if ($name === '.' || $name === '..') return false;
        if (strpos($name, '/') !== false || strpos($name, '\\') !== false) return false;
        if (strpos($name, "\0") !== false) return false;
        if (preg_match('/[\x00-\x1F]/u', $name)) return false;
        $len = mb_strlen($name);
        return $len > 0 && $len <= 255;
    }

    /** realpath($p) and ensure it remains inside $base (defends symlink escape). */
    public static function safeReal(string $baseReal, string $p): ?string {
        $rp = realpath($p);
        if ($rp === false) return null;
        $base = rtrim($baseReal, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        $rp2  = rtrim($rp, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        if (strpos($rp2, $base) !== 0) return null;
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
        array  $perms,
        int    $maxDepth = 2
    ): bool {
        if ($maxDepth <= 0 || !is_dir($absPath)) return false;

        $IGNORE = self::IGNORE();
        $SKIP   = self::SKIP();

        $items = @scandir($absPath) ?: [];
        foreach ($items as $child) {
            if ($child === '.' || $child === '..') continue;
            if ($child[0] === '.') continue;
            if (in_array($child, $IGNORE, true)) continue;
            if (!self::isSafeSegment($child)) continue;

            $lower = strtolower($child);
            if (in_array($lower, $SKIP, true)) continue;

            $abs = $absPath . DIRECTORY_SEPARATOR . $child;
            if (!@is_dir($abs)) continue;

            // Resolve symlink safely
            if (@is_link($abs)) {
                $safe = self::safeReal($baseReal, $abs);
                if ($safe === null || !is_dir($safe)) continue;
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
