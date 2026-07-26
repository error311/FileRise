<?php

namespace FileRise\Domain;

use FileRise\Domain\AdminModel;
use FileRise\Domain\UserModel;
use ProGroups;

// src/models/AuthModel.php

require_once PROJECT_ROOT . '/config/config.php';

class AuthModel
{
    private const FAIL2BAN_LOG_MAX_BYTES = 50 * 1024 * 1024;
    private const FAIL2BAN_LOG_MAX_FILES = 5;
    private const OIDC_IDENTITIES_FILE = 'oidc_identities.json';
    private const OIDC_IDENTITIES_LOCK_FILE = '.oidc_identities.lock';

    public static function userExists(string $username): bool
    {
        return UserModel::getUserRole($username) !== null;
    }

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

    private static function loadOidcIdentityStore(): array
    {
        $path = USERS_DIR . self::OIDC_IDENTITIES_FILE;
        if (!is_file($path)) {
            return ['version' => 1, 'identities' => []];
        }

        $raw = file_get_contents($path);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (
            !is_array($decoded)
            || !isset($decoded['identities'])
            || !is_array($decoded['identities'])
        ) {
            throw new \RuntimeException('OIDC identity binding store is invalid.');
        }

        return $decoded;
    }

    private static function saveOidcIdentityStore(array $store): bool
    {
        $path = USERS_DIR . self::OIDC_IDENTITIES_FILE;
        $payload = json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            return false;
        }
        $payload .= PHP_EOL;

        $tmpPath = tempnam(USERS_DIR, '.oidc_identities_');
        if ($tmpPath === false) {
            return false;
        }

        $ok = false;
        $handle = @fopen($tmpPath, 'wb');
        if ($handle !== false) {
            $offset = 0;
            $length = strlen($payload);
            while ($offset < $length) {
                $written = fwrite($handle, substr($payload, $offset));
                if ($written === false || $written === 0) {
                    break;
                }
                $offset += $written;
            }
            $ok = $offset === $length && fflush($handle);
            fclose($handle);
        }

        @chmod($tmpPath, 0660);
        if ($ok) {
            $ok = @rename($tmpPath, $path);
        }
        if (!$ok) {
            @unlink($tmpPath);
        }

