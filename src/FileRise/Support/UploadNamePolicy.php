<?php

declare(strict_types=1);

namespace FileRise\Support;

use FileRise\Domain\AdminModel;

final class UploadNamePolicy
{
    public const MODE_STRICT = 'strict';
    public const MODE_CODE_FRIENDLY = 'code_friendly';

    private const ALWAYS_BLOCKED_FILENAMES = [
        '.htaccess',
        '.user.ini',
        'web.config',
    ];

    private const STRICT_BLOCKED_EXTENSIONS = [
        'asp',
        'aspx',
        'bash',
        'cgi',
        'fcgi',
        'jsp',
        'jspx',
        'phar',
        'php',
        'php3',
        'php4',
        'php5',
        'php7',
        'php8',
        'pht',
        'phps',
        'phtml',
        'pl',
        'py',
        'sh',
        'shtml',
    ];

    private static ?string $cachedMode = null;

    public static function normalizeMode($mode): string
    {
        $value = strtolower(trim((string)$mode));
        if ($value === self::MODE_CODE_FRIENDLY) {
            return self::MODE_CODE_FRIENDLY;
        }
        return self::MODE_STRICT;
    }

    public static function getConfiguredMode(): string
    {
        if (self::$cachedMode !== null) {
            return self::$cachedMode;
        }

        $mode = self::MODE_STRICT;
        if (class_exists(AdminModel::class)) {
            $config = AdminModel::getConfig();
            if (is_array($config) && !isset($config['error'])) {
                $mode = self::normalizeMode($config['safeUploadPolicy'] ?? self::MODE_STRICT);
            }
        }

        self::$cachedMode = $mode;
        return self::$cachedMode;
    }

    public static function isAllowedForWrite(string $fileName, ?string $mode = null): bool
    {
        $fileName = basename(trim($fileName));
        if ($fileName === '' || !preg_match((string)REGEX_FILE_NAME, $fileName)) {
            return false;
        }

        $lowerName = strtolower($fileName);
        if (in_array($lowerName, self::ALWAYS_BLOCKED_FILENAMES, true)) {
            return false;
        }

        $effectiveMode = self::normalizeMode($mode ?? self::getConfiguredMode());
        if ($effectiveMode === self::MODE_CODE_FRIENDLY) {
            return true;
        }

        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if ($ext !== '' && in_array($ext, self::STRICT_BLOCKED_EXTENSIONS, true)) {
            return false;
        }

        return true;
    }
}
