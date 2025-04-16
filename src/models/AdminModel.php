<?php
// src/models/AdminModel.php

require_once PROJECT_ROOT . '/config/config.php';

class AdminModel
{

    /**
     * Updates the admin configuration file.
     *
     * @param array $configUpdate The configuration to update.
     * @return array Returns an array with "success" on success or "error" on failure.
     */
    public static function updateConfig(array $configUpdate): array
    {
        // Validate required OIDC configuration keys.
        if (
            empty($configUpdate['oidc']['providerUrl']) ||
            empty($configUpdate['oidc']['clientId']) ||
            empty($configUpdate['oidc']['clientSecret']) ||
            empty($configUpdate['oidc']['redirectUri'])
        ) {
            return ["error" => "Incomplete OIDC configuration."];
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
                unlink($configFile);
            }
            if (file_put_contents($configFile, $encryptedContent, LOCK_EX) === false) {
                error_log("AdminModel::updateConfig: Failed to write configuration even after deletion.");
                return ["error" => "Failed to update configuration even after cleanup."];
            }
        }

        return ["success" => "Configuration updated successfully."];
    }

    /**
     * Retrieves the current configuration.
     *
     * @return array The configuration array, or defaults if not found.
     */
    public static function getConfig(): array {
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
    
            // Normalize login options.
            if (!isset($config['loginOptions'])) {
                // Create loginOptions array from top-level keys if missing.
                $config['loginOptions'] = [
                    'disableFormLogin' => isset($config['disableFormLogin']) ? (bool)$config['disableFormLogin'] : false,
                    'disableBasicAuth' => isset($config['disableBasicAuth']) ? (bool)$config['disableBasicAuth'] : false,
                    'disableOIDCLogin' => isset($config['disableOIDCLogin']) ? (bool)$config['disableOIDCLogin'] : false,
                ];
                unset($config['disableFormLogin'], $config['disableBasicAuth'], $config['disableOIDCLogin']);
            } else {
                // Ensure proper boolean types
                $config['loginOptions']['disableFormLogin'] = (bool)$config['loginOptions']['disableFormLogin'];
                $config['loginOptions']['disableBasicAuth'] = (bool)$config['loginOptions']['disableBasicAuth'];
                $config['loginOptions']['disableOIDCLogin'] = (bool)$config['loginOptions']['disableOIDCLogin'];
            }
            
            if (!isset($config['globalOtpauthUrl'])) {
                $config['globalOtpauthUrl'] = "";
            }
            if (!isset($config['header_title']) || empty($config['header_title'])) {
                $config['header_title'] = "FileRise";
            }
            return $config;
        } else {
            // Return defaults.
            return [
                'header_title' => "FileRise",
                'oidc' => [
                    'providerUrl'  => 'https://your-oidc-provider.com',
                    'clientId'     => 'YOUR_CLIENT_ID',
                    'clientSecret' => 'YOUR_CLIENT_SECRET',
                    'redirectUri'  => 'https://yourdomain.com/api/auth/auth.php?oidc=callback'
                ],
                'loginOptions' => [
                    'disableFormLogin' => false,
                    'disableBasicAuth' => false,
                    'disableOIDCLogin' => false
                ],
                'globalOtpauthUrl' => ""
            ];
        }
    }
}
