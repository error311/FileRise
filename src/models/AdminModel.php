<?php
// src/models/AdminModel.php

require_once PROJECT_ROOT . '/config/config.php';

class AdminModel
{
    /**
     * Parse a shorthand size value (e.g. "5G", "500M", "123K", "50MB", "10KiB") into bytes.
     * Accepts bare numbers (bytes) and common suffixes: K, KB, KiB, M, MB, MiB, G, GB, GiB, etc.
     *
     * @param string $val
     * @return int Bytes (rounded)
     */
    private static function parseSize(string $val): int
    {
        $val = trim($val);
        if ($val === '') {
            return 0;
        }

        // Match: number + optional unit/suffix (K, KB, KiB, M, MB, MiB, G, GB, GiB, ...)
        if (preg_match('/^\s*(\d+(?:\.\d+)?)\s*([kmgtpezy]?i?b?)?\s*$/i', $val, $m)) {
            $num  = (float)$m[1];
            $unit = strtolower($m[2] ?? '');

            switch ($unit) {
                case 'k':
                case 'kb':
                case 'kib':
                    $num *= 1024;
                    break;
                case 'm':
                case 'mb':
                case 'mib':
                    $num *= 1024 ** 2;
                    break;
                case 'g':
                case 'gb':
                case 'gib':
                    $num *= 1024 ** 3;
                    break;
                case 't':
                case 'tb':
                case 'tib':
                    $num *= 1024 ** 4;
                    break;
                case 'p':
                case 'pb':
                case 'pib':
                    $num *= 1024 ** 5;
                    break;
                case 'e':
                case 'eb':
                case 'eib':
                    $num *= 1024 ** 6;
                    break;
                case 'z':
                case 'zb':
                case 'zib':
                    $num *= 1024 ** 7;
                    break;
                case 'y':
                case 'yb':
                case 'yib':
                    $num *= 1024 ** 8;
                    break;
                // case 'b' or empty => bytes; do nothing
                default:
                    // If unit is just 'b' or empty, treat as bytes.
                    // For unknown units fall back to bytes.
                    break;
            }
            return (int) round($num);
        }

        // Fallback: cast any unrecognized input to int (bytes)
        return (int)$val;
    }

