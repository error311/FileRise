<?php
// src/models/AdminModel.php

require_once PROJECT_ROOT . '/config/config.php';

class AdminModel
{
    /**
     * Parse a shorthand size value (e.g. "5G", "500M", "123K") into bytes.
     *
     * @param string $val
     * @return int
     */
    private static function parseSize(string $val): int
    {
        $unit = strtolower(substr($val, -1));
        $num  = (int) rtrim($val, 'bkmgtpezyBKMGTPESY');
        switch ($unit) {
            case 'g':
                return $num * 1024 ** 3;
            case 'm':
                return $num * 1024 ** 2;
            case 'k':
                return $num * 1024;
            default:
                return $num;
        }
    }

    /**
     * Updates the admin configuration file.
     *
     * @param array $configUpdate The configuration to update.
     * @return array Returns an array with "success" on success or "error" on failure.
     */
    public static function updateConfig(array $configUpdate): array
    {
        // New: only enforce OIDC fields when OIDC is enabled
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

        // ── NEW: normalize authBypass & authHeaderName ─────────────────────────
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
            $configUpdate['loginOptions']['authHeaderName'] =
                trim($configUpdate['loginOptions']['authHeaderName']);
        }
        // ───────────────────────────────────────────────────────────────────────────

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
                unlink($configFile);
            }
            if (file_put_contents($configFile, $encryptedContent, LOCK_EX) === false) {
                error_log("AdminModel::updateConfig: Failed to write configuration even after deletion.");
                return ["error" => "Failed to update configuration even after cleanup."];
            }
        }
        // Best-effort normalize perms for host visibility (user rw, group rw)
        @chmod($configFile, 0664);

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
                http_response_code(500);
                return ["error" => "Failed to decrypt configuration."];
            }
            $config = json_decode($decryptedContent, true);
            if (!is_array($config)) {
                $config = [];
            }

            // Normalize login options if missing
            if (!isset($config['loginOptions'])) {
                // migrate legacy top-level flags; default OIDC to true (disabled)
                $config['loginOptions'] = [
                    'disableFormLogin' => isset($config['disableFormLogin']) ? (bool)$config['disableFormLogin'] : false,
                    'disableBasicAuth' => isset($config['disableBasicAuth']) ? (bool)$config['disableBasicAuth'] : false,
                    'disableOIDCLogin' => isset($config['disableOIDCLogin']) ? (bool)$config['disableOIDCLogin'] : true,
                ];
                unset($config['disableFormLogin'], $config['disableBasicAuth'], $config['disableOIDCLogin']);
            } else {
                // normalize booleans; default OIDC to true (disabled) if missing
                $lo = &$config['loginOptions'];
                $lo['disableFormLogin'] = isset($lo['disableFormLogin']) ? (bool)$lo['disableFormLogin'] : false;
                $lo['disableBasicAuth'] = isset($lo['disableBasicAuth']) ? (bool)$lo['disableBasicAuth'] : false;
                $lo['disableOIDCLogin'] = isset($lo['disableOIDCLogin']) ? (bool)$lo['disableOIDCLogin'] : true;
            }

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
            if (!isset($config['header_title']) || empty($config['header_title'])) {
                $config['header_title'] = "FileRise";
            }
            if (!isset($config['enableWebDAV'])) {
                $config['enableWebDAV'] = false;
            }
            // Default sharedMaxUploadSize to 50MB or TOTAL_UPLOAD_SIZE if smaller
            if (!isset($config['sharedMaxUploadSize'])) {
                $defaultSms = min(50 * 1024 * 1024, self::parseSize(TOTAL_UPLOAD_SIZE));
                $config['sharedMaxUploadSize'] = $defaultSms;
            }

            return $config;
        } else {
            // Return defaults.
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
                    'disableBasicAuth' => false,
                    'disableOIDCLogin' => true
                ],
                'globalOtpauthUrl'      => "",
                'enableWebDAV'          => false,
                'sharedMaxUploadSize'   => min(50 * 1024 * 1024, self::parseSize(TOTAL_UPLOAD_SIZE))
            ];
        }
    }
}
