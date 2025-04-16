<?php
// src/models/userModel.php

require_once PROJECT_ROOT . '/config/config.php';

class userModel {
    /**
     * Retrieves all users from the users file.
     *
     * @return array Returns an array of users.
     */
    public static function getAllUsers() {
        $usersFile = USERS_DIR . USERS_FILE;
        $users = [];
        if (file_exists($usersFile)) {
            $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) >= 3 && preg_match(REGEX_USER, $parts[0])) {
                    $users[] = [
                        "username" => $parts[0],
                        "role"     => trim($parts[2])
                    ];
                }
            }
        }
        return $users;
    }
    
    /**
     * Adds a new user.
     *
     * @param string $username The new username.
     * @param string $password The plain-text password.
     * @param string $isAdmin "1" if admin; "0" otherwise.
     * @param bool   $setupMode If true, overwrite the users file.
     * @return array Response containing either an error or a success message.
     */
    public static function addUser($username, $password, $isAdmin, $setupMode) {
        $usersFile = USERS_DIR . USERS_FILE;

        // Ensure users.txt exists.
        if (!file_exists($usersFile)) {
            file_put_contents($usersFile, '');
        }
        
        // Check if username already exists.
        $existingUsers = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($existingUsers as $line) {
            $parts = explode(':', trim($line));
            if ($username === $parts[0]) {
                return ["error" => "User already exists"];
            }
        }
    
        // Hash the password.
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    
        // Prepare the new line.
        $newUserLine = $username . ":" . $hashedPassword . ":" . $isAdmin . PHP_EOL;
    
        // If setup mode, overwrite the file; otherwise, append.
        if ($setupMode) {
            file_put_contents($usersFile, $newUserLine);
        } else {
            file_put_contents($usersFile, $newUserLine, FILE_APPEND);
        }
    
        return ["success" => "User added successfully"];
    }

        /**
     * Removes the specified user from the users file and updates the userPermissions file.
     *
     * @param string $usernameToRemove The username to remove.
     * @return array An array with either an error message or a success message.
     */
    public static function removeUser($usernameToRemove) {
        $usersFile = USERS_DIR . USERS_FILE;
        
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }
        
        $existingUsers = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $newUsers = [];
        $userFound = false;
        
        // Loop through users; skip (remove) the specified user.
        foreach ($existingUsers as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) < 3) {
                continue;
            }
            if ($parts[0] === $usernameToRemove) {
                $userFound = true;
                continue; // Do not add this user to the new array.
            }
            $newUsers[] = $line;
        }
        
        if (!$userFound) {
            return ["error" => "User not found"];
        }
        
        // Write the updated user list back to the file.
        file_put_contents($usersFile, implode(PHP_EOL, $newUsers) . PHP_EOL);
        
        // Update the userPermissions.json file.
        $permissionsFile = USERS_DIR . "userPermissions.json";
        if (file_exists($permissionsFile)) {
            $permissionsJson = file_get_contents($permissionsFile);
            $permissionsArray = json_decode($permissionsJson, true);
            if (is_array($permissionsArray) && isset($permissionsArray[$usernameToRemove])) {
                unset($permissionsArray[$usernameToRemove]);
                file_put_contents($permissionsFile, json_encode($permissionsArray, JSON_PRETTY_PRINT));
            }
        }
        
        return ["success" => "User removed successfully"];
    }

        /**
     * Retrieves permissions from the userPermissions.json file.
     * If the current user is an admin, returns all permissions.
     * Otherwise, returns only the permissions for the current user.
     *
     * @return array|object Returns an associative array of permissions or an empty object if none are found.
     */
    public static function getUserPermissions() {
        global $encryptionKey;
        $permissionsFile = USERS_DIR . "userPermissions.json";
        $permissionsArray = [];

        // Load permissions if the file exists.
        if (file_exists($permissionsFile)) {
            $content = file_get_contents($permissionsFile);
            // Attempt to decrypt the content.
            $decryptedContent = decryptData($content, $encryptionKey);
            if ($decryptedContent === false) {
                // If decryption fails, assume the content is plain JSON.
                $permissionsArray = json_decode($content, true);
            } else {
                $permissionsArray = json_decode($decryptedContent, true);
            }
            if (!is_array($permissionsArray)) {
                $permissionsArray = [];
            }
        }

        // If the user is an admin, return all permissions.
        if (isset($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) {
            return $permissionsArray;
        }

        // Otherwise, return only the permissions for the currently logged-in user.
        $username = $_SESSION['username'] ?? '';
        foreach ($permissionsArray as $storedUsername => $data) {
            if (strcasecmp($storedUsername, $username) === 0) {
                return $data;
            }
        }

        // If no permissions are found, return an empty object.
        return new stdClass();
    }

        /**
     * Updates user permissions in the userPermissions.json file.
     *
     * @param array $permissions An array of permission updates.
     * @return array An associative array with a success or error message.
     */
    public static function updateUserPermissions($permissions) {
        global $encryptionKey;
        $permissionsFile = USERS_DIR . "userPermissions.json";
        $existingPermissions = [];

        // Load existing permissions if available and decrypt.
        if (file_exists($permissionsFile)) {
            $encryptedContent = file_get_contents($permissionsFile);
            $json = decryptData($encryptedContent, $encryptionKey);
            $existingPermissions = json_decode($json, true);
            if (!is_array($existingPermissions)) {
                $existingPermissions = [];
            }
        }
        
        // Load user roles from the users file.
        $usersFile = USERS_DIR . USERS_FILE;
        $userRoles = [];
        if (file_exists($usersFile)) {
            $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) >= 3 && preg_match(REGEX_USER, $parts[0])) {
                    // Use lowercase keys for consistency.
                    $userRoles[strtolower($parts[0])] = trim($parts[2]);
                }
            }
        }
        
        // Process each permission update.
        foreach ($permissions as $perm) {
            if (!isset($perm['username'])) {
                continue;
            }
            $username = $perm['username'];
            // Look up the user's role.
            $role = isset($userRoles[strtolower($username)]) ? $userRoles[strtolower($username)] : null;
            
            // Skip updating permissions for admin users.
            if ($role === "1") {
                continue;
            }
            
            // Update permissions: default any missing value to false.
            $existingPermissions[strtolower($username)] = [
                'folderOnly'    => isset($perm['folderOnly']) ? (bool)$perm['folderOnly'] : false,
                'readOnly'      => isset($perm['readOnly']) ? (bool)$perm['readOnly'] : false,
                'disableUpload' => isset($perm['disableUpload']) ? (bool)$perm['disableUpload'] : false
            ];
        }
        
        // Convert the updated permissions array to JSON.
        $plainText = json_encode($existingPermissions, JSON_PRETTY_PRINT);
        // Encrypt the JSON.
        $encryptedData = encryptData($plainText, $encryptionKey);
        // Save encrypted permissions back to the file.
        $result = file_put_contents($permissionsFile, $encryptedData);
        if ($result === false) {
            return ["error" => "Failed to save user permissions."];
        }
        
        return ["success" => "User permissions updated successfully."];
    }

        /**
     * Changes the password for the given user.
     *
     * @param string $username The username whose password is to be changed.
     * @param string $oldPassword The old (current) password.
     * @param string $newPassword The new password.
     * @return array An array with either a success or error message.
     */
    public static function changePassword($username, $oldPassword, $newPassword) {
        $usersFile = USERS_DIR . USERS_FILE;
        
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }
        
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $userFound = false;
        $newLines = [];
        
        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            // Expect at least 3 parts: username, hashed password, and role.
            if (count($parts) < 3) {
                $newLines[] = $line;
                continue;
            }
            $storedUser = $parts[0];
            $storedHash = $parts[1];
            $storedRole = $parts[2];
            // Preserve TOTP secret if it exists.
            $totpSecret = (count($parts) >= 4) ? $parts[3] : "";
            
            if ($storedUser === $username) {
                $userFound = true;
                // Verify the old password.
                if (!password_verify($oldPassword, $storedHash)) {
                    return ["error" => "Old password is incorrect."];
                }
                // Hash the new password.
                $newHashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);
                
                // Rebuild the line, preserving TOTP secret if it exists.
                if ($totpSecret !== "") {
                    $newLines[] = $username . ":" . $newHashedPassword . ":" . $storedRole . ":" . $totpSecret;
                } else {
                    $newLines[] = $username . ":" . $newHashedPassword . ":" . $storedRole;
                }
            } else {
                $newLines[] = $line;
            }
        }
        
        if (!$userFound) {
            return ["error" => "User not found."];
        }
        
        // Save the updated users file.
        if (file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL)) {
            return ["success" => "Password updated successfully."];
        } else {
            return ["error" => "Could not update password."];
        }
    }

        /**
     * Updates the user panel settings by disabling the TOTP secret if TOTP is not enabled.
     *
     * @param string $username The username whose panel settings are being updated.
     * @param bool $totp_enabled Whether TOTP is enabled.
     * @return array An array indicating success or failure.
     */
    public static function updateUserPanel($username, $totp_enabled) {
        $usersFile = USERS_DIR . USERS_FILE;
        
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }
        
        // If TOTP is disabled, update the file to clear the TOTP secret.
        if (!$totp_enabled) {
            $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $newLines = [];
            
            foreach ($lines as $line) {
                $parts = explode(':', trim($line));
                // Leave lines with fewer than three parts unchanged.
                if (count($parts) < 3) {
                    $newLines[] = $line;
                    continue;
                }
                
                if ($parts[0] === $username) {
                    // If a fourth field (TOTP secret) exists, clear it; otherwise, append an empty field.
                    if (count($parts) >= 4) {
                        $parts[3] = "";
                    } else {
                        $parts[] = "";
                    }
                    $newLines[] = implode(':', $parts);
                } else {
                    $newLines[] = $line;
                }
            }
            
            $result = file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX);
            if ($result === false) {
                return ["error" => "Failed to disable TOTP secret"];
            }
            return ["success" => "User panel updated: TOTP disabled"];
        }
        
        // If TOTP is enabled, do nothing.
        return ["success" => "User panel updated: TOTP remains enabled"];
    }

        /**
     * Disables the TOTP secret for the specified user.
     *
     * @param string $username The user for whom TOTP should be disabled.
     * @return bool True if the secret was cleared; false otherwise.
     */
    public static function disableTOTPSecret($username) {
        global $encryptionKey; // In case it's used in this model context.
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return false;
        }
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $modified = false;
        $newLines = [];
        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            // If the line doesn't have at least three parts, leave it unchanged.
            if (count($parts) < 3) {
                $newLines[] = $line;
                continue;
            }
            if ($parts[0] === $username) {
                // If a fourth field exists, clear it; otherwise, append an empty field.
                if (count($parts) >= 4) {
                    $parts[3] = "";
                } else {
                    $parts[] = "";
                }
                $modified = true;
                $newLines[] = implode(":", $parts);
            } else {
                $newLines[] = $line;
            }
        }
        if ($modified) {
            file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX);
        }
        return $modified;
    }

        /**
     * Attempts to recover TOTP for a user using the supplied recovery code.
     *
     * @param string $userId The user identifier.
     * @param string $recoveryCode The recovery code provided by the user.
     * @return array An associative array with keys 'status' and 'message'.
     */
    public static function recoverTOTP($userId, $recoveryCode) {
        // --- Rate‑limit recovery attempts ---
        $attemptsFile = rtrim(USERS_DIR, '/\\') . '/recovery_attempts.json';
        $attempts = is_file($attemptsFile) ? json_decode(file_get_contents($attemptsFile), true) : [];
        $key = $_SERVER['REMOTE_ADDR'] . '|' . $userId;
        $now = time();
        if (isset($attempts[$key])) {
            // Prune attempts older than 15 minutes.
            $attempts[$key] = array_filter($attempts[$key], function($ts) use ($now) {
                return $ts > $now - 900;
            });
        }
        if (count($attempts[$key] ?? []) >= 5) {
            return ['status' => 'error', 'message' => 'Too many attempts. Try again later.'];
        }
        
        // --- Load user metadata file ---
        $userFile = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . $userId . '.json';
        if (!file_exists($userFile)) {
            return ['status' => 'error', 'message' => 'User not found'];
        }
        
        // --- Open and lock file ---
        $fp = fopen($userFile, 'c+');
        if (!$fp || !flock($fp, LOCK_EX)) {
            return ['status' => 'error', 'message' => 'Server error'];
        }
        
        $fileContents = stream_get_contents($fp);
        $data = json_decode($fileContents, true) ?: [];
        
        // --- Check recovery code ---
        if (empty($recoveryCode)) {
            flock($fp, LOCK_UN);
            fclose($fp);
            return ['status' => 'error', 'message' => 'Recovery code required'];
        }
        
        $storedHash = $data['totp_recovery_code'] ?? null;
        if (!$storedHash || !password_verify($recoveryCode, $storedHash)) {
            // Record failed attempt.
            $attempts[$key][] = $now;
            file_put_contents($attemptsFile, json_encode($attempts), LOCK_EX);
            flock($fp, LOCK_UN);
            fclose($fp);
            return ['status' => 'error', 'message' => 'Invalid recovery code'];
        }
        
        // --- Invalidate recovery code ---
        $data['totp_recovery_code'] = null;
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        
        return ['status' => 'ok'];
    }

        /**
     * Generates a random recovery code.
     *
     * @param int $length Length of the recovery code.
     * @return string
     */
    private static function generateRecoveryCode($length = 12) {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        $max   = strlen($chars) - 1;
        $code  = '';
        for ($i = 0; $i < $length; $i++) {
            $code .= $chars[random_int(0, $max)];
        }
        return $code;
    }

    /**
     * Saves a new TOTP recovery code for the specified user.
     *
     * @param string $userId The username of the user.
     * @return array An associative array with the status and recovery code (if successful).
     */
    public static function saveTOTPRecoveryCode($userId) {
        // Determine the user file path.
        $userFile = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . $userId . '.json';
        
        // Ensure the file exists; if not, create it with default data.
        if (!file_exists($userFile)) {
            $defaultData = [];
            if (file_put_contents($userFile, json_encode($defaultData)) === false) {
                return ['status' => 'error', 'message' => 'Server error: could not create user file'];
            }
        }
        
        // Generate a new recovery code.
        $recoveryCode = self::generateRecoveryCode();
        $recoveryHash = password_hash($recoveryCode, PASSWORD_DEFAULT);
        
        // Open the file, lock it, and update the totp_recovery_code field.
        $fp = fopen($userFile, 'c+');
        if (!$fp || !flock($fp, LOCK_EX)) {
            return ['status' => 'error', 'message' => 'Server error: could not lock user file'];
        }
        
        // Read and decode the existing JSON.
        $contents = stream_get_contents($fp);
        $data = json_decode($contents, true) ?: [];
        
        // Update the totp_recovery_code field.
        $data['totp_recovery_code'] = $recoveryHash;
        
        // Write the new data.
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data)); // Plain JSON in production.
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        
        return ['status' => 'ok', 'recoveryCode' => $recoveryCode];
    }

        /**
     * Sets up TOTP for the specified user by retrieving or generating a TOTP secret,
     * then builds and returns a QR code image for the OTPAuth URL.
     *
     * @param string $username The username for which to set up TOTP.
     * @return array An associative array with keys 'imageData' and 'mimeType', or 'error'.
     */
    public static function setupTOTP($username) {
        global $encryptionKey;
        $usersFile = USERS_DIR . USERS_FILE;
        
        if (!file_exists($usersFile)) {
            return ['error' => 'Users file not found'];
        }
        
        // Look for an existing TOTP secret.
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $totpSecret = null;
        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
                $totpSecret = decryptData($parts[3], $encryptionKey);
                break;
            }
        }
        
        // Use the TwoFactorAuth library to create a new secret if none found.
        $tfa = new \RobThree\Auth\TwoFactorAuth(
            new \RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider(), // QR code provider
            'FileRise',                // issuer
            6,                         // number of digits
            30,                        // period (seconds)
            \RobThree\Auth\Algorithm::Sha1  // algorithm
        );
        if (!$totpSecret) {
            $totpSecret = $tfa->createSecret();
            $encryptedSecret = encryptData($totpSecret, $encryptionKey);
            
            // Update the user’s line with the new encrypted secret.
            $newLines = [];
            foreach ($lines as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) >= 3 && $parts[0] === $username) {
                    if (count($parts) >= 4) {
                        $parts[3] = $encryptedSecret;
                    } else {
                        $parts[] = $encryptedSecret;
                    }
                    $newLines[] = implode(':', $parts);
                } else {
                    $newLines[] = $line;
                }
            }
            file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX);
        }
        
        // Determine the OTPAuth URL.
        // Try to load a global OTPAuth URL template from admin configuration.
        $adminConfigFile = USERS_DIR . 'adminConfig.json';
        $globalOtpauthUrl = "";
        if (file_exists($adminConfigFile)) {
            $encryptedContent = file_get_contents($adminConfigFile);
            $decryptedContent = decryptData($encryptedContent, $encryptionKey);
            if ($decryptedContent !== false) {
                $config = json_decode($decryptedContent, true);
                if (isset($config['globalOtpauthUrl']) && !empty($config['globalOtpauthUrl'])) {
                    $globalOtpauthUrl = $config['globalOtpauthUrl'];
                }
            }
        }
        
        if (!empty($globalOtpauthUrl)) {
            $label = "FileRise:" . $username;
            $otpauthUrl = str_replace(["{label}", "{secret}"], [urlencode($label), $totpSecret], $globalOtpauthUrl);
        } else {
            $label = urlencode("FileRise:" . $username);
            $issuer = urlencode("FileRise");
            $otpauthUrl = "otpauth://totp/{$label}?secret={$totpSecret}&issuer={$issuer}";
        }
        
        // Build the QR code image using the Endroid QR Code Builder.
        $result = \Endroid\QrCode\Builder\Builder::create()
            ->writer(new \Endroid\QrCode\Writer\PngWriter())
            ->data($otpauthUrl)
            ->build();
        
        return [
            'imageData' => $result->getString(),
            'mimeType'  => $result->getMimeType()
        ];
    }

        /**
     * Retrieves the decrypted TOTP secret for a given user.
     *
     * @param string $username
     * @return string|null Returns the TOTP secret if found, or null if not.
     */
    public static function getTOTPSecret($username) {
        global $encryptionKey;
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return null;
        }
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            // Expect at least 4 parts: username, hash, role, and TOTP secret.
            if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
                return decryptData($parts[3], $encryptionKey);
            }
        }
        return null;
    }
    
    /**
     * Helper to get a user's role from users.txt.
     *
     * @param string $username
     * @return string|null
     */
    public static function getUserRole($username) {
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return null;
        }
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 3 && $parts[0] === $username) {
                return trim($parts[2]);
            }
        }
        return null;
    }
}