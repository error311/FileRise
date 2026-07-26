<?php

declare(strict_types=1);

namespace FileRise\Support;

final class LogicalPathPolicy
{
    private const MAX_DECODE_PASSES = 3;

    public static function isSafeFolder(string $folder): bool
    {
        $folder = trim($folder);
        if ($folder === '' || strcasecmp($folder, 'root') === 0) {
            return true;
        }

        if (self::hasUnsafeDotSegments($folder)) {
            return false;
        }

        return preg_match(REGEX_FOLDER_NAME, $folder) === 1;
    }

    public static function hasUnsafeDotSegments(string $path): bool
    {
        $candidate = str_replace('\\', '/', trim($path));

        for ($pass = 0; $pass <= self::MAX_DECODE_PASSES; $pass++) {
            foreach (explode('/', $candidate) as $segment) {
                if ($segment === '.' || $segment === '..') {
                    return true;
                }
            }

            $decoded = rawurldecode($candidate);
            if ($decoded === $candidate) {
                break;
            }
            $candidate = str_replace('\\', '/', $decoded);
        }

        return false;
    }
}
