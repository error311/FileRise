<?php
// src/models/AuthModel.php

require_once PROJECT_ROOT . '/config/config.php';

class AuthModel {

    /**
     * Retrieves the user's role from the users file.
     *
     * @param string $username
     * @return string|null The role string (e.g. "1" for admin) or null if not found.
     */
    public static function getUserRole(string $username): ?string {
        $usersFile = USERS_DIR . USERS_FILE;
        if (file_exists($usersFile)) {
            foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $parts = explode(":", trim($line));
                if (count($parts) >= 3 && $parts[0] === $username) {
                    return trim($parts[2]);
                }
            }
        }
        return null;
    }
    
    /**
     * Authenticates the user using form-based credentials.
     *
     * @param string $username
     * @param string $password
     * @return array|false Returns an associative array with user data (role, totp_secret) on success or false on failure.
     */
    public static function authenticate(string $username, string $password) {
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return false;
        }
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) < 3) continue;
            if ($username === $parts[0] && password_verify($password, $parts[1])) {
                return [
                    'role' => $parts[2],
                    'totp_secret' => (isset($parts[3]) && !empty($parts[3]))
                        ? decryptData($parts[3], $GLOBALS['encryptionKey'])
                        : null
                ];
            }
        }
        return false;
    }
    
    /**
     * Loads failed login attempts from a file.
     *
     * @param string $file
     * @return array
     */
    public static function loadFailedAttempts(string $file): array {
        if (file_exists($file)) {
            $data = json_decode(file_get_contents($file), true);
            if (is_array($data)) {
                return $data;
            }
        }
        return [];
    }
    
    /**
     * Saves failed login attempts into a file.
     *
     * @param string $file
     * @param array $data
     * @return void
     */
    public static function saveFailedAttempts(string $file, array $data): void {
        file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
    }
    
    /**
     * Retrieves a user's TOTP secret from the users file.
     *
     * @param string $username
     * @return string|null Returns the decrypted TOTP secret or null if not set.
     */
    public static function getUserTOTPSecret(string $username): ?string {
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return null;
        }
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
                return decryptData($parts[3], $GLOBALS['encryptionKey']);
            }
        }
        return null;
    }
    
    /**
     * Loads the folder-only permission for a given user.
     *
     * @param string $username
     * @return bool
     */
    public static function loadFolderPermission(string $username): bool {
        $permissionsFile = USERS_DIR . 'userPermissions.json';
        if (file_exists($permissionsFile)) {
            $content = file_get_contents($permissionsFile);
            $decrypted = decryptData($content, $GLOBALS['encryptionKey']);
            $permissions = $decrypted !== false ? json_decode($decrypted, true) : json_decode($content, true);
            if (is_array($permissions)) {
                foreach ($permissions as $storedUsername => $data) {
                    if (strcasecmp($storedUsername, $username) === 0 && isset($data['folderOnly'])) {
                        return (bool)$data['folderOnly'];
                    }
                }
            }
        }
        return false;
    }
}