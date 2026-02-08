<?php

namespace FileRise\Domain;

use FileRise\Support\ACL;
use FileRise\Storage\SourceContext;

// src/models/userModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class UserModel
{
    private static $caseMigrationChecked = false;

    private static function writeAtomic(string $path, string $data): bool
    {
        $dir = dirname($path);
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
        if (!is_dir($dir)) {
            return false;
        }
        if (file_put_contents($tmp, $data, LOCK_EX) === false) {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
            return false;
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        return true;
    }

    private static function mergePermissionsMostRestrictive($base, $incoming): array
    {
        $a = is_array($base) ? $base : [];
        $b = is_array($incoming) ? $incoming : [];
        $restrictiveTrue = ['folderOnly', 'readOnly', 'disableUpload', 'viewOwnOnly'];
        $out = $a;

        foreach ($b as $k => $v) {
            if (in_array($k, $restrictiveTrue, true)) {
                $out[$k] = !empty($a[$k]) || !empty($v);
                continue;
            }
            $aHasBool = array_key_exists($k, $a) && is_bool($a[$k]);
            if (is_bool($v) || $aHasBool) {
                $out[$k] = !empty($a[$k]) && !empty($v);
                continue;
            }
            if (!array_key_exists($k, $out)) {
                $out[$k] = $v;
            }
        }

        return $out;
    }

    private static function ensureUserCaseMigration(): void
    {
        if (self::$caseMigrationChecked) {
            return;
        }
        self::$caseMigrationChecked = true;

        $usersDir = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $marker   = $usersDir . 'user_case_migration.done';
        if (is_file($marker)) {
            return;
        }

        $usersFile = USERS_DIR . USERS_FILE;
        if (!is_file($usersFile)) {
            return;
        }

        $fp = fopen($usersFile, 'c+');
        if (!$fp || !flock($fp, LOCK_EX)) {
            if ($fp) {
                fclose($fp);
            }
            return;
        }
        $contents = stream_get_contents($fp);
        $lines = $contents === '' ? [] : preg_split("/\r\n|\n|\r/", $contents);
        if ($lines === false) {
            flock($fp, LOCK_UN);
            fclose($fp);
            return;
        }
        if (!empty($lines) && $lines[count($lines) - 1] === '') {
            array_pop($lines);
        }

        $canonical = [];
        $out = [];
        $changedUsers = false;

        foreach ($lines as $line) {
            if ($line === '') {
                $out[] = $line;
                continue;
            }
            $parts = explode(':', $line);
            if (count($parts) < 3) {
                $out[] = $line;
                continue;
            }
            $user = $parts[0];
            $lc = strtolower($user);
            if (!isset($canonical[$lc])) {
                $canonical[$lc] = $user;
                $out[] = $line;
            } else {
                $changedUsers = true;
            }
        }

        $ok = true;
        if ($changedUsers) {
            $payload = implode(PHP_EOL, $out) . PHP_EOL;
            $ok = ftruncate($fp, 0) !== false;
            if ($ok) {
                rewind($fp);
                $ok = fwrite($fp, $payload) !== false;
                if ($ok) {
                    fflush($fp);
                }
            }
        }
        flock($fp, LOCK_UN);
        fclose($fp);

        if ($ok) {
            $permissionsFile = USERS_DIR . "userPermissions.json";
            if (is_file($permissionsFile)) {
                global $encryptionKey;
                $raw = file_get_contents($permissionsFile);
                $decrypted = decryptData($raw, $encryptionKey);
                $permissions = $decrypted !== false ? json_decode($decrypted, true) : json_decode($raw, true);
                if (is_array($permissions)) {
                    $permOut = [];
                    $changedPerm = false;
                    foreach ($permissions as $k => $v) {
                        $key = (string)$k;
                        $lc = strtolower($key);
                        $targetKey = $canonical[$lc] ?? $key;
                        if (isset($permOut[$targetKey])) {
                            $merged = self::mergePermissionsMostRestrictive($permOut[$targetKey], $v);
                            if ($merged !== $permOut[$targetKey]) {
                                $changedPerm = true;
                            }
                            $permOut[$targetKey] = $merged;
                        } else {
                            $permOut[$targetKey] = $v;
                        }
                        if ($targetKey !== $key) {
                            $changedPerm = true;
                        }
                    }
                    if ($changedPerm) {
                        $plain = json_encode($permOut, JSON_PRETTY_PRINT);
                        $enc   = encryptData($plain, $encryptionKey);
                        $ok = self::writeAtomic($permissionsFile, $enc);
                    }
                }
            }
        }

        if ($ok) {
            $stamp = json_encode(['migratedAt' => time()], JSON_PRETTY_PRINT);
            self::writeAtomic($marker, $stamp);
        }
    }

    /**
     * Retrieve all users (username + role).
     */
    public static function getAllUsers()
    {
        self::ensureUserCaseMigration();
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
     * Return the first admin username from users.txt order.
     */
    public static function getPrimaryAdminUsername(): string
    {
        self::ensureUserCaseMigration();
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return '';
        }

        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $parts = explode(':', $line);
            if (count($parts) < 3) {
                continue;
            }
            $username = $parts[0];
            $role = trim((string)$parts[2]);
            if (!preg_match(REGEX_USER, $username)) {
                continue;
            }
            if ($role === '1') {
                return $username;
            }
        }

        return '';
    }

    /**
     * Add a user.
     *
     * @param string $username
     * @param string $password
     * @param string $isAdmin   "1" or "0"
     * @param bool   $setupMode overwrite file if true
     */
    public static function addUser($username, $password, $isAdmin, $setupMode)
    {
        $usersFile = USERS_DIR . USERS_FILE;

        // Defense in depth
        if (!preg_match(REGEX_USER, $username)) {
            return ["error" => "Invalid username"];
        }
        if (!is_string($password) || $password === '') {
            return ["error" => "Password required"];
        }
        $isAdmin = $isAdmin === '1' ? '1' : '0';

        if (!file_exists($usersFile)) {
            @file_put_contents($usersFile, '', LOCK_EX);
        }

        // Check duplicates
        $existingUsers = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($existingUsers as $line) {
            $parts = explode(':', trim($line));
            if (isset($parts[0]) && strcasecmp($username, $parts[0]) === 0) {
                return ["error" => "User already exists"];
            }
        }

        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
        $newUserLine    = $username . ":" . $hashedPassword . ":" . $isAdmin . PHP_EOL;

        if ($setupMode) {
            if (file_put_contents($usersFile, $newUserLine, LOCK_EX) === false) {
                return ["error" => "Failed to write users file"];
            }
        } else {
            if (file_put_contents($usersFile, $newUserLine, FILE_APPEND | LOCK_EX) === false) {
                return ["error" => "Failed to write users file"];
            }
        }

        return ["success" => "User added successfully"];
    }

    /**
     * Remove a user and update encrypted userPermissions.json.
     */
    public static function removeUser($usernameToRemove)
    {
        global $encryptionKey;

        if (!preg_match(REGEX_USER, $usernameToRemove)) {
            return ["error" => "Invalid username"];
        }

        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }

        $existingUsers = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $newUsers = [];
        $userFound = false;

        foreach ($existingUsers as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) < 3) {
                continue;
            }
            if (strcasecmp($parts[0], $usernameToRemove) === 0) {
                $userFound = true;
                continue; // skip this user
            }
            $newUsers[] = $line;
        }

        if (!$userFound) {
            return ["error" => "User not found"];
        }

        $newContent = $newUsers ? (implode(PHP_EOL, $newUsers) . PHP_EOL) : '';
        if (file_put_contents($usersFile, $newContent, LOCK_EX) === false) {
            return ["error" => "Failed to update users file"];
        }

    // Update encrypted userPermissions.json — remove any key matching case-insensitively
        $permissionsFile = USERS_DIR . "userPermissions.json";
        if (file_exists($permissionsFile)) {
            $raw = file_get_contents($permissionsFile);
            $decrypted = decryptData($raw, $encryptionKey);
            $permissionsArray = $decrypted !== false
            ? json_decode($decrypted, true)
            : (json_decode($raw, true) ?: []); // tolerate legacy plaintext

            if (is_array($permissionsArray)) {
                foreach (array_keys($permissionsArray) as $k) {
                    if (strcasecmp($k, $usernameToRemove) === 0) {
                        unset($permissionsArray[$k]);
                    }
                }
                $plain = json_encode($permissionsArray, JSON_PRETTY_PRINT);
                $enc   = encryptData($plain, $encryptionKey);
                self::writeAtomic($permissionsFile, $enc);
            }
        }

    // Purge from ACL (remove from every bucket in every folder)
        require_once PROJECT_ROOT . '/src/lib/ACL.php';
        if (method_exists('ACL', 'purgeUser')) {
            ACL::purgeUser($usernameToRemove);
        } else {
            // Fallback inline purge if you haven't added ACL::purgeUser yet:
            $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
            $aclPath = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'folder_acl.json';
            $acl = is_file($aclPath) ? json_decode((string)file_get_contents($aclPath), true) : [];
            if (!is_array($acl)) {
                $acl = ['folders' => [], 'groups' => []];
            }
            $buckets = ['owners','read','write','share','read_own'];

            $changed = false;
            foreach ($acl['folders'] ?? [] as $f => &$rec) {
                foreach ($buckets as $b) {
                    if (!isset($rec[$b]) || !is_array($rec[$b])) {
                        $rec[$b] = [];
                        continue;
                    }
                    $before = $rec[$b];
                    $rec[$b] = array_values(array_filter($rec[$b], fn($u) => strcasecmp((string)$u, $usernameToRemove) !== 0));
                    if ($rec[$b] !== $before) {
                        $changed = true;
                    }
                }
            }
            unset($rec);

            if ($changed) {
                @file_put_contents($aclPath, json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
            }
        }

        return ["success" => "User removed successfully"];
    }

    /**
     * Get permissions for current user (or all, if admin).
     */
    public static function getUserPermissions()
    {
        self::ensureUserCaseMigration();
        global $encryptionKey;
        $permissionsFile = USERS_DIR . "userPermissions.json";
        $permissionsArray = [];

        if (file_exists($permissionsFile)) {
            $content = file_get_contents($permissionsFile);
            $decrypted = decryptData($content, $encryptionKey);
            if ($decrypted === false) {
                // tolerate legacy plaintext
                $permissionsArray = json_decode($content, true);
            } else {
                $permissionsArray = json_decode($decrypted, true);
            }
            if (!is_array($permissionsArray)) {
                $permissionsArray = [];
            }
        }

        if (!empty($_SESSION['isAdmin'])) {
            return $permissionsArray;
        }

        $username = $_SESSION['username'] ?? '';
        foreach ($permissionsArray as $storedUsername => $data) {
            if (strcasecmp($storedUsername, $username) === 0) {
                return $data;
            }
        }

        return new stdClass();
    }

    /**
     * Update permissions (encrypted on disk). Skips admins.
     */
    public static function updateUserPermissions($permissions)
    {
        self::ensureUserCaseMigration();
        global $encryptionKey;
        $permissionsFile = USERS_DIR . "userPermissions.json";
        $existingPermissions = [];

    // Load existing (decrypt if needed)
        if (file_exists($permissionsFile)) {
            $encryptedContent = file_get_contents($permissionsFile);
            $json = decryptData($encryptedContent, $encryptionKey);
            if ($json === false) {
                $json = $encryptedContent; // legacy plaintext
            }
            $existingPermissions = json_decode($json, true) ?: [];
        }

    // Load roles to skip admins
        $usersFile = USERS_DIR . USERS_FILE;
        $userRoles = [];
        if (file_exists($usersFile)) {
            foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) >= 3 && preg_match(REGEX_USER, $parts[0])) {
                    $userRoles[strtolower($parts[0])] = trim($parts[2]);
                }
            }
        }

        $knownKeys = [
        'folderOnly','readOnly','disableUpload',
        'bypassOwnership','canShare','canZip','viewOwnOnly'
        ];

    // Build a map of lowercase->actual key to update existing entries case-insensitively
        $lcIndex = [];
        foreach ($existingPermissions as $k => $_) {
            $lcIndex[strtolower($k)] = $k;
        }

        foreach ($permissions as $perm) {
            if (empty($perm['username'])) {
                continue;
            }

            $unameOrig = (string)$perm['username'];             // preserve original case
            $unameLc   = strtolower($unameOrig);
            $role      = $userRoles[$unameLc] ?? null;
            if ($role === "1") {
                continue; // skip admins
            }

            // Find existing key case-insensitively; otherwise use original case as canonical
            $storeKey = $lcIndex[$unameLc] ?? $unameOrig;

            $current = $existingPermissions[$storeKey] ?? [];
            foreach ($knownKeys as $k) {
                if (array_key_exists($k, $perm)) {
                    $current[$k] = (bool)$perm[$k];
                } elseif (!isset($current[$k])) {
                    $current[$k] = false;
                }
            }

            $existingPermissions[$storeKey] = $current;
            $lcIndex[$unameLc] = $storeKey; // keep index up to date
        }

        $plain = json_encode($existingPermissions, JSON_PRETTY_PRINT);
        $encrypted = encryptData($plain, $encryptionKey);
        if (!self::writeAtomic($permissionsFile, $encrypted)) {
            return ["error" => "Failed to save user permissions."];
        }
        return ["success" => "User permissions updated successfully."];
    }

    /**
     * Change password (preserve TOTP + extra fields).
     */
    public static function changePassword($username, $oldPassword, $newPassword)
    {
        if (!preg_match(REGEX_USER, $username)) {
            return ["error" => "Invalid username"];
        }

        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }

        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $userFound = false;
        $newLines = [];

        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) < 3) {
                $newLines[] = $line;
                continue;
            }
            $storedUser = $parts[0];
            $storedHash = $parts[1];

            if (strcasecmp($storedUser, $username) === 0) {
                $userFound = true;
                if (!password_verify($oldPassword, $storedHash)) {
                    return ["error" => "Old password is incorrect."];
                }
                $parts[1] = password_hash($newPassword, PASSWORD_BCRYPT);
                $newLines[] = implode(':', $parts);
            } else {
                $newLines[] = $line;
            }
        }

        if (!$userFound) {
            return ["error" => "User not found."];
        }

        $payload = implode(PHP_EOL, $newLines) . PHP_EOL;
        if (file_put_contents($usersFile, $payload, LOCK_EX) === false) {
            return ["error" => "Could not update password."];
        }

        return ["success" => "Password updated successfully."];
    }

    /**
 * Admin-only password reset (no old password required).
 */
    public static function adminResetPassword($targetUsername, $newPassword)
    {
        if (!preg_match(REGEX_USER, $targetUsername)) {
            return ["error" => "Invalid username"];
        }

        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }

        $lines     = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $userFound = false;
        $newLines  = [];

        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) < 3) {
                $newLines[] = $line;
                continue;
            }
            $storedUser = $parts[0];

            if (strcasecmp($storedUser, $targetUsername) === 0) {
                $userFound = true;
                // index 1 is the hash; preserve TOTP/extra fields in the rest of the line
                $parts[1] = password_hash($newPassword, PASSWORD_BCRYPT);
                $newLines[] = implode(':', $parts);
            } else {
                $newLines[] = $line;
            }
        }

        if (!$userFound) {
            return ["error" => "User not found."];
        }

        $payload = implode(PHP_EOL, $newLines) . PHP_EOL;
        if (file_put_contents($usersFile, $payload, LOCK_EX) === false) {
            return ["error" => "Could not update password."];
        }

        return ["success" => "Password updated successfully."];
    }

    /**
     * Update panel: if TOTP disabled, clear secret.
     */
    public static function updateUserPanel($username, $totp_enabled)
    {
        if (!preg_match(REGEX_USER, $username)) {
            return ["error" => "Invalid username"];
        }

        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return ["error" => "Users file not found"];
        }

        if (!$totp_enabled) {
            $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            $newLines = [];

            foreach ($lines as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) < 3) {
                    $newLines[] = $line;
                    continue;
                }
                if (strcasecmp($parts[0], $username) === 0) {
                    while (count($parts) < 4) {
                        $parts[] = "";
                    }
                    $parts[3] = "";
                    $newLines[] = implode(':', $parts);
                } else {
                    $newLines[] = $line;
                }
            }

            if (file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX) === false) {
                return ["error" => "Failed to disable TOTP secret"];
            }
            return ["success" => "User panel updated: TOTP disabled"];
        }

        return ["success" => "User panel updated: TOTP remains enabled"];
    }

    /**
     * Clear TOTP secret.
     */
    public static function disableTOTPSecret($username)
    {
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return false;
        }
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $modified = false;
        $newLines = [];

        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) < 3) {
                $newLines[] = $line;
                continue;
            }
            if (strcasecmp($parts[0], $username) === 0) {
                while (count($parts) < 4) {
                    $parts[] = "";
                }
                $parts[3] = "";
                $modified = true;
                $newLines[] = implode(":", $parts);
            } else {
                $newLines[] = $line;
            }
        }

        if ($modified) {
            return file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX) !== false;
        }
        return $modified;
    }

    /**
     * Recover via recovery code.
     */
    public static function recoverTOTP($userId, $recoveryCode)
    {
        // Rate limit storage
        $attemptsFile = rtrim(USERS_DIR, '/\\') . '/recovery_attempts.json';
        $attempts = is_file($attemptsFile) ? (json_decode(@file_get_contents($attemptsFile), true) ?: []) : [];
        $key = ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0') . '|' . $userId;
        $now = time();

        if (isset($attempts[$key])) {
            $attempts[$key] = array_values(array_filter($attempts[$key], fn($ts) => $ts > $now - 900));
        }
        if (count($attempts[$key] ?? []) >= 5) {
            return ['status' => 'error', 'message' => 'Too many attempts. Try again later.'];
        }

        // User JSON file
        $userFile = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . $userId . '.json';
        if (!file_exists($userFile)) {
            return ['status' => 'error', 'message' => 'User not found'];
        }

        $fp = fopen($userFile, 'c+');
        if (!$fp || !flock($fp, LOCK_EX)) {
            if ($fp) {
                fclose($fp);
            }
            return ['status' => 'error', 'message' => 'Server error'];
        }

        $fileContents = stream_get_contents($fp);
        $data = json_decode($fileContents, true) ?: [];

        if (empty($recoveryCode)) {
            flock($fp, LOCK_UN);
            fclose($fp);
            return ['status' => 'error', 'message' => 'Recovery code required'];
        }

        $storedHash = $data['totp_recovery_code'] ?? null;
        if (!$storedHash || !password_verify($recoveryCode, $storedHash)) {
            // record failed attempt
            $attempts[$key][] = $now;
            @file_put_contents($attemptsFile, json_encode($attempts, JSON_PRETTY_PRINT), LOCK_EX);
            flock($fp, LOCK_UN);
            fclose($fp);
            return ['status' => 'error', 'message' => 'Invalid recovery code'];
        }

        // Invalidate code
        $data['totp_recovery_code'] = null;
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        return ['status' => 'ok'];
    }

    /**
     * Generate random recovery code.
     */
    private static function generateRecoveryCode($length = 12)
    {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        $max   = strlen($chars) - 1;
        $code  = '';
        for ($i = 0; $i < $length; $i++) {
            $code .= $chars[random_int(0, $max)];
        }
        return $code;
    }

    /**
     * Save new TOTP recovery code (hash on disk) and return plaintext to caller.
     */
    public static function saveTOTPRecoveryCode($userId)
    {
        $userFile = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . $userId . '.json';

        if (!file_exists($userFile)) {
            if (file_put_contents($userFile, json_encode([], JSON_PRETTY_PRINT), LOCK_EX) === false) {
                return ['status' => 'error', 'message' => 'Server error: could not create user file'];
            }
        }

        $recoveryCode = self::generateRecoveryCode();
        $recoveryHash = password_hash($recoveryCode, PASSWORD_DEFAULT);

        $fp = fopen($userFile, 'c+');
        if (!$fp || !flock($fp, LOCK_EX)) {
            if ($fp) {
                fclose($fp);
            }
            return ['status' => 'error', 'message' => 'Server error: could not lock user file'];
        }

        $contents = stream_get_contents($fp);
        $data = json_decode($contents, true) ?: [];
        $data['totp_recovery_code'] = $recoveryHash;

        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        return ['status' => 'ok', 'recoveryCode' => $recoveryCode];
    }

    /**
     * Setup TOTP & build QR PNG.
     */
    public static function setupTOTP($username)
    {
        global $encryptionKey;
        $usersFile = USERS_DIR . USERS_FILE;

        if (!file_exists($usersFile)) {
            return ['error' => 'Users file not found'];
        }

        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $totpSecret = null;

        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 4 && strcasecmp($parts[0], $username) === 0 && !empty($parts[3])) {
                $totpSecret = decryptData($parts[3], $encryptionKey);
                break;
            }
        }

        $tfa = new \RobThree\Auth\TwoFactorAuth(
            new \RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider(),
            'FileRise',
            6,
            30,
            \RobThree\Auth\Algorithm::Sha1
        );

        if (!$totpSecret) {
            $totpSecret = $tfa->createSecret();
            $encryptedSecret = encryptData($totpSecret, $encryptionKey);

            $newLines = [];
            foreach ($lines as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) >= 3 && strcasecmp($parts[0], $username) === 0) {
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

        // Prefer admin-configured otpauth template if present
        $adminConfigFile = USERS_DIR . 'adminConfig.json';
        $globalOtpauthUrl = "";
        if (file_exists($adminConfigFile)) {
            $encryptedContent = file_get_contents($adminConfigFile);
            $decryptedContent = decryptData($encryptedContent, $encryptionKey);
            if ($decryptedContent !== false) {
                $config = json_decode($decryptedContent, true);
                if (!empty($config['globalOtpauthUrl'])) {
                    $globalOtpauthUrl = $config['globalOtpauthUrl'];
                }
            }
        }

        if (!empty($globalOtpauthUrl)) {
            $label = "FileRise:" . $username;
            $otpauthUrl = str_replace(
                ["{label}", "{secret}"],
                [urlencode($label), $totpSecret],
                $globalOtpauthUrl
            );
        } else {
            $label  = urlencode("FileRise:" . $username);
            $issuer = urlencode("FileRise");
            $otpauthUrl = "otpauth://totp/{$label}?secret={$totpSecret}&issuer={$issuer}";
        }

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
     * Get decrypted TOTP secret.
     */
    public static function getTOTPSecret($username)
    {
        global $encryptionKey;
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return null;
        }
        $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 4 && strcasecmp($parts[0], $username) === 0 && !empty($parts[3])) {
                return decryptData($parts[3], $encryptionKey);
            }
        }
        return null;
    }

    /**
     * Get role ('1' admin, '0' user) or null.
     */
    public static function getUserRole($username)
    {
        self::ensureUserCaseMigration();
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return null;
        }
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line));
            if (count($parts) >= 3 && strcasecmp($parts[0], $username) === 0) {
                return trim($parts[2]);
            }
        }
        return null;
    }

    /**
     * Get a single user’s info (admin flag, TOTP status, profile picture).
     */
    public static function getUser(string $username): array
    {
        self::ensureUserCaseMigration();
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return [];
        }

        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', $line);
            if (strcasecmp($parts[0], $username) !== 0) {
                continue;
            }
            $isAdmin     = (isset($parts[2]) && $parts[2] === '1');
            $totpEnabled = !empty($parts[3]);
            $pic         = isset($parts[4]) ? $parts[4] : '';

            if ($pic !== '') {
                $pic = fr_normalize_profile_pic_url($pic);
            }

            return [
                'username'        => $parts[0],
                'isAdmin'         => $isAdmin,
                'totp_enabled'    => $totpEnabled,
                'profile_picture' => $pic,
            ];
        }

        return [];
    }

    /**
     * Persist profile picture URL as 5th field (keeps TOTP secret intact).
     *
     * users.txt: username:hash:isAdmin:totp_secret:profile_picture
     */
    public static function setProfilePicture(string $username, string $url): array
    {
        $usersFile = USERS_DIR . USERS_FILE;
        if (!file_exists($usersFile)) {
            return ['success' => false, 'error' => 'Users file not found'];
        }

        // Ensure leading slash (consistent with controller response)
        $url = '/' . ltrim($url, '/');

        $lines = file($usersFile, FILE_IGNORE_NEW_LINES) ?: [];
        $out   = [];
        $found = false;

        foreach ($lines as $line) {
            if ($line === '') {
                $out[] = $line;
                continue;
            }
            $parts = explode(':', $line);
            if (strcasecmp($parts[0], $username) === 0) {
                $found = true;
                while (count($parts) < 5) {
                    $parts[] = '';
                }
                $parts[4] = $url;
                $line = implode(':', $parts);
            }
            $out[] = $line;
        }

        if (!$found) {
            return ['success' => false, 'error' => 'User not found'];
        }

        $newContent = implode(PHP_EOL, $out) . PHP_EOL;
        if (file_put_contents($usersFile, $newContent, LOCK_EX) === false) {
            return ['success' => false, 'error' => 'Failed to write users file'];
        }

        return ['success' => true];
    }
}
