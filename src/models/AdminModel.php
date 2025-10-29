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
                case 'k': case 'kb': case 'kib':
                    $num *= 1024;
                    break;
                case 'm': case 'mb': case 'mib':
                    $num *= 1024 ** 2;
                    break;
                case 'g': case 'gb': case 'gib':
                    $num *= 1024 ** 3;
                    break;
                case 't': case 'tb': case 'tib':
                    $num *= 1024 ** 4;
                    break;
                case 'p': case 'pb': case 'pib':
                    $num *= 1024 ** 5;
                    break;
                case 'e': case 'eb': case 'eib':
                    $num *= 1024 ** 6;
                    break;
                case 'z': case 'zb': case 'zib':
                    $num *= 1024 ** 7;
                    break;
                case 'y': case 'yb': case 'yib':
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

    public static function buildPublicSubset(array $config): array
    {
        return [
            'header_title'        => $config['header_title'] ?? 'FileRise',
            'loginOptions'        => [
                'disableFormLogin' => (bool)($config['loginOptions']['disableFormLogin'] ?? false),
                'disableBasicAuth' => (bool)($config['loginOptions']['disableBasicAuth'] ?? false),
                'disableOIDCLogin' => (bool)($config['loginOptions']['disableOIDCLogin'] ?? false),
                // do NOT include authBypass/authHeaderName here — admin-only
            ],
            'globalOtpauthUrl'    => $config['globalOtpauthUrl'] ?? '',
            'enableWebDAV'        => (bool)($config['enableWebDAV'] ?? false),
            'sharedMaxUploadSize' => (int)($config['sharedMaxUploadSize'] ?? 0),
            'oidc' => [
                'providerUrl' => (string)($config['oidc']['providerUrl'] ?? ''),
                'redirectUri' => (string)($config['oidc']['redirectUri'] ?? ''),
                // never include clientId / clientSecret
            ],
        ];
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
            $required = ['providerUrl','clientId','clientSecret','redirectUri'];
            foreach ($required as $k) {
                if (empty($oidc[$k]) || !is_string($oidc[$k])) {
                    return ["error" => "Incomplete OIDC configuration (enable OIDC requires providerUrl, clientId, clientSecret, redirectUri)."];
                }
            }
        }

        // Ensure enableWebDAV flag is boolean (default to false if missing)
        $configUpdate['enableWebDAV'] = isset($configUpdate['enableWebDAV'])
            ? (bool)$configUpdate['enableWebDAV']
            : false;

        // Validate sharedMaxUploadSize if provided
        if (isset($configUpdate['sharedMaxUploadSize'])) {
            $sms = filter_var(
                $configUpdate['sharedMaxUploadSize'],
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
                ];
            } else {
                foreach (['providerUrl','clientId','clientSecret','redirectUri'] as $k) {
                    if (!isset($config['oidc'][$k]) || !is_string($config['oidc'][$k])) {
                        $config['oidc'][$k] = '';
                    }
                }
            }

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

            return $config;
        }

        // No config on disk; return defaults.
        return [
            'header_title'          => "FileRise",
            'oidc'                  => [
                'providerUrl'  => 'https://your-oidc-provider.com',
                'clientId'     => '',
                'clientSecret' => '',
                'redirectUri'  => 'https://yourdomain.com/api/auth/auth.php?oidc=callback'
            ],
            'loginOptions'          => [
                'disableFormLogin' => false,
                'disableBasicAuth' => true,
                'disableOIDCLogin' => true
            ],
            'globalOtpauthUrl'      => "",
            'enableWebDAV'          => false,
            'sharedMaxUploadSize'   => min(50 * 1024 * 1024, self::parseSize(TOTAL_UPLOAD_SIZE))
        ];
    }
}