        return $ok;
    }

    private static function oidcBindingUsername($entry): string
    {
        if (is_string($entry)) {
            return trim($entry);
        }
        if (is_array($entry)) {
            return trim((string)($entry['username'] ?? ''));
        }
        return '';
    }

    public static function removeOidcBindingsForUser(string $username): bool
    {
        $username = trim($username);
        if ($username === '' || !is_file(USERS_DIR . self::OIDC_IDENTITIES_FILE)) {
            return true;
        }

        $lockHandle = @fopen(USERS_DIR . self::OIDC_IDENTITIES_LOCK_FILE, 'c');
        if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
            if (is_resource($lockHandle)) {
                fclose($lockHandle);
            }
            return false;
        }

        try {
            try {
                $store = self::loadOidcIdentityStore();
            } catch (\Throwable $e) {
                return false;
            }

            $changed = false;
            foreach ($store['identities'] as $identityKey => $entry) {
                $boundUsername = self::oidcBindingUsername($entry);
                if ($boundUsername !== '' && strcasecmp($boundUsername, $username) === 0) {
                    unset($store['identities'][$identityKey]);
                    $changed = true;
                }
            }

            return !$changed || self::saveOidcIdentityStore($store);
        } finally {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }
    }

    /**
     * Resolve a validated OIDC issuer/subject pair to one local account.
     *
     * Human-readable claims may name a new account, but cannot attach an
     * unbound identity to an existing account. Existing accounts require a
     * recently authenticated session for the same canonical username.
     */
    public static function ensureLocalOidcUser(
        string $suggestedUsername,
        bool $isAdminByIdp,
        string $issuer,
        string $subject,
        ?string $recentlyAuthenticatedUsername = null
    ): array {
        $suggestedUsername = trim($suggestedUsername);
        $issuer = trim($issuer);
        $subject = trim($subject);
        if (!preg_match(REGEX_USER, $suggestedUsername) || $issuer === '' || $subject === '') {
            return ['error' => 'OIDC identity is incomplete or has an invalid username'];
        }

        $lockPath = USERS_DIR . self::OIDC_IDENTITIES_LOCK_FILE;
        $lockHandle = @fopen($lockPath, 'c');
        if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
            if (is_resource($lockHandle)) {
                fclose($lockHandle);
            }
            return ['error' => 'OIDC identity binding is temporarily unavailable.'];
        }

        try {
            try {
                $store = self::loadOidcIdentityStore();
            } catch (\Throwable $e) {
                error_log('FileRise: failed to read the OIDC identity binding store.');
                return ['error' => 'OIDC identity binding is temporarily unavailable.'];
            }

            $identityKey = hash('sha256', $issuer . "\0" . $subject);
            $entries = $store['identities'];
            $bindingExists = array_key_exists($identityKey, $entries);
            $provisioning = false;
            $username = '';

            if ($bindingExists) {
                $entry = $entries[$identityKey];
                $username = self::oidcBindingUsername($entry);
                $provisioning = is_array($entry) && !empty($entry['provisioning']);
                if ($username === '' || !preg_match(REGEX_USER, $username)) {
                    return ['error' => 'OIDC identity binding is invalid.'];
                }
            }

            $usersFile = USERS_DIR . USERS_FILE;
            if (!file_exists($usersFile) && file_put_contents($usersFile, '', LOCK_EX) === false) {
                return ['error' => 'Users file not found and could not be created.'];
            }

            $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            $findUser = static function (array $userLines, string $needle): ?int {
                foreach ($userLines as $index => $line) {
                    $parts = explode(':', trim($line));
                    if (count($parts) >= 3 && strcasecmp($parts[0], $needle) === 0) {
                        return $index;
                    }
                }
                return null;
            };

            $foundIndex = $bindingExists ? $findUser($lines, $username) : $findUser($lines, $suggestedUsername);

            if (!$bindingExists) {
                if ($foundIndex !== null) {
                    $parts = explode(':', trim($lines[$foundIndex]));
                    $username = (string)$parts[0];
                } else {
                    if (!defined('FR_OIDC_AUTO_CREATE') || !FR_OIDC_AUTO_CREATE) {
                        return ['error' => 'User does not exist in FileRise and auto-create is disabled.'];
                    }
                    $username = $suggestedUsername;
                    $provisioning = true;
                }

                foreach ($entries as $existingKey => $entry) {
                    $existingUsername = self::oidcBindingUsername($entry);
                    if (
                        $existingKey !== $identityKey
                        && $existingUsername !== ''
                        && strcasecmp($existingUsername, $username) === 0
                    ) {
                        return ['error' => 'This local account is already linked to another OIDC identity.'];
                    }
                }

                if (
                    $foundIndex !== null
                    && (
                        $recentlyAuthenticatedUsername === null
                        || strcasecmp($recentlyAuthenticatedUsername, $username) !== 0
                    )
                ) {
                    return [
                        'linkRequired' => true,
                        'username' => $username,
                    ];
                }

                $entries[$identityKey] = [
                    'username' => $username,
                    'provisioning' => $provisioning,
                ];
                $store['version'] = 1;
                $store['identities'] = $entries;
                if (!self::saveOidcIdentityStore($store)) {
                    return ['error' => 'Failed to save OIDC identity binding.'];
                }
            }

            if ($foundIndex === null) {
                if (!$provisioning) {
                    return ['error' => 'The local account linked to this OIDC identity no longer exists.'];
                }
                if (!defined('FR_OIDC_AUTO_CREATE') || !FR_OIDC_AUTO_CREATE) {
                    return ['error' => 'User does not exist in FileRise and auto-create is disabled.'];
                }

                $randomPassword = bin2hex(random_bytes(16));
                $hash = password_hash($randomPassword, PASSWORD_BCRYPT);
                $lines[] = $username . ':' . $hash . ':' . ($isAdminByIdp ? '1' : '0');
                $foundIndex = count($lines) - 1;
            } else {
                $parts = explode(':', trim($lines[$foundIndex]));
                if (count($parts) < 3) {
                    $parts = array_pad($parts, 3, '');
                }
                $currentRole = ($parts[2] === '1') ? '1' : '0';

                if ($isAdminByIdp && $currentRole !== '1') {
                    $parts[2] = '1';
                }
                if (!$isAdminByIdp && self::isOidcDemoteAllowed() && $currentRole !== '0') {
                    $parts[2] = '0';
                }
                $lines[$foundIndex] = implode(':', $parts);
            }

            $payload = $lines ? (implode(PHP_EOL, $lines) . PHP_EOL) : '';
            if (file_put_contents($usersFile, $payload, LOCK_EX) === false) {
                return ['error' => 'Failed to update users file for OIDC user.'];
            }

            if ($provisioning) {
                $store['identities'][$identityKey]['provisioning'] = false;
                if (!self::saveOidcIdentityStore($store)) {
                    return ['error' => 'Failed to finalize OIDC identity binding.'];
                }
            }

            return ['success' => true, 'username' => $username];
        } finally {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }
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
            if (count($parts) < 3) {
                continue;
            }
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

    public static function authenticateWebDav(string $username, string $password): bool
    {
        $user = self::authenticate($username, $password);
        if ($user === false) {
            return false;
        }
        if (!empty($user['totp_secret'])) {
            error_log('FileRise: denied WebDAV password-only login for TOTP-enabled user ' . self::sanitizeLogValue($username, 80));
            return false;
        }
        return true;
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

    public static function getFailedLoginKey(string $ip, string $username): string
    {
        $ip = trim($ip);
        $user = trim($username);
        if ($user !== '') {
            $user = strtolower($user);
            $ipKey = $ip !== '' ? $ip : 'unknown';
            return $ipKey . '|' . $user;
        }
        return $ip !== '' ? $ip : 'unknown';
    }

    public static function getClientIp(?array $server = null): string
    {
        $server = $server ?? $_SERVER;
        $remote = trim((string)($server['REMOTE_ADDR'] ?? ''));

        $trusted = self::getTrustedProxies();
        if ($remote !== '' && $trusted && self::isTrustedProxy($remote, $trusted)) {
            $headerName = defined('FR_IP_HEADER') ? (string)FR_IP_HEADER : 'X-Forwarded-For';
            $headerKey = self::normalizeHeaderKey($headerName);
            $headerVal = trim((string)($server[$headerKey] ?? ''));
            if ($headerVal !== '') {
                $candidate = $headerVal;
                if (strpos($candidate, ',') !== false) {
                    $parts = explode(',', $candidate);
                    $candidate = trim($parts[0]);
                }
                if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                    return $candidate;
                }
            }
        }

        if ($remote !== '' && filter_var($remote, FILTER_VALIDATE_IP)) {
            return $remote;
        }

        return $remote !== '' ? $remote : 'unknown';
    }

    protected static function sanitizeLogValue(string $value, int $maxLen = 120): string
    {
        $value = str_replace(["\r", "\n", "\t"], ' ', $value);
        $value = str_replace('"', "'", $value);
        $value = trim($value);
        if ($maxLen > 0 && strlen($value) > $maxLen) {
            $value = substr($value, 0, $maxLen);
        }
        return $value;
    }

    public static function logFailedLogin(string $ip, string $username, string $reason, string $userAgent = ''): void
    {
        $logFile = USERS_DIR . 'fail2ban.log';
        $ts = date('Y-m-d H:i:s');

        $ip = self::sanitizeLogValue($ip, 64);
        $username = self::sanitizeLogValue($username, 80);
        $reason = self::sanitizeLogValue($reason, 60);
        $ua = $userAgent !== '' ? $userAgent : ($_SERVER['HTTP_USER_AGENT'] ?? '');
        $ua = self::sanitizeLogValue($ua, 200);

        $line = $ts
            . ' filerise_auth failed_login ip=' . ($ip !== '' ? $ip : 'unknown')
            . ' user=' . ($username !== '' ? $username : 'unknown')
            . ' reason=' . ($reason !== '' ? $reason : 'unknown');
        if ($ua !== '') {
            $line .= ' ua="' . $ua . '"';
        }
        $line .= "\n";

        self::rotateFail2banLog($logFile);
        @file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
    }

    protected static function rotateFail2banLog(string $logFile): void
    {
        $maxBytes = self::FAIL2BAN_LOG_MAX_BYTES;
        $maxFiles = self::FAIL2BAN_LOG_MAX_FILES;
        if ($maxBytes <= 0 || $maxFiles <= 1) {
            return;
        }
        if (!file_exists($logFile)) {
            return;
        }
        $size = @filesize($logFile);
        if ($size === false || $size < $maxBytes) {
            return;
        }

        $maxRotated = $maxFiles - 1;
        for ($i = $maxRotated; $i >= 1; $i--) {
            $src = $logFile . '.' . $i;
            if ($i === $maxRotated) {
                if (file_exists($src)) {
                    @unlink($src);
                }
                continue;
            }
            $dst = $logFile . '.' . ($i + 1);
            if (file_exists($src)) {
                @rename($src, $dst);
            }
        }
        @rename($logFile, $logFile . '.1');
    }

    protected static function getTrustedProxies(): array
    {
        $raw = '';
        if (defined('FR_TRUSTED_PROXIES')) {
            $raw = FR_TRUSTED_PROXIES;
        } else {
            $env = getenv('FR_TRUSTED_PROXIES');
            if ($env !== false && $env !== '') {
                $raw = $env;
            }
        }

        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $parts = array_map('trim', explode(',', $raw));
        return array_values(array_filter($parts, fn($part) => $part !== ''));
    }

    public static function isRequestFromTrustedProxy(?array $server = null): bool
    {
        $server = $server ?? $_SERVER;
        $remote = trim((string)($server['REMOTE_ADDR'] ?? ''));
        if ($remote === '' || !filter_var($remote, FILTER_VALIDATE_IP)) {
            return false;
        }

        $trusted = self::getTrustedProxies();
        return $trusted !== [] && self::isTrustedProxy($remote, $trusted);
    }

    protected static function normalizeHeaderKey(string $header): string
    {
        $key = strtoupper(str_replace('-', '_', trim($header)));
        if ($key === 'REMOTE_ADDR') {
            return $key;
        }
        if (strpos($key, 'HTTP_') !== 0) {
            $key = 'HTTP_' . $key;
        }
        return $key;
    }

    protected static function isTrustedProxy(string $ip, array $trusted): bool
    {
        foreach ($trusted as $entry) {
            $entry = trim((string)$entry);
            if ($entry === '') {
                continue;
            }
            if (strpos($entry, '/') === false) {
                if ($ip === $entry) {
                    return true;
                }
                continue;
            }
            if (self::ipInCidr($ip, $entry)) {
                return true;
            }
        }
        return false;
    }

    protected static function ipInCidr(string $ip, string $cidr): bool
    {
        $cidr = trim($cidr);
        if ($cidr === '' || strpos($cidr, '/') === false) {
            return false;
        }
        [$subnet, $maskRaw] = explode('/', $cidr, 2);
        $subnet = trim($subnet);
        $mask = (int)trim($maskRaw);

        if (!filter_var($ip, FILTER_VALIDATE_IP) || !filter_var($subnet, FILTER_VALIDATE_IP)) {
            return false;
        }

        if (strpos($ip, ':') !== false || strpos($subnet, ':') !== false) {
            if ($mask < 0 || $mask > 128) {
                return false;
            }
            $ipBin = inet_pton($ip);
            $netBin = inet_pton($subnet);
            if ($ipBin === false || $netBin === false) {
                return false;
            }
            $bytes = intdiv($mask, 8);
            $bits = $mask % 8;
            if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($netBin, 0, $bytes)) {
                return false;
            }
            if ($bits > 0) {
                $maskByte = (~((1 << (8 - $bits)) - 1)) & 0xFF;
                if ((ord($ipBin[$bytes]) & $maskByte) !== (ord($netBin[$bytes]) & $maskByte)) {
                    return false;
                }
            }
            return true;
        }

        if ($mask < 0 || $mask > 32) {
            return false;
        }
        $ipLong = ip2long($ip);
        $netLong = ip2long($subnet);
        if ($ipLong === false || $netLong === false) {
            return false;
        }
        $maskLong = $mask === 0 ? 0 : (-1 << (32 - $mask));
        return (($ipLong & $maskLong) === ($netLong & $maskLong));
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
     * @return array|null  Returns ['username'=>…, 'expiry'=>…] or null if invalid/expired.
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

        $username = (string)($payload['username'] ?? '');
        if ($username === '' || !self::userExists($username)) {
            unset($all[$hash], $all[$token]);
            self::saveRememberTokenStore($all);
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

        if (!self::userExists($username)) {
            unset($all[$hash]);
            if ($legacyKey !== null) {
                unset($all[$legacyKey]);
            }
            self::saveRememberTokenStore($all);
            return null;
        }

        $expiry = (int)$payload['expiry'];

        $newToken = bin2hex(random_bytes(32));
        $newHash = self::rememberTokenHash($newToken);

        $all[$newHash] = [
            'username' => $username,
            'expiry'   => $expiry
        ];

        unset($all[$hash]);
        if ($legacyKey !== null) {
            unset($all[$legacyKey]);
        }

        self::saveRememberTokenStore($all);

        return [
            'username' => $username,
            'expiry'   => $expiry,
            'token'    => $newToken
        ];
    }

    /**
     * Issue a new remember-me token and store it hashed on disk.
     *
     * @param string $username
     * @param bool   $isAdmin Kept for call-site compatibility; roles are resolved from users.txt on use.
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
            'expiry'   => $expiry
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

    public static function revokeRememberTokensForUser(string $username): void
    {
        $all = self::loadRememberTokenStore();
        if (!$all) {
            return;
        }

        $changed = false;
        foreach ($all as $key => $payload) {
            $storedUser = is_array($payload) ? (string)($payload['username'] ?? '') : '';
            if ($storedUser !== '' && strcasecmp($storedUser, $username) === 0) {
                unset($all[$key]);
                $changed = true;
            }
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
     * Backward-compatible helper for callers that only provide basic OIDC claims.
     *
     * The email argument is intentionally not used because this legacy signature
     * cannot establish email_verified. Identity resolution still uses the secure
     * issuer/subject binding path and cannot attach to an existing local account.
     */
    public static function ensureOidcUserFromClaims(
        ?string $preferredUsername,
        ?string $email,
        ?string $sub
    ): ?string {
        $subject = trim((string)$sub);
        if ($subject === '') {
            return null;
        }

        try {
            $cfg = AdminModel::getConfig();
            $issuer = trim((string)($cfg['oidc']['providerUrl'] ?? ''));
        } catch (\Throwable $e) {
            $issuer = '';
        }
        if ($issuer === '') {
            return null;
        }

        $username = trim((string)$preferredUsername);
        if ($username === '' || !preg_match(REGEX_USER, $username)) {
            $username = 'oidc_' . substr(hash('sha256', $issuer . "\0" . $subject), 0, 16);
        }

        $result = self::ensureLocalOidcUser($username, false, $issuer, $subject);
        return isset($result['success']) ? (string)$result['username'] : null;
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