    /** Allow only http(s) URLs; return '' for invalid input. */
    private static function sanitizeHttpUrl($url): string
    {
        $url = trim((string)$url);
        if ($url === '') return '';
        $valid = filter_var($url, FILTER_VALIDATE_URL);
        if (!$valid) return '';
        $scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?: '');
        return ($scheme === 'http' || $scheme === 'https') ? $url : '';
    }

    /** Allow logo URLs that are either site-relative (/uploads/…) or http(s). */
    private static function sanitizeLogoUrl($url): string
    {
        $url = trim((string)$url);
        if ($url === '') return '';

        // Normalize plain relative paths (no scheme, no leading slash) to site-root form.
        if ($url[0] !== '/' && !preg_match('~^[a-z][a-z0-9+.\-]*:~i', $url)) {
            $url = '/' . ltrim($url, '/');
        }

        // 1) Site-relative like "/uploads/profile_pics/branding_foo.png"
        if ($url[0] === '/') {
            // Strip CRLF just in case
            $url = preg_replace('~[\r\n]+~', '', $url);
            // Don’t allow sneaky schemes embedded in a relative path
            if (strpos($url, '://') !== false) {
                return '';
            }
            return $url;
        }

        // 2) Fallback to plain http(s) validation
        return self::sanitizeHttpUrl($url);
    }

    private static function normalizeDefaultLanguage($lang): string
    {
        $lang = trim((string)$lang);
        $allowed = ['en', 'es', 'fr', 'de', 'pl', 'ru', 'ja', 'zh-CN'];
        return in_array($lang, $allowed, true) ? $lang : 'en';
    }

    public static function buildPublicSubset(array $config): array
    {
        $isProActive = (defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE === true);
        $proVersion = $config['pro']['version'] ?? ($config['proVersion'] ?? null);
        if (!$proVersion && defined('FR_PRO_BUNDLE_VERSION')) {
            $proVersion = FR_PRO_BUNDLE_VERSION;
        }
        $public = [
            'header_title'        => $config['header_title'] ?? 'FileRise',
            'loginOptions'        => [
                'disableFormLogin' => (bool)($config['loginOptions']['disableFormLogin'] ?? false),
                'disableBasicAuth' => (bool)($config['loginOptions']['disableBasicAuth'] ?? false),
                'disableOIDCLogin' => (bool)($config['loginOptions']['disableOIDCLogin'] ?? false),
            ],
            'globalOtpauthUrl'    => $config['globalOtpauthUrl'] ?? '',
            'enableWebDAV'        => (bool)($config['enableWebDAV'] ?? false),
            'sharedMaxUploadSize' => (int)($config['sharedMaxUploadSize'] ?? 0),
            'oidc' => [
                'providerUrl' => (string)($config['oidc']['providerUrl'] ?? ''),
                'redirectUri' => (string)($config['oidc']['redirectUri'] ?? ''),
            ],
            'branding' => [
                'customLogoUrl' => self::sanitizeLogoUrl(
                    $config['branding']['customLogoUrl'] ?? ''
                ),
                'headerBgLight' => self::sanitizeColorHex(
                    $config['branding']['headerBgLight'] ?? ''
                ),
                'headerBgDark'  => self::sanitizeColorHex(
                    $config['branding']['headerBgDark'] ?? ''
                ),
                'metaDescription' => self::sanitizeMetaDescription(
                    $config['branding']['metaDescription'] ?? ''
                ),
                'faviconSvg' => self::sanitizeLogoUrl(
                    $config['branding']['faviconSvg'] ?? ''
                ),
                'faviconPng' => self::sanitizeLogoUrl(
                    $config['branding']['faviconPng'] ?? ''
                ),
                'faviconIco' => self::sanitizeLogoUrl(
                    $config['branding']['faviconIco'] ?? ''
                ),
                'appleTouchIcon' => self::sanitizeLogoUrl(
                    $config['branding']['appleTouchIcon'] ?? ''
                ),
                'maskIcon' => self::sanitizeLogoUrl(
                    $config['branding']['maskIcon'] ?? ''
                ),
                'maskIconColor' => self::sanitizeColorHex(
                    $config['branding']['maskIconColor'] ?? ''
                ),
                'themeColorLight' => self::sanitizeColorHex(
                    $config['branding']['themeColorLight'] ?? ''
                ),
                'themeColorDark' => self::sanitizeColorHex(
                    $config['branding']['themeColorDark'] ?? ''
                ),
                'loginBgLight' => self::sanitizeCssBackground(
                    $config['branding']['loginBgLight'] ?? ''
                ),
                'loginBgDark' => self::sanitizeCssBackground(
                    $config['branding']['loginBgDark'] ?? ''
                ),
                'appBgLight' => self::sanitizeCssBackground(
                    $config['branding']['appBgLight'] ?? ''
                ),
                'appBgDark' => self::sanitizeCssBackground(
                    $config['branding']['appBgDark'] ?? ''
                ),
                'loginTagline' => self::sanitizeTagline(
                    $config['branding']['loginTagline'] ?? ''
                ),
                'footerHtml'    => (string)($config['branding']['footerHtml'] ?? ''),
            ],
            'demoMode' => (defined('FR_DEMO_MODE') && FR_DEMO_MODE),
        ];
        $uploadsCfg = (isset($config['uploads']) && is_array($config['uploads']))
            ? $config['uploads']
            : [];
        $resumableChunkMb = (isset($uploadsCfg['resumableChunkMb']) && is_numeric($uploadsCfg['resumableChunkMb']))
            ? (float)$uploadsCfg['resumableChunkMb']
            : 1.5;
        $public['uploads'] = [
            'resumableChunkMb' => max(0.5, min(100, $resumableChunkMb)),
        ];
        $displayCfg = (isset($config['display']) && is_array($config['display']))
            ? $config['display']
            : [];
        $hoverPreviewMaxImageMb = isset($displayCfg['hoverPreviewMaxImageMb'])
            ? (int)$displayCfg['hoverPreviewMaxImageMb']
            : 8;
        $hoverPreviewMaxVideoMb = isset($displayCfg['hoverPreviewMaxVideoMb'])
            ? (int)$displayCfg['hoverPreviewMaxVideoMb']
            : 200;
        $fileListSummaryDepth = isset($displayCfg['fileListSummaryDepth'])
            ? (int)$displayCfg['fileListSummaryDepth']
            : 2;
        $defaultLanguage = isset($displayCfg['defaultLanguage'])
            ? self::normalizeDefaultLanguage($displayCfg['defaultLanguage'])
            : 'en';
        $public['display'] = [
            'hoverPreviewMaxImageMb' => max(1, min(50, $hoverPreviewMaxImageMb)),
            'hoverPreviewMaxVideoMb' => max(1, min(2048, $hoverPreviewMaxVideoMb)),
            'fileListSummaryDepth' => max(0, min(10, $fileListSummaryDepth)),
            'defaultLanguage' => $defaultLanguage,
        ];

        // --- ONLYOFFICE public flag ---
        $ooEnabled = null;
        if (isset($config['onlyoffice']['enabled'])) {
            $ooEnabled = (bool)$config['onlyoffice']['enabled'];
        } elseif (defined('ONLYOFFICE_ENABLED')) {
            $ooEnabled = (bool)ONLYOFFICE_ENABLED;
        }

        $locked = defined('ONLYOFFICE_ENABLED')
            || defined('ONLYOFFICE_JWT_SECRET')
            || defined('ONLYOFFICE_DOCS_ORIGIN')
            || defined('ONLYOFFICE_PUBLIC_ORIGIN');

        if ($locked) {
            $ooEnabled = defined('ONLYOFFICE_ENABLED') ? (bool)ONLYOFFICE_ENABLED : false;
        } else {
            $ooEnabled = isset($config['onlyoffice']['enabled'])
                ? (bool)$config['onlyoffice']['enabled']
                : false;
        }

        $public['onlyoffice'] = ['enabled' => $ooEnabled];

        // Keep explicit demoMode override (no harm)
        $public['demoMode'] = defined('FR_DEMO_MODE') ? (bool)FR_DEMO_MODE : false;

        // ClamAV, mirroring AdminController::getConfig() logic ---
        $envScanRaw = getenv('VIRUS_SCAN_ENABLED');

        if ($envScanRaw !== false && $envScanRaw !== '') {
            // Env var wins
            $clamScanUploads = filter_var($envScanRaw, FILTER_VALIDATE_BOOLEAN);
            $clamLockedByEnv = true;
        } elseif (defined('VIRUS_SCAN_ENABLED')) {
            // Optional PHP constant override
            $clamScanUploads = (bool) VIRUS_SCAN_ENABLED;
            $clamLockedByEnv = true;
        } else {
            // Fall back to stored admin config
            $clamScanUploads = (bool)($config['clamav']['scanUploads'] ?? false);
            $clamLockedByEnv = false;
        }

        $envExcludeRaw = getenv('VIRUS_SCAN_EXCLUDE_DIRS');
        if ($envExcludeRaw !== false && trim((string)$envExcludeRaw) !== '') {
            $clamExcludeDirs = trim((string)$envExcludeRaw);
            $clamExcludeLockedByEnv = true;
        } else {
            $clamExcludeDirs = (string)($config['clamav']['excludeDirs'] ?? '');
            $clamExcludeLockedByEnv = false;
        }

        // Pro search (public awareness + env lock)
        $proSearchCfg = isset($config['proSearch']) && is_array($config['proSearch'])
            ? $config['proSearch']
            : [];
        $proApiLevel = defined('FR_PRO_API_LEVEL') ? (int)FR_PRO_API_LEVEL : 0;
        $proSearchApiOk = $isProActive && fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SEARCH);
        $proSearchExplicitDisabled = array_key_exists('enabled', $proSearchCfg) && !$proSearchCfg['enabled'];
        // Only respect opt-out when Pro is active; otherwise allow auto-enable after upgrade
        $proSearchOptOut = ($isProActive && !empty($proSearchCfg['optOut'])) || $proSearchExplicitDisabled;
        // Require Pro for Search Everywhere to remain on
        $proSearchEnabled = $isProActive && !empty($proSearchCfg['enabled']);
        $proSearchDefaultLimit = isset($proSearchCfg['defaultLimit']) ? (int)$proSearchCfg['defaultLimit'] : 50;
        $envProSearchRaw = getenv('FR_PRO_SEARCH_ENABLED');
        $proSearchLockedByEnv = ($envProSearchRaw !== false && $envProSearchRaw !== '');
        if ($proSearchLockedByEnv) {
            $val = strtolower(trim((string)$envProSearchRaw));
            $proSearchEnabled = in_array($val, ['1', 'true', 'yes', 'on'], true);
            // Env can only force-enable if Pro is active
            if (!$isProActive) {
                $proSearchEnabled = false;
            }
        } elseif ($proSearchApiOk && !$proSearchOptOut) {
            // Auto-enable for active Pro when the API level supports Search Everywhere
            $proSearchEnabled = true;
        }

        $public['clamav'] = [
            'scanUploads' => $clamScanUploads,
            'lockedByEnv' => $clamLockedByEnv,
            'excludeDirs' => $clamExcludeDirs,
            'excludeLockedByEnv' => $clamExcludeLockedByEnv,
        ];

        $public['proSearch'] = [
            'enabled'      => $proSearchEnabled,
            'defaultLimit' => max(1, min(200, $proSearchDefaultLimit)),
            'lockedByEnv'  => $proSearchLockedByEnv,
        ];

        if ($isProActive && class_exists('ProSources') && fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SOURCES)) {
            $public['storageSources'] = ProSources::getPublicConfig();
        } else {
            $public['storageSources'] = [
                'enabled' => false,
                'sources' => [],
            ];
        }

        $proAuditCfg = (isset($config['proAudit']) && is_array($config['proAudit']))
            ? $config['proAudit']
            : [];
        $proAuditAvailable = $isProActive && class_exists('ProAudit') && fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_AUDIT);
        $proAuditLevelRaw = isset($proAuditCfg['level']) ? (string)$proAuditCfg['level'] : 'standard';
        $proAuditLevel = ($proAuditLevelRaw === 'standard' || $proAuditLevelRaw === 'verbose') ? $proAuditLevelRaw : 'standard';
        $proAuditMaxFileMb = isset($proAuditCfg['maxFileMb']) ? (int)$proAuditCfg['maxFileMb'] : 200;
        $proAuditMaxFiles = isset($proAuditCfg['maxFiles']) ? (int)$proAuditCfg['maxFiles'] : 10;

        $public['proAudit'] = [
            'enabled'   => $proAuditAvailable && !empty($proAuditCfg['enabled']),
            'level'     => $proAuditLevel,
            'maxFileMb' => max(10, min(2048, $proAuditMaxFileMb)),
            'maxFiles'  => max(1, min(50, $proAuditMaxFiles)),
            'available' => $proAuditAvailable,
        ];

        $public['pro'] = [
            'active'  => $isProActive,
            'version' => is_string($proVersion) ? $proVersion : '',
            'apiLevel' => $proApiLevel,
        ];

        return $public;
    }

    /** Write USERS_DIR/siteConfig.json atomically (unencrypted). */
    public static function writeSiteConfig(array $publicSubset): array
    {
        $dest = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . 'siteConfig.json';
        $tmp  = $dest . '.tmp';

        $json = json_encode($publicSubset, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return ["error" => "Failed to encode siteConfig.json"];
        }

        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            return ["error" => "Failed to write temp siteConfig.json"];
        }

        if (!@rename($tmp, $dest)) {
            @unlink($tmp);
            return ["error" => "Failed to move siteConfig.json into place"];
        }

        @chmod($dest, 0664); // readable in bind mounts
        return ["success" => true];
    }

    /**
     * Updates the admin configuration file.
     *
     * @param array $configUpdate The configuration to update.
     * @return array Returns an array with "success" on success or "error" on failure.
     */
    public static function updateConfig(array $configUpdate): array
    {
        // Ensure encryption key exists
        if (empty($GLOBALS['encryptionKey']) || !is_string($GLOBALS['encryptionKey'])) {
            return ["error" => "Server encryption key is not configured."];
        }

        // Only enforce OIDC fields when OIDC is enabled
        $oidcDisabled = isset($configUpdate['loginOptions']['disableOIDCLogin'])
            ? (bool)$configUpdate['loginOptions']['disableOIDCLogin']
            : true; // default to disabled when not present

        if (!$oidcDisabled) {
            $oidc = $configUpdate['oidc'] ?? [];
            $publicClient = !empty($oidc['publicClient']);
            $required = ['providerUrl', 'clientId', 'redirectUri'];

            // Confidential clients still require a secret
            if (!$publicClient) {
                $required[] = 'clientSecret';
            }

            foreach ($required as $k) {
                if (empty($oidc[$k]) || !is_string($oidc[$k])) {
                    return ["error" => "Incomplete OIDC configuration (enable OIDC requires providerUrl, clientId, redirectUri" . ($publicClient ? '' : ', clientSecret') . "). If you want a blank secret, enable Public Client or disable OIDC login."];
                }
            }

            // Normalize secret handling for public clients (strip it when flagged)
            if ($publicClient) {
                $configUpdate['oidc']['clientSecret'] = '';
            }
            $configUpdate['oidc']['publicClient'] = $publicClient;
        }

        // Ensure enableWebDAV flag is boolean (default to false if missing)
        $configUpdate['enableWebDAV'] = isset($configUpdate['enableWebDAV'])
            ? (bool)$configUpdate['enableWebDAV']
            : false;

        // Validate sharedMaxUploadSize if provided
        if (array_key_exists('sharedMaxUploadSize', $configUpdate)) {
            $raw = $configUpdate['sharedMaxUploadSize'];

            // If blank or zero, treat as "no override" and drop the key
            if ($raw === '' || $raw === null || (int)$raw <= 0) {
                unset($configUpdate['sharedMaxUploadSize']);
            } else {
                $sms = filter_var(
                    $raw,
                    FILTER_VALIDATE_INT,
                    ["options" => ["min_range" => 1]]
                );
                if ($sms === false) {
                    return ["error" => "Invalid sharedMaxUploadSize."];
                }
                $totalBytes = self::parseSize(TOTAL_UPLOAD_SIZE);
                if ($sms > $totalBytes) {
                    return ["error" => "sharedMaxUploadSize must be ≤ TOTAL_UPLOAD_SIZE."];
                }
                $configUpdate['sharedMaxUploadSize'] = $sms;
            }
        }

        // ---- Upload tuning (Resumable.js) ----
        if (!isset($configUpdate['uploads']) || !is_array($configUpdate['uploads'])) {
            $configUpdate['uploads'] = [
                'resumableChunkMb' => 1.5,
            ];
        } else {
            $raw = $configUpdate['uploads']['resumableChunkMb'] ?? 1.5;
            $num = is_numeric($raw) ? (float)$raw : 1.5;
            $configUpdate['uploads']['resumableChunkMb'] = max(0.5, min(100, $num));
        }

        // ---- ClamAV (upload scan toggle + exclude list) ----
        if (!isset($configUpdate['clamav']) || !is_array($configUpdate['clamav'])) {
            $configUpdate['clamav'] = [
                'scanUploads' => false,
                'excludeDirs' => '',
            ];
        } else {
            $configUpdate['clamav']['scanUploads'] = !empty($configUpdate['clamav']['scanUploads']);
            $rawExclude = $configUpdate['clamav']['excludeDirs'] ?? '';
            if (!is_string($rawExclude)) {
                $rawExclude = '';
            }
            $rawExclude = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $rawExclude);
            $configUpdate['clamav']['excludeDirs'] = trim((string)$rawExclude);
        }

        // Normalize authBypass & authHeaderName
        if (!isset($configUpdate['loginOptions']['authBypass'])) {
            $configUpdate['loginOptions']['authBypass'] = false;
        }
        $configUpdate['loginOptions']['authBypass'] = (bool)$configUpdate['loginOptions']['authBypass'];

        if (
            !isset($configUpdate['loginOptions']['authHeaderName'])
            || !is_string($configUpdate['loginOptions']['authHeaderName'])
            || trim($configUpdate['loginOptions']['authHeaderName']) === ''
        ) {
            $configUpdate['loginOptions']['authHeaderName'] = 'X-Remote-User';
        } else {
            $configUpdate['loginOptions']['authHeaderName'] = trim($configUpdate['loginOptions']['authHeaderName']);
        }

        // ---- ONLYOFFICE (persist, sanitize; keep secret unless explicitly replaced) ----
        if (isset($configUpdate['onlyoffice']) && is_array($configUpdate['onlyoffice'])) {
            $oo = $configUpdate['onlyoffice'];

            $norm = [
                'enabled'      => (bool)($oo['enabled'] ?? false),
                'docsOrigin'   => self::sanitizeHttpUrl($oo['docsOrigin'] ?? ''),
                'publicOrigin' => self::sanitizeHttpUrl($oo['publicOrigin'] ?? ''),
            ];

            // Only accept a new secret if provided (non-empty). We do NOT clear on empty.
            if (array_key_exists('jwtSecret', $oo)) {
                $js = trim((string)$oo['jwtSecret']);
                if ($js !== '') {
                    if (strlen($js) > 1024) $js = substr($js, 0, 1024);
                    $norm['jwtSecret'] = $js; // will be encrypted with encryptData()
                }
            }

            $configUpdate['onlyoffice'] = $norm;
        }

        // Pro search toggle
        if (!isset($configUpdate['proSearch']) || !is_array($configUpdate['proSearch'])) {
            $configUpdate['proSearch'] = [
                'enabled' => true,
                'defaultLimit' => 50,
                'optOut' => false,
            ];
        } else {
            $configUpdate['proSearch']['enabled'] = !empty($configUpdate['proSearch']['enabled']);
            $lim = isset($configUpdate['proSearch']['defaultLimit'])
                ? (int)$configUpdate['proSearch']['defaultLimit']
                : 50;
            $configUpdate['proSearch']['defaultLimit'] = max(1, min(200, $lim));
            $configUpdate['proSearch']['optOut'] =
                (defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE)
                    ? !$configUpdate['proSearch']['enabled']
                    : false;
        }

        // Pro audit logging
        if (!isset($configUpdate['proAudit']) || !is_array($configUpdate['proAudit'])) {
            $configUpdate['proAudit'] = [
                'enabled' => false,
                'level' => 'standard',
                'maxFileMb' => 200,
                'maxFiles' => 10,
            ];
        } else {
            $configUpdate['proAudit']['enabled'] = !empty($configUpdate['proAudit']['enabled']);
            $levelRaw = isset($configUpdate['proAudit']['level']) ? (string)$configUpdate['proAudit']['level'] : 'standard';
            $configUpdate['proAudit']['level'] = ($levelRaw === 'standard' || $levelRaw === 'verbose') ? $levelRaw : 'standard';

            $maxFileMb = isset($configUpdate['proAudit']['maxFileMb']) ? (int)$configUpdate['proAudit']['maxFileMb'] : 200;
            $configUpdate['proAudit']['maxFileMb'] = max(10, min(2048, $maxFileMb));

            $maxFiles = isset($configUpdate['proAudit']['maxFiles']) ? (int)$configUpdate['proAudit']['maxFiles'] : 10;
            $configUpdate['proAudit']['maxFiles'] = max(1, min(50, $maxFiles));
        }

        if (!isset($configUpdate['display']) || !is_array($configUpdate['display'])) {
            $configUpdate['display'] = [
                'hoverPreviewMaxImageMb' => 8,
                'hoverPreviewMaxVideoMb' => 200,
                'fileListSummaryDepth' => 2,
            ];
        } else {
            $hoverPreviewMaxImageMb = isset($configUpdate['display']['hoverPreviewMaxImageMb'])
                ? (int)$configUpdate['display']['hoverPreviewMaxImageMb']
                : 8;
            $configUpdate['display']['hoverPreviewMaxImageMb'] = max(1, min(50, $hoverPreviewMaxImageMb));
            $hoverPreviewMaxVideoMb = isset($configUpdate['display']['hoverPreviewMaxVideoMb'])
                ? (int)$configUpdate['display']['hoverPreviewMaxVideoMb']
                : 200;
            $configUpdate['display']['hoverPreviewMaxVideoMb'] = max(1, min(2048, $hoverPreviewMaxVideoMb));
            $fileListSummaryDepth = isset($configUpdate['display']['fileListSummaryDepth'])
                ? (int)$configUpdate['display']['fileListSummaryDepth']
                : 2;
            $configUpdate['display']['fileListSummaryDepth'] = max(0, min(10, $fileListSummaryDepth));
        }

        if (!isset($configUpdate['branding']) || !is_array($configUpdate['branding'])) {
            $configUpdate['branding'] = [
                'customLogoUrl'   => '',
                'headerBgLight'   => '',
                'headerBgDark'    => '',
                'metaDescription' => '',
                'faviconSvg'      => '',
                'faviconPng'      => '',
                'faviconIco'      => '',
                'appleTouchIcon'  => '',
                'maskIcon'        => '',
                'maskIconColor'   => '',
                'themeColorLight' => '',
                'themeColorDark'  => '',
                'loginBgLight'    => '',
                'loginBgDark'     => '',
                'appBgLight'      => '',
                'appBgDark'       => '',
                'loginTagline'    => '',
                'footerHtml'      => '',
            ];
        } else {
            $logo   = self::sanitizeLogoUrl($configUpdate['branding']['customLogoUrl'] ?? '');
            $light  = self::sanitizeColorHex($configUpdate['branding']['headerBgLight'] ?? '');
            $dark   = self::sanitizeColorHex($configUpdate['branding']['headerBgDark'] ?? '');
            $metaDescription = self::sanitizeMetaDescription(
                $configUpdate['branding']['metaDescription'] ?? ''
            );
            $faviconSvg = self::sanitizeLogoUrl($configUpdate['branding']['faviconSvg'] ?? '');
            $faviconPng = self::sanitizeLogoUrl($configUpdate['branding']['faviconPng'] ?? '');
            $faviconIco = self::sanitizeLogoUrl($configUpdate['branding']['faviconIco'] ?? '');
            $appleTouchIcon = self::sanitizeLogoUrl($configUpdate['branding']['appleTouchIcon'] ?? '');
            $maskIcon = self::sanitizeLogoUrl($configUpdate['branding']['maskIcon'] ?? '');
            $maskIconColor = self::sanitizeColorHex($configUpdate['branding']['maskIconColor'] ?? '');
            $themeColorLight = self::sanitizeColorHex($configUpdate['branding']['themeColorLight'] ?? '');
            $themeColorDark = self::sanitizeColorHex($configUpdate['branding']['themeColorDark'] ?? '');
            $loginBgLight = self::sanitizeCssBackground($configUpdate['branding']['loginBgLight'] ?? '');
            $loginBgDark = self::sanitizeCssBackground($configUpdate['branding']['loginBgDark'] ?? '');
            $appBgLight = self::sanitizeCssBackground($configUpdate['branding']['appBgLight'] ?? '');
            $appBgDark = self::sanitizeCssBackground($configUpdate['branding']['appBgDark'] ?? '');
            $loginTagline = self::sanitizeTagline($configUpdate['branding']['loginTagline'] ?? '');
            $footer = trim((string)($configUpdate['branding']['footerHtml'] ?? ''));

            if (defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE) {
                $configUpdate['branding']['customLogoUrl'] = $logo;
                $configUpdate['branding']['headerBgLight'] = $light;
                $configUpdate['branding']['headerBgDark']  = $dark;
                $configUpdate['branding']['metaDescription'] = $metaDescription;
                $configUpdate['branding']['faviconSvg'] = $faviconSvg;
                $configUpdate['branding']['faviconPng'] = $faviconPng;
                $configUpdate['branding']['faviconIco'] = $faviconIco;
                $configUpdate['branding']['appleTouchIcon'] = $appleTouchIcon;
                $configUpdate['branding']['maskIcon'] = $maskIcon;
                $configUpdate['branding']['maskIconColor'] = $maskIconColor;
                $configUpdate['branding']['themeColorLight'] = $themeColorLight;
                $configUpdate['branding']['themeColorDark'] = $themeColorDark;
                $configUpdate['branding']['loginBgLight'] = $loginBgLight;
                $configUpdate['branding']['loginBgDark'] = $loginBgDark;
                $configUpdate['branding']['appBgLight'] = $appBgLight;
                $configUpdate['branding']['appBgDark'] = $appBgDark;
                $configUpdate['branding']['loginTagline'] = $loginTagline;
                $configUpdate['branding']['footerHtml']    = $footer;
            } else {
                $configUpdate['branding']['customLogoUrl'] = '';
                $configUpdate['branding']['headerBgLight'] = '';
                $configUpdate['branding']['headerBgDark']  = '';
                $configUpdate['branding']['metaDescription'] = '';
                $configUpdate['branding']['faviconSvg'] = '';
                $configUpdate['branding']['faviconPng'] = '';
                $configUpdate['branding']['faviconIco'] = '';
                $configUpdate['branding']['appleTouchIcon'] = '';
                $configUpdate['branding']['maskIcon'] = '';
                $configUpdate['branding']['maskIconColor'] = '';
                $configUpdate['branding']['themeColorLight'] = '';
                $configUpdate['branding']['themeColorDark'] = '';
                $configUpdate['branding']['loginBgLight'] = '';
                $configUpdate['branding']['loginBgDark'] = '';
                $configUpdate['branding']['appBgLight'] = '';
                $configUpdate['branding']['appBgDark'] = '';
                $configUpdate['branding']['loginTagline'] = '';
                $configUpdate['branding']['footerHtml']    = '';
            }
        }

        // Ignore regex (optional)
        $configUpdate['ignoreRegex'] = self::sanitizeIgnoreRegex(
            $configUpdate['ignoreRegex'] ?? ''
        );

        // Convert configuration to JSON.
        $plainTextConfig = json_encode($configUpdate, JSON_PRETTY_PRINT);
        if ($plainTextConfig === false) {
            return ["error" => "Failed to encode configuration to JSON."];
        }

        // Encrypt configuration.
        $encryptedContent = encryptData($plainTextConfig, $GLOBALS['encryptionKey']);
        if ($encryptedContent === false) {
            return ["error" => "Failed to encrypt configuration."];
        }

        // Define the configuration file path.
        $configFile = USERS_DIR . 'adminConfig.json';

        // Attempt to write the new configuration.
        if (file_put_contents($configFile, $encryptedContent, LOCK_EX) === false) {
            // Attempt a cleanup: delete the old file and try again.
            if (file_exists($configFile)) {
                @unlink($configFile);
            }
            if (file_put_contents($configFile, $encryptedContent, LOCK_EX) === false) {
                error_log("AdminModel::updateConfig: Failed to write configuration even after deletion.");
                return ["error" => "Failed to update configuration even after cleanup."];
            }
        }
        // Best-effort normalize perms for host visibility (user rw, group rw)
        @chmod($configFile, 0664);

        $public = self::buildPublicSubset($configUpdate);
        $w = self::writeSiteConfig($public);
        // Don’t fail the whole update if public cache write had a minor issue.
        if (isset($w['error'])) {
            // Log but keep success for admin write
            error_log("AdminModel::writeSiteConfig warning: " . $w['error']);
        }

        return ["success" => "Configuration updated successfully."];
    }

    private static function sanitizeColorHex($value): string
    {
        $value = trim((string)$value);
        if ($value === '') return '';

        // allow #RGB or #RRGGBB (or without leading #)
        if (preg_match('/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value, $m)) {
            return '#' . strtoupper($m[1]);
        }

        // allow basic rgb()/rgba()/hsl()/hsla() syntaxes
        $clean = preg_replace('/\s+/', ' ', $value);
        if (preg_match('/^(rgb|rgba|hsl|hsla)\([0-9%.,\s]+\)$/i', $clean)) {
            return $clean;
        }

        // allow a few safe keywords
        $lower = strtolower($clean);
        $keywords = ['transparent', 'black', 'white', 'red', 'green', 'blue', 'gray', 'grey'];
        if (in_array($lower, $keywords, true)) {
            return $lower;
        }
        return '';
    }

    private static function sanitizeMetaDescription($value): string
    {
        $text = trim((string)$value);
        if ($text === '') return '';
        $text = preg_replace('/[\x00-\x1F\x7F]/', ' ', $text);
        $text = preg_replace('/\s+/', ' ', (string)$text);
        if (strlen($text) > 320) {
            $text = substr($text, 0, 320);
        }
        return trim($text);
    }

    private static function sanitizeTagline($value): string
    {
        $text = trim((string)$value);
        if ($text === '') return '';
        $text = preg_replace('/[\x00-\x1F\x7F]/', ' ', $text);
        $text = preg_replace('/\s+/', ' ', (string)$text);
        if (strlen($text) > 200) {
            $text = substr($text, 0, 200);
        }
        return trim($text);
    }

    private static function sanitizeCssBackground($value): string
    {
        $text = trim((string)$value);
        if ($text === '') return '';
        $text = preg_replace('/[\x00-\x1F\x7F]/', ' ', $text);
        $text = preg_replace('/\s+/', ' ', (string)$text);
        if (strlen($text) > 500) {
            $text = substr($text, 0, 500);
        }
        return trim($text);
    }

    private static function sanitizeIgnoreRegex($value): string
    {
        $value = str_replace(["\r\n", "\r"], "\n", trim((string)$value));
        if ($value === '') return '';
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
        if (strlen($value) > 2000) {
            $value = substr($value, 0, 2000);
        }
        return $value;
    }

    /**
     * Retrieves the current configuration.
     *
     * @return array The configuration array, or defaults if not found.
     */
    public static function getConfig(): array
    {
        $configFile = USERS_DIR . 'adminConfig.json';

        if (file_exists($configFile)) {
            $encryptedContent = file_get_contents($configFile);
            $decryptedContent = decryptData($encryptedContent, $GLOBALS['encryptionKey']);
            if ($decryptedContent === false) {
                // Do not set HTTP status here; let the controller decide.
                return ["error" => "Failed to decrypt configuration."];
            }

            $config = json_decode($decryptedContent, true);
            if (!is_array($config)) {
                $config = [];
            }

            // Normalize login options if missing
            if (!isset($config['loginOptions'])) {
                // Migrate legacy top-level flags; default OIDC to true (disabled)
                $config['loginOptions'] = [
                    'disableFormLogin' => isset($config['disableFormLogin']) ? (bool)$config['disableFormLogin'] : false,
                    'disableBasicAuth' => isset($config['disableBasicAuth']) ? (bool)$config['disableBasicAuth'] : false,
                    'disableOIDCLogin' => isset($config['disableOIDCLogin']) ? (bool)$config['disableOIDCLogin'] : true,
                ];
                unset($config['disableFormLogin'], $config['disableBasicAuth'], $config['disableOIDCLogin']);
            } else {
                // Normalize booleans; default OIDC to true (disabled) if missing
                $lo = &$config['loginOptions'];
                $lo['disableFormLogin'] = isset($lo['disableFormLogin']) ? (bool)$lo['disableFormLogin'] : false;
                $lo['disableBasicAuth'] = isset($lo['disableBasicAuth']) ? (bool)$lo['disableBasicAuth'] : false;
                $lo['disableOIDCLogin'] = isset($lo['disableOIDCLogin']) ? (bool)$lo['disableOIDCLogin'] : true;
            }

            // Ensure OIDC structure exists
            if (!isset($config['oidc']) || !is_array($config['oidc'])) {
                $config['oidc'] = [
                    'providerUrl'  => '',
                    'clientId'     => '',
                    'clientSecret' => '',
                    'redirectUri'  => '',
                    'debugLogging' => false,
                    'allowDemote'  => false,
                    'publicClient' => false,
                ];
            } else {
                foreach (['providerUrl', 'clientId', 'clientSecret', 'redirectUri'] as $k) {
                    if (!isset($config['oidc'][$k]) || !is_string($config['oidc'][$k])) {
                        $config['oidc'][$k] = '';
                    }
                }
                if (!array_key_exists('publicClient', $config['oidc'])) {
                    $config['oidc']['publicClient'] = false;
                } else {
                    $config['oidc']['publicClient'] = !empty($config['oidc']['publicClient']);
                }
            }

            $config['oidc']['debugLogging'] = !empty($config['oidc']['debugLogging']);
            $config['oidc']['allowDemote'] = !empty($config['oidc']['allowDemote']);
            // Normalize authBypass & authHeaderName
            if (!array_key_exists('authBypass', $config['loginOptions'])) {
                $config['loginOptions']['authBypass'] = false;
            } else {
                $config['loginOptions']['authBypass'] = (bool)$config['loginOptions']['authBypass'];
            }
            if (
                !array_key_exists('authHeaderName', $config['loginOptions'])
                || !is_string($config['loginOptions']['authHeaderName'])
                || trim($config['loginOptions']['authHeaderName']) === ''
            ) {
                $config['loginOptions']['authHeaderName'] = 'X-Remote-User';
            }

            // Default values for other keys
            if (!isset($config['globalOtpauthUrl'])) {
                $config['globalOtpauthUrl'] = "";
            }
            if (!isset($config['header_title']) || $config['header_title'] === '') {
                $config['header_title'] = "FileRise";
            }
            if (!isset($config['enableWebDAV'])) {
                $config['enableWebDAV'] = false;
            }

            // sharedMaxUploadSize: default if missing; clamp if present
            $maxBytes = self::parseSize(TOTAL_UPLOAD_SIZE);
            if (!isset($config['sharedMaxUploadSize']) || !is_numeric($config['sharedMaxUploadSize']) || $config['sharedMaxUploadSize'] < 1) {
                $config['sharedMaxUploadSize'] = min(50 * 1024 * 1024, $maxBytes);
            } else {
                $config['sharedMaxUploadSize'] = (int)min((int)$config['sharedMaxUploadSize'], $maxBytes);
            }

            // Upload tuning (Resumable.js chunk size in MB)
            if (!isset($config['uploads']) || !is_array($config['uploads'])) {
                $config['uploads'] = [
                    'resumableChunkMb' => 1.5,
                ];
            } else {
                $raw = $config['uploads']['resumableChunkMb'] ?? 1.5;
                $num = is_numeric($raw) ? (float)$raw : 1.5;
                $config['uploads']['resumableChunkMb'] = max(0.5, min(100, $num));
            }

            // ---- Ensure ONLYOFFICE structure exists, sanitize values ----
            if (!isset($config['onlyoffice']) || !is_array($config['onlyoffice'])) {
                $config['onlyoffice'] = [
                    'enabled'      => false,
                    'docsOrigin'   => '',
                    'publicOrigin' => '',
                ];
            } else {
                $config['onlyoffice']['enabled']      = (bool)($config['onlyoffice']['enabled'] ?? false);
                $config['onlyoffice']['docsOrigin']   = self::sanitizeHttpUrl($config['onlyoffice']['docsOrigin'] ?? '');
                $config['onlyoffice']['publicOrigin'] = self::sanitizeHttpUrl($config['onlyoffice']['publicOrigin'] ?? '');
            }

            // Pro search toggle
            if (!isset($config['proSearch']) || !is_array($config['proSearch'])) {
                $config['proSearch'] = [
                    'enabled' => true,
                    'defaultLimit' => 50,
                    'optOut' => false,
                ];
            } else {
                $config['proSearch']['enabled'] = !empty($config['proSearch']['enabled']);
                $lim = isset($config['proSearch']['defaultLimit'])
                    ? (int)$config['proSearch']['defaultLimit']
                    : 50;
                $config['proSearch']['defaultLimit'] = max(1, min(200, $lim));
                $config['proSearch']['optOut'] = !empty($config['proSearch']['optOut']);
                $explicitDisabled = array_key_exists('enabled', $config['proSearch']) && !$config['proSearch']['enabled'];
                // Auto-enable for active Pro when the API level supports Search Everywhere
                $isProActive = defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE === true;
                $proSearchApiOk = $isProActive && fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SEARCH);
                if ($proSearchApiOk && empty($config['proSearch']['optOut']) && !$explicitDisabled) {
                    $config['proSearch']['enabled'] = true;
                }
            }

            // Pro audit logging config
            if (!isset($config['proAudit']) || !is_array($config['proAudit'])) {
                $config['proAudit'] = [
                    'enabled' => false,
                    'level' => 'standard',
                    'maxFileMb' => 200,
                    'maxFiles' => 10,
                ];
            } else {
                $config['proAudit']['enabled'] = !empty($config['proAudit']['enabled']);
                $levelRaw = isset($config['proAudit']['level']) ? (string)$config['proAudit']['level'] : 'standard';
                $config['proAudit']['level'] = ($levelRaw === 'standard' || $levelRaw === 'verbose') ? $levelRaw : 'standard';
                $maxFileMb = isset($config['proAudit']['maxFileMb']) ? (int)$config['proAudit']['maxFileMb'] : 200;
                $config['proAudit']['maxFileMb'] = max(10, min(2048, $maxFileMb));
                $maxFiles = isset($config['proAudit']['maxFiles']) ? (int)$config['proAudit']['maxFiles'] : 10;
                $config['proAudit']['maxFiles'] = max(1, min(50, $maxFiles));
            }

            if (!isset($config['display']) || !is_array($config['display'])) {
                $config['display'] = [
                    'hoverPreviewMaxImageMb' => 8,
                    'hoverPreviewMaxVideoMb' => 200,
                    'fileListSummaryDepth' => 2,
                    'defaultLanguage' => 'en',
                ];
            } else {
                $hoverPreviewMaxImageMb = isset($config['display']['hoverPreviewMaxImageMb'])
                    ? (int)$config['display']['hoverPreviewMaxImageMb']
                    : 8;
                $config['display']['hoverPreviewMaxImageMb'] = max(1, min(50, $hoverPreviewMaxImageMb));
                $hoverPreviewMaxVideoMb = isset($config['display']['hoverPreviewMaxVideoMb'])
                    ? (int)$config['display']['hoverPreviewMaxVideoMb']
                    : 200;
                $config['display']['hoverPreviewMaxVideoMb'] = max(1, min(2048, $hoverPreviewMaxVideoMb));
                $fileListSummaryDepth = isset($config['display']['fileListSummaryDepth'])
                    ? (int)$config['display']['fileListSummaryDepth']
                    : 2;
                $config['display']['fileListSummaryDepth'] = max(0, min(10, $fileListSummaryDepth));
                $config['display']['defaultLanguage'] = self::normalizeDefaultLanguage(
                    $config['display']['defaultLanguage'] ?? 'en'
                );
            }

            // Branding
            if (!isset($config['branding']) || !is_array($config['branding'])) {
                $config['branding'] = [
                    'customLogoUrl' => '',
                    'headerBgLight' => '',
                    'headerBgDark'  => '',
                    'metaDescription' => '',
                    'faviconSvg' => '',
                    'faviconPng' => '',
                    'faviconIco' => '',
                    'appleTouchIcon' => '',
                    'maskIcon' => '',
                    'maskIconColor' => '',
                    'themeColorLight' => '',
                    'themeColorDark' => '',
                    'loginBgLight' => '',
                    'loginBgDark' => '',
                    'appBgLight' => '',
                    'appBgDark' => '',
                    'loginTagline' => '',
                    'footerHtml'    => '',
                ];
            } else {
                $config['branding']['customLogoUrl'] = self::sanitizeLogoUrl(
                    $config['branding']['customLogoUrl'] ?? ''
                );
                $config['branding']['headerBgLight'] = self::sanitizeColorHex(
                    $config['branding']['headerBgLight'] ?? ''
                );
                $config['branding']['headerBgDark'] = self::sanitizeColorHex(
                    $config['branding']['headerBgDark'] ?? ''
                );
                $config['branding']['metaDescription'] = self::sanitizeMetaDescription(
                    $config['branding']['metaDescription'] ?? ''
                );
                $config['branding']['faviconSvg'] = self::sanitizeLogoUrl(
                    $config['branding']['faviconSvg'] ?? ''
                );
                $config['branding']['faviconPng'] = self::sanitizeLogoUrl(
                    $config['branding']['faviconPng'] ?? ''
                );
                $config['branding']['faviconIco'] = self::sanitizeLogoUrl(
                    $config['branding']['faviconIco'] ?? ''
                );
                $config['branding']['appleTouchIcon'] = self::sanitizeLogoUrl(
                    $config['branding']['appleTouchIcon'] ?? ''
                );
                $config['branding']['maskIcon'] = self::sanitizeLogoUrl(
                    $config['branding']['maskIcon'] ?? ''
                );
                $config['branding']['maskIconColor'] = self::sanitizeColorHex(
                    $config['branding']['maskIconColor'] ?? ''
                );
                $config['branding']['themeColorLight'] = self::sanitizeColorHex(
                    $config['branding']['themeColorLight'] ?? ''
                );
                $config['branding']['themeColorDark'] = self::sanitizeColorHex(
                    $config['branding']['themeColorDark'] ?? ''
                );
                $config['branding']['loginBgLight'] = self::sanitizeCssBackground(
                    $config['branding']['loginBgLight'] ?? ''
                );
                $config['branding']['loginBgDark'] = self::sanitizeCssBackground(
                    $config['branding']['loginBgDark'] ?? ''
                );
                $config['branding']['appBgLight'] = self::sanitizeCssBackground(
                    $config['branding']['appBgLight'] ?? ''
                );
                $config['branding']['appBgDark'] = self::sanitizeCssBackground(
                    $config['branding']['appBgDark'] ?? ''
                );
                $config['branding']['loginTagline'] = self::sanitizeTagline(
                    $config['branding']['loginTagline'] ?? ''
                );
            }

            // ---- ClamAV: ensure structure exists ----
            if (!isset($config['clamav']) || !is_array($config['clamav'])) {
                $config['clamav'] = [
                    'scanUploads' => false,
                ];
            } else {
                $config['clamav']['scanUploads'] = !empty($config['clamav']['scanUploads']);
            }

            // ---- Published URL (optional): used for generating share links behind proxies/subpaths ----
            if (!isset($config['publishedUrl']) || !is_string($config['publishedUrl'])) {
                $config['publishedUrl'] = '';
            } else {
                $config['publishedUrl'] = self::sanitizeHttpUrl($config['publishedUrl']);
            }

            // ---- FFmpeg path (optional): used for video thumbnails ----
            if (!isset($config['ffmpegPath']) || !is_string($config['ffmpegPath'])) {
                $config['ffmpegPath'] = '';
            } else {
                $path = trim($config['ffmpegPath']);
                $path = preg_replace('/[\x00-\x1F\x7F]/', '', $path);
                if (strlen($path) > 1024) {
                    $path = substr($path, 0, 1024);
                }
                $config['ffmpegPath'] = $path;
            }

            if (!isset($config['ignoreRegex']) || !is_string($config['ignoreRegex'])) {
                $config['ignoreRegex'] = '';
            } else {
                $config['ignoreRegex'] = self::sanitizeIgnoreRegex($config['ignoreRegex']);
            }

            return $config;
        }

        // No config on disk; return defaults.
        return [
            'header_title'          => "FileRise",
            'oidc'                  => [
                'providerUrl'  => 'https://your-oidc-provider.com',
                'clientId'     => '',
                'clientSecret' => '',
                'redirectUri'  => 'https://yourdomain.com/api/auth/auth.php?oidc=callback',
                'debugLogging' => false,
                'allowDemote'  => false,
                'publicClient' => false,
            ],
            'loginOptions'          => [
                'disableFormLogin' => false,
                'disableBasicAuth' => true,
                'disableOIDCLogin' => true
            ],
            'globalOtpauthUrl'      => "",
            'enableWebDAV'          => false,
            'sharedMaxUploadSize'   => min(50 * 1024 * 1024, self::parseSize(TOTAL_UPLOAD_SIZE)),
            'uploads'               => [
                'resumableChunkMb' => 1.5,
            ],
            'onlyoffice'            => [
                'enabled'      => false,
                'docsOrigin'   => '',
                'publicOrigin' => '',
            ],
            'proSearch'             => [
                'enabled' => true,
                'defaultLimit' => 50,
            ],
            'proAudit'              => [
                'enabled' => false,
                'level' => 'standard',
                'maxFileMb' => 200,
                'maxFiles' => 10,
            ],
            'display'               => [
                'hoverPreviewMaxImageMb' => 8,
                'hoverPreviewMaxVideoMb' => 200,
                'fileListSummaryDepth' => 2,
                'defaultLanguage' => 'en',
            ],
            'branding'              => [
                'customLogoUrl' => '',
                'headerBgLight'   => '',
                'headerBgDark'    => '',
                'metaDescription' => '',
                'faviconSvg' => '',
                'faviconPng' => '',
                'faviconIco' => '',
                'appleTouchIcon' => '',
                'maskIcon' => '',
                'maskIconColor' => '',
                'themeColorLight' => '',
                'themeColorDark' => '',
                'loginBgLight' => '',
                'loginBgDark' => '',
                'appBgLight' => '',
                'appBgDark' => '',
                'loginTagline' => '',
                'footerHtml'    => '',
            ],
            'clamav'                => [
                'scanUploads' => false,
                'excludeDirs' => '',
            ],
            'publishedUrl'          => '',
            'ffmpegPath'            => '',
            'ignoreRegex'           => '',
        ];
    }
}
