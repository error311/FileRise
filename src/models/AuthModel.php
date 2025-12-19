<?php
// src/models/AuthModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';

class AuthModel
{

    public static function isOidcDemoteAllowed(): bool
{
    // 1) Container / env always wins if set
    if (defined('FR_OIDC_ALLOW_DEMOTE')) {
        return FR_OIDC_ALLOW_DEMOTE;
    }

    // 2) Fallback to admin panel config
    try {
        $cfg = AdminModel::getConfig();
        return !empty($cfg['oidc']['allowDemote']);
    } catch (\Throwable $e) {
        error_log('OIDC allowDemote check failed: ' . $e->getMessage());
        return false;
    }
}
    /**
     * Retrieves the user's role from the users file.
     *
     * @param string $username
     * @return string|null The role string (e.g. "1" for admin) or null if not found.
     */
    public static function getUserRole(string $username): ?string
    {
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
     * Ensure a local FileRise account exists for an OIDC user, and keep
     * their admin flag in sync with the IdP on every OIDC login.
     *
     * - If the user does not exist and FR_OIDC_AUTO_CREATE is true, a new user
     *   is created with a random password and role "1" (admin) or "0" (user).
     * - If the user already exists, we set their role to match $isAdminByIdp
     *   (so removing them from the IdP admin role will demote them in FileRise).
     *
     * Returns: ['success' => true] or ['error' => '...']
     */
    public static function ensureLocalOidcUser(string $username, bool $isAdminByIdp): array
{
    if (!preg_match(REGEX_USER, $username)) {
        return ['error' => 'OIDC username is not a valid FileRise username'];
    }

    $usersFile = USERS_DIR . USERS_FILE;

    if (!file_exists($usersFile)) {
        if (file_put_contents($usersFile, '', LOCK_EX) === false) {
            return ['error' => 'Users file not found and could not be created.'];
        }
    }

    $lines      = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $foundIndex = null;

    foreach ($lines as $i => $line) {
        $parts = explode(':', trim($line));
        if (count($parts) < 3) {
            continue;
        }
        if (strcasecmp($parts[0], $username) === 0) {
            $foundIndex = $i;
            break;
        }
    }

    // Role according to IdP for THIS login
    $roleFromIdp = $isAdminByIdp ? '1' : '0';

    if ($foundIndex === null) {
        // No existing user → auto-create (if allowed)
        if (!defined('FR_OIDC_AUTO_CREATE') || !FR_OIDC_AUTO_CREATE) {
            return ['error' => 'User does not exist in FileRise and auto-create is disabled.'];
        }

        $randomPassword = bin2hex(random_bytes(16));
        $hash           = password_hash($randomPassword, PASSWORD_BCRYPT);

        // Standard 3-field format: username:hash:role
        $lines[] = $username . ':' . $hash . ':' . $roleFromIdp;
    } else {
        $rawLine = trim($lines[$foundIndex]);
        $parts   = explode(':', $rawLine);

        if (count($parts) < 3) {
            $parts = array_pad($parts, 3, '');
        }

               // username, hash, role
        $usernameExisting = $parts[0];
        $hashExisting     = $parts[1];
        $currentRole      = ($parts[2] === '1') ? '1' : '0';

        // Always allow promotion: if IdP says admin, make them admin locally.
        if ($isAdminByIdp && $currentRole !== '1') {
            $parts[2] = '1';
        }

        // Demotion: only if the IdP says "not admin" AND demotion is allowed.
        if (!$isAdminByIdp && self::isOidcDemoteAllowed() && $currentRole !== '0') {
            $parts[2] = '0';
        }

        $lines[$foundIndex] = implode(':', $parts);
    }

    $payload = $lines ? (implode(PHP_EOL, $lines) . PHP_EOL) : '';
    if (file_put_contents($usersFile, $payload, LOCK_EX) === false) {
        return ['error' => 'Failed to update users file for OIDC user.'];
    }

    return ['success' => true];
}

    /**
     * Map OIDC groups into FileRise Pro groups (additive only – we never remove membership).
     *
     * @param string $username   Local FileRise username
     * @param array  $groupSlugs Array of group keys coming from the IdP,
     *                           already filtered by FR_OIDC_GROUP_PREFIX.
     */
    public static function applyOidcGroupsToPro(string $username, array $groupSlugs): void
{
    if (empty($groupSlugs)) {
        return;
    }
    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
        return;
    }
    if (!defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
        return;
    }

    $bundleDir     = rtrim(FR_PRO_BUNDLE_DIR, '/\\');
    $proGroupsPath = $bundleDir . '/ProGroups.php';
    if (!is_file($proGroupsPath)) {
        error_log('[OIDC] ProGroups.php not found at ' . $proGroupsPath);
        return;
    }

    require_once $proGroupsPath;
    if (!class_exists('ProGroups')) {
        error_log('[OIDC] ProGroups class not found after include.');
        return;
    }

    $store = new \ProGroups($bundleDir);

    // IMPORTANT: use load() so we preserve the full { "groups": ... } structure
    $data = $store->load();
    if (!is_array($data)) {
        $data = [];
    }
    if (!isset($data['groups']) || !is_array($data['groups'])) {
        $data['groups'] = [];
    }

    $groups = &$data['groups'];

    // Build lowercase key index for case-insensitive lookups of existing groups
    $keyIndex = [];
    foreach ($groups as $key => $_info) {
        $keyIndex[strtolower((string)$key)] = $key;
    }

    $uname   = (string)$username;
    $unameLc = strtolower($uname);

    foreach ($groupSlugs as $rawSlug) {
        $slug = trim((string)$rawSlug);
        if ($slug === '') {
            continue;
        }

        $slugLc = strtolower($slug);

        // 1) Find existing group (case-insensitive) or auto-create a new one keyed by the slug
        if (isset($keyIndex[$slugLc])) {
            $groupKey = $keyIndex[$slugLc];
        } else {
            $groupKey = $slug;
            $groups[$groupKey] = [
                'name'    => $slug,
                'label'   => 'OIDC: ' . $slug,
                'members' => [],
                'grants'  => [], // ACLs still managed in FileRise UI
            ];
            $keyIndex[$slugLc] = $groupKey;
            error_log('[OIDC] Auto-created Pro group ' . $groupKey . ' for user ' . $uname);
        }

        // 2) Ensure user is a member of that group (case-insensitive)
        $group   = $groups[$groupKey] ?? [];
        $members = isset($group['members']) && is_array($group['members'])
            ? $group['members']
            : [];

        $already = false;
        foreach ($members as $m) {
            if (strcasecmp((string)$m, $uname) === 0) {
                $already = true;
                break;
            }
        }

        if (!$already) {
            $members[] = $uname;
            $group['members'] = array_values($members);
            $groups[$groupKey] = $group;
            error_log('[OIDC] Added ' . $uname . ' to Pro group ' . $groupKey);
        }
    }

    // 3) Save the updated structure; nothing is removed
    try {
        if (!$store->save($data)) {
            error_log('[OIDC] Failed to save Pro groups after sync for ' . $uname);
        }
    } catch (\Throwable $e) {
        error_log('[OIDC] Pro group sync error for ' . $uname . ': ' . $e->getMessage());
    }
}
    /**
     * Authenticates the user using form-based credentials.
     *
     * @param string $username
     * @param string $password
     * @return array|false Returns an associative array with user data (role, totp_secret) on success or false on failure.
     */
    public static function authenticate(string $username, string $password)
    {
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
    public static function loadFailedAttempts(string $file): array
    {
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
    public static function saveFailedAttempts(string $file, array $data): void
    {
        file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
    }

    /**
     * Retrieves a user's TOTP secret from the users file.
     *
     * @param string $username
     * @return string|null Returns the decrypted TOTP secret or null if not set.
     */
    public static function getUserTOTPSecret(string $username): ?string
    {
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
    public static function loadFolderPermission(string $username): bool
    {
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

    /**
     * Validate a remember-me token and return its stored payload.
     *
     * @param string $token
     * @return array|null  Returns ['username'=>…, 'expiry'=>…, 'isAdmin'=>…] or null if invalid/expired.
     */
    public static function validateRememberToken(string $token): ?array
    {
        $all = self::loadRememberTokenStore();
        if (!$all) {
            return null;
        }

        $hash = self::rememberTokenHash($token);
        $payload = $all[$hash] ?? ($all[$token] ?? null);
        if (empty($payload) || !isset($payload['expiry']) || $payload['expiry'] < time()) {
            if (!empty($payload)) {
                unset($all[$hash], $all[$token]);
                self::saveRememberTokenStore($all);
            }
            return null;
        }

        return $payload;
    }

    /**
     * Validate and rotate a remember-me token.
     *
     * @param string $token
     * @return array|null Returns payload + new token on success, or null if invalid/expired.
     */
    public static function consumeRememberToken(string $token): ?array
    {
        $all = self::loadRememberTokenStore();
        if (!$all) {
            return null;
        }

        $hash = self::rememberTokenHash($token);
        $payload = $all[$hash] ?? null;
        $legacyKey = null;

        if ($payload === null && isset($all[$token])) {
            $payload = $all[$token];
            $legacyKey = $token;
        }

        if (empty($payload) || !isset($payload['expiry']) || $payload['expiry'] < time()) {
            if (!empty($payload)) {
                unset($all[$hash]);
                if ($legacyKey !== null) {
                    unset($all[$legacyKey]);
                }
                self::saveRememberTokenStore($all);
            }
            return null;
        }

        $username = (string)($payload['username'] ?? '');
        if ($username === '') {
            unset($all[$hash]);
            if ($legacyKey !== null) {
                unset($all[$legacyKey]);
            }
            self::saveRememberTokenStore($all);
            return null;
        }

        $expiry = (int)$payload['expiry'];
        $isAdmin = !empty($payload['isAdmin']);

        $newToken = bin2hex(random_bytes(32));
        $newHash = self::rememberTokenHash($newToken);

        $all[$newHash] = [
            'username' => $username,
            'expiry'   => $expiry,
            'isAdmin'  => $isAdmin
        ];

        unset($all[$hash]);
        if ($legacyKey !== null) {
            unset($all[$legacyKey]);
        }

        self::saveRememberTokenStore($all);

        return [
            'username' => $username,
            'expiry'   => $expiry,
            'isAdmin'  => $isAdmin,
            'token'    => $newToken
        ];
    }

    /**
     * Issue a new remember-me token and store it hashed on disk.
     *
     * @param string $username
     * @param bool   $isAdmin
     * @param int|null $expiry
     * @return array{token:string,expiry:int}
     */
    public static function issueRememberToken(string $username, bool $isAdmin, ?int $expiry = null): array
    {
        $expiry = $expiry ?? (time() + 30 * 24 * 60 * 60);
        $token = bin2hex(random_bytes(32));

        $all = self::loadRememberTokenStore();
        $all[self::rememberTokenHash($token)] = [
            'username' => $username,
            'expiry'   => $expiry,
            'isAdmin'  => $isAdmin
        ];
        self::saveRememberTokenStore($all);

        return ['token' => $token, 'expiry' => $expiry];
    }

    /**
     * Revoke a remember-me token (hashed or legacy).
     *
     * @param string $token
     * @return void
     */
    public static function revokeRememberToken(string $token): void
    {
        $all = self::loadRememberTokenStore();
        if (!$all) {
            return;
        }

        $hash = self::rememberTokenHash($token);
        $changed = false;

        if (isset($all[$hash])) {
            unset($all[$hash]);
            $changed = true;
        }
        if (isset($all[$token])) {
            unset($all[$token]);
            $changed = true;
        }

        if ($changed) {
            self::saveRememberTokenStore($all);
        }
    }

    protected static function rememberTokenHash(string $token): string
    {
        $key = $GLOBALS['encryptionKey'] ?? '';
        return hash_hmac('sha256', $token, $key);
    }

    protected static function loadRememberTokenStore(): array
    {
        $tokFile = USERS_DIR . 'persistent_tokens.json';
        if (!file_exists($tokFile)) {
            return [];
        }

        $encrypted = file_get_contents($tokFile);
        $json      = decryptData($encrypted, $GLOBALS['encryptionKey']);
        $decoded   = ($json !== false) ? $json : $encrypted;
        $all       = json_decode($decoded, true);

        return is_array($all) ? $all : [];
    }

    protected static function saveRememberTokenStore(array $tokens): void
    {
        $tokFile = USERS_DIR . 'persistent_tokens.json';
        file_put_contents(
            $tokFile,
            encryptData(json_encode($tokens, JSON_PRETTY_PRINT), $GLOBALS['encryptionKey']),
            LOCK_EX
        );
    }

     /**
     * Given OIDC claims, derive a FileRise username and optionally auto-create it.
     *
     * - Tries preferred_username, then email local part, validated against REGEX_USER.
     * - If nothing valid, falls back to "oidc_<hash>".
     * - If a matching users.txt entry exists, returns that username.
     * - If none exists and FR_OIDC_AUTO_CREATE is false (default), returns null.
     * - If FR_OIDC_AUTO_CREATE is true, creates a non-admin user with a random password.
     */
    public static function ensureOidcUserFromClaims(
        ?string $preferredUsername,
        ?string $email,
        ?string $sub
    ): ?string {
        $candidates = [];

        if (is_string($preferredUsername) && $preferredUsername !== '') {
            $candidates[] = trim($preferredUsername);
        }

        if (is_string($email) && $email !== '') {
            $at = strpos($email, '@');
            if ($at !== false) {
                $local = substr($email, 0, $at);
                $candidates[] = trim($local);
            }
        }

        $username = null;
        foreach ($candidates as $cand) {
            $cand = trim($cand);
            if ($cand !== '' && preg_match(REGEX_USER, $cand)) {
                $username = $cand;
                break;
            }
        }

        // Fallback if nothing matched REGEX_USER
        if ($username === null) {
            $base = $sub ?: bin2hex(random_bytes(8));
            $username = 'oidc_' . substr(sha1($base), 0, 16);
        }

        $usersFile = USERS_DIR . USERS_FILE;
        if (file_exists($usersFile)) {
            foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $parts = explode(':', trim($line));
                if (count($parts) >= 3 && $parts[0] === $username) {
                    return $username;
                }
            }
        }

        // No match in users.txt → only continue if auto-create is enabled
        if (!defined('FR_OIDC_AUTO_CREATE') || !FR_OIDC_AUTO_CREATE) {
            return null;
        }

        // Auto-create as a non-admin with a random password (SSO-only account).
        $randomPassword = bin2hex(random_bytes(16));
        $isAdmin        = '0';

        $result = UserModel::addUser($username, $randomPassword, $isAdmin, false);
        if (isset($result['error'])) {
            error_log('OIDC auto-create failed for ' . $username . ': ' . $result['error']);
            return null;
        }

        return $username;
    }

    /**
     * Sync IdP groups into FileRise Pro groups using a prefix-based mapping.
     *
     * - Only runs when FR_PRO_ACTIVE + FR_PRO_BUNDLE_DIR + FR_OIDC_PRO_GROUP_PREFIX are set.
     * - Only groups whose *IdP name* starts with FR_OIDC_PRO_GROUP_PREFIX are considered.
     * - The Pro group name is derived from the suffix, normalized to [a-z0-9_-].
     * - For those Pro groups:
     *     - Ensure the group exists.
     *     - Ensure $username is in members[].
     *     - Remove $username from any *other* FR_OIDC_PRO_GROUP_PREFIX groups they no longer have.
     * - Does NOT touch per-folder grants; admins still configure ACLs via the Pro UI.
     */
    public static function syncOidcGroupsToPro(string $username, array $groups): void
    {
        if (empty($groups)) {
            return;
        }
        if (
            !defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE ||
            !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR ||
            !defined('FR_OIDC_PRO_GROUP_PREFIX')
        ) {
            return;
        }

        $prefix    = (string)FR_OIDC_PRO_GROUP_PREFIX;
        $prefixLen = strlen($prefix);

        // Normalize incoming groups to a clean list of strings
        $raw = [];
        foreach ($groups as $g) {
            $g = trim((string)$g);
            if ($g !== '') {
                $raw[] = $g;
            }
        }
        if (!$raw) {
            return;
        }

        // Map IdP groups → Pro group names (suffix of prefix, normalized)
$desiredNames = [];
foreach ($raw as $g) {
    if ($prefix === '' || stripos($g, $prefix) === 0) {
        $slug = ($prefix === '')
            ? $g
            : substr($g, $prefixLen);

        $slug = strtolower(preg_replace('/[^a-z0-9_\-]/i', '_', $slug));
        if ($slug !== '') {
            $desiredNames[] = $slug;
        }
    }
}
$desiredNames = array_values(array_unique($desiredNames));
if (!$desiredNames) {
    return;
}

        $proGroupsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProGroups.php';
        if (!is_file($proGroupsPath)) {
            return;
        }

        require_once $proGroupsPath;
        if (!class_exists('ProGroups')) {
            return;
        }

        $store = new ProGroups(FR_PRO_BUNDLE_DIR);
        $data  = $store->listGroups();
        if (!is_array($data)) {
            $data = [];
        }
        if (!isset($data['groups']) || !is_array($data['groups'])) {
            $data['groups'] = [];
        }
        $groupsArr = $data['groups'];

        // Upsert the OIDC-managed groups and ensure $username is a member
        foreach ($desiredNames as $name) {
            if (!isset($groupsArr[$name]) || !is_array($groupsArr[$name])) {
                $groupsArr[$name] = [
                    'name'    => $name,
                    'label'   => 'OIDC: ' . $name,
                    'members' => [],
                    'grants'  => $groupsArr[$name]['grants'] ?? [],
                ];
            }

            $members = $groupsArr[$name]['members'] ?? [];
            if (!is_array($members)) {
                $members = [];
            }

            $already = false;
            foreach ($members as $m) {
                if (strcasecmp((string)$m, $username) === 0) {
                    $already = true;
                    break;
                }
            }
            if (!$already) {
                $members[] = $username;
            }

            $groupsArr[$name]['members'] = array_values($members);
        }

        // Remove user from any other OIDC-managed groups they no longer have
        foreach ($groupsArr as $name => &$info) {
            $managedByPrefix = ($prefix === '')
                ? true           // with empty prefix, we treat all groups here as OIDC-managed
                : (stripos($name, $prefix) === 0);
        
            if ($managedByPrefix && !in_array($name, $desiredNames, true)) {
                $members = $info['members'] ?? [];
                if (is_array($members) && $members) {
                    $info['members'] = array_values(array_filter(
                        $members,
                        fn($m) => strcasecmp((string)$m, $username) !== 0
                    ));
                }
            }
        }
        unset($info);

        $data['groups'] = $groupsArr;

        try {
            $store->save($data);
        } catch (\Throwable $e) {
            error_log('OIDC Pro group sync failed: ' . $e->getMessage());
        }
    }

}
