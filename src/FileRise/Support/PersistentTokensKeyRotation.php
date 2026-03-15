<?php

declare(strict_types=1);

namespace FileRise\Support;

use RuntimeException;
use Throwable;

require_once PROJECT_ROOT . '/config/config.php';

final class PersistentTokensKeyRotation
{
    private const MIN_KEY_LENGTH = 32;

    /**
     * @return array<string,mixed>
     */
    public static function rotateToGeneratedKey(): array
    {
        try {
            $newKey = bin2hex(random_bytes(32));
        } catch (Throwable $e) {
            throw new RuntimeException('Failed to generate a new persistent tokens key.');
        }

        return self::rotateToKey($newKey);
    }

    /**
     * @return array<string,mixed>
     */
    public static function rotateToKey(string $newKey): array
    {
        if (!function_exists('fr_resolve_persistent_tokens_key') || !function_exists('fr_get_persistent_tokens_key_file_path')) {
            throw new RuntimeException('Persistent tokens key helpers are unavailable.');
        }

        $resolved = fr_resolve_persistent_tokens_key();
        $oldKey = trim((string)($resolved['key'] ?? ''));
        $source = trim((string)($resolved['source'] ?? ''));

        if ($oldKey === '') {
            throw new RuntimeException('Current persistent tokens key is unavailable.');
        }
        if ($source === 'env') {
            throw new RuntimeException('Persistent tokens key is controlled by the PERSISTENT_TOKENS_KEY environment variable. Update the env value and rotate outside the Admin Panel.');
        }

        $newKey = self::normalizeCandidateKey($newKey, $oldKey);
        $plan = self::buildPlan($oldKey, $newKey, $source);
        self::commitPlan($plan);

        @putenv('PERSISTENT_TOKENS_KEY=' . $newKey);
        @putenv('PERSISTENT_TOKENS_KEY_SOURCE=file');
        $GLOBALS['encryptionKey'] = $newKey;

        return [
            'rotated' => true,
            'newSource' => 'file',
            'oldSource' => $source,
            'keyFilePath' => fr_get_persistent_tokens_key_file_path(),
            'filesRewritten' => (int)($plan['filesRewritten'] ?? 0),
            'usersWithTotpSecrets' => (int)($plan['usersWithTotpSecrets'] ?? 0),
            'sourceSecretsReencrypted' => (int)($plan['sourceSecretsReencrypted'] ?? 0),
            'rememberMeInvalidated' => true,
            'rewrittenPaths' => array_values(array_map('strval', array_keys($plan['writes'] ?? []))),
        ];
    }

    private static function normalizeCandidateKey(string $newKey, string $oldKey): string
    {
        $newKey = trim($newKey);
        if ($newKey === '') {
            throw new RuntimeException('New persistent tokens key is empty.');
        }
        if (strlen($newKey) < self::MIN_KEY_LENGTH) {
            throw new RuntimeException('New persistent tokens key must be at least 32 characters.');
        }
        if (hash_equals($oldKey, $newKey)) {
            throw new RuntimeException('New persistent tokens key must be different from the current key.');
        }
        if ($newKey === 'default_please_change_this_key' || $newKey === 'please_change_this_@@') {
            throw new RuntimeException('Published placeholder values cannot be used as the new persistent tokens key.');
        }

        return $newKey;
    }

    /**
     * @return array<string,mixed>
     */
    private static function buildPlan(string $oldKey, string $newKey, string $source): array
    {
        $writes = [];
        $filesRewritten = 0;
        $usersWithTotpSecrets = 0;
        $sourceSecretsReencrypted = 0;

        $persistentTokensPath = rtrim((string)USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . 'persistent_tokens.json';
        if (is_file($persistentTokensPath)) {
            $writes[$persistentTokensPath] = [
                'content' => self::encryptRequired((string)json_encode((object)[], JSON_PRETTY_PRINT), $newKey, 'persistent token store'),
                'mode' => self::detectMode($persistentTokensPath, 0664),
            ];
            $filesRewritten++;
        }

        foreach (self::candidateSourcesPaths() as $sourcesPath) {
            if (!is_file($sourcesPath)) {
                continue;
            }
            $rotated = self::rotateSourcesConfigFile($sourcesPath, $oldKey, $newKey);
            $writes[$sourcesPath] = [
                'content' => $rotated['content'],
                'mode' => self::detectMode($sourcesPath, 0644),
            ];
            $filesRewritten++;
            $sourceSecretsReencrypted += (int)$rotated['secretCount'];
        }

        $userPermissionsPath = rtrim((string)USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . 'userPermissions.json';
        if (is_file($userPermissionsPath)) {
            $encrypted = self::readRequired($userPermissionsPath, 'user permissions');
            $plain = self::decryptRequired($encrypted, $oldKey, 'user permissions');
            $writes[$userPermissionsPath] = [
                'content' => self::encryptRequired($plain, $newKey, 'user permissions'),
                'mode' => self::detectMode($userPermissionsPath, 0664),
            ];
            $filesRewritten++;
        }

        $usersPath = rtrim((string)USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . USERS_FILE;
        if (is_file($usersPath)) {
            $rawUsers = self::readRequired($usersPath, 'users file');
            $rotated = self::rotateUsersFile($rawUsers, $oldKey, $newKey);
            $writes[$usersPath] = [
                'content' => $rotated['content'],
                'mode' => self::detectMode($usersPath, 0664),
            ];
            $filesRewritten++;
            $usersWithTotpSecrets = (int)$rotated['totpSecretCount'];
        }

        $adminConfigPath = rtrim((string)USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . 'adminConfig.json';
        if (is_file($adminConfigPath)) {
            $encrypted = self::readRequired($adminConfigPath, 'admin config');
            $plain = self::decryptRequired($encrypted, $oldKey, 'admin config');
            $writes[$adminConfigPath] = [
                'content' => self::encryptRequired($plain, $newKey, 'admin config'),
                'mode' => self::detectMode($adminConfigPath, 0664),
            ];
            $filesRewritten++;
        }

        $keyPath = fr_get_persistent_tokens_key_file_path();
        $writes[$keyPath] = [
            'content' => $newKey,
            'mode' => 0600,
        ];

        return [
            'source' => $source,
            'writes' => $writes,
            'filesRewritten' => $filesRewritten,
            'usersWithTotpSecrets' => $usersWithTotpSecrets,
            'sourceSecretsReencrypted' => $sourceSecretsReencrypted,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private static function rotateUsersFile(string $rawUsers, string $oldKey, string $newKey): array
    {
        $lines = preg_split("/\r\n|\n|\r/", $rawUsers);
        if (!is_array($lines)) {
            throw new RuntimeException('Failed to parse users file.');
        }

        $hadTrailingNewline = (bool)preg_match("/(?:\r\n|\n|\r)$/", $rawUsers);
        if ($hadTrailingNewline && !empty($lines) && end($lines) === '') {
            array_pop($lines);
        }

        $out = [];
        $totpSecretCount = 0;
        foreach ($lines as $line) {
            if ($line === '') {
                $out[] = $line;
                continue;
            }

            $parts = explode(':', $line);
            if (count($parts) >= 4 && trim((string)$parts[3]) !== '') {
                $secret = self::decryptRequired((string)$parts[3], $oldKey, 'user TOTP secret');
                $parts[3] = self::encryptRequired($secret, $newKey, 'user TOTP secret');
                $totpSecretCount++;
            }
            $out[] = implode(':', $parts);
        }

        $content = implode(PHP_EOL, $out);
        if ($content !== '' || $hadTrailingNewline) {
            $content .= PHP_EOL;
        }

        return [
            'content' => $content,
            'totpSecretCount' => $totpSecretCount,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private static function rotateSourcesConfigFile(string $path, string $oldKey, string $newKey): array
    {
        $raw = self::readRequired($path, 'sources config');
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Sources config is not valid JSON.');
        }

        $secretCount = 0;
        if (isset($decoded['sources']) && is_array($decoded['sources'])) {
            foreach ($decoded['sources'] as &$source) {
                if (!is_array($source)) {
                    continue;
                }
                $cfg = isset($source['config']) && is_array($source['config']) ? $source['config'] : null;
                if ($cfg === null) {
                    continue;
                }
                $passwordEnc = trim((string)($cfg['passwordEnc'] ?? ''));
                if ($passwordEnc === '') {
                    continue;
                }
                $plain = self::decryptRequired($passwordEnc, $oldKey, 'source password');
                $source['config']['passwordEnc'] = self::encryptRequired($plain, $newKey, 'source password');
                $secretCount++;
            }
            unset($source);
        }

        $encoded = json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || $encoded === '') {
            throw new RuntimeException('Failed to encode rotated sources config.');
        }

        return [
            'content' => $encoded,
            'secretCount' => $secretCount,
        ];
    }

    /**
     * @return list<string>
     */
    private static function candidateSourcesPaths(): array
    {
        $paths = [];

        $bundleDir = defined('FR_PRO_BUNDLE_DIR') ? rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") : '';
        if ($bundleDir === '') {
            $bundleDir = rtrim((string)USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . 'pro';
        }
        if ($bundleDir !== '') {
            $paths[] = $bundleDir . DIRECTORY_SEPARATOR . 'sources.json';
        }

        if (defined('META_DIR')) {
            $paths[] = rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR . 'sources.json';
        }

        $out = [];
        foreach ($paths as $path) {
            $path = trim((string)$path);
            if ($path === '' || in_array($path, $out, true)) {
                continue;
            }
            $out[] = $path;
        }

        return $out;
    }

    /**
     * @param array<string,mixed> $plan
     */
    private static function commitPlan(array $plan): void
    {
        $writes = isset($plan['writes']) && is_array($plan['writes']) ? $plan['writes'] : [];
        if ($writes === []) {
            throw new RuntimeException('No persistent tokens key rotation work was scheduled.');
        }

        $originals = [];
        foreach ($writes as $path => $_spec) {
            $path = (string)$path;
            $originals[$path] = is_file($path) ? @file_get_contents($path) : null;
        }

        $committed = [];
        try {
            foreach ($writes as $path => $spec) {
                $path = (string)$path;
                $content = isset($spec['content']) ? (string)$spec['content'] : '';
                $mode = isset($spec['mode']) ? (int)$spec['mode'] : null;
                self::writeAtomic($path, $content, $mode);
                $committed[] = $path;
            }
        } catch (Throwable $e) {
            foreach (array_reverse($committed) as $path) {
                $original = $originals[$path] ?? null;
                if (!is_string($original)) {
                    @unlink($path);
                    continue;
                }
                try {
                    self::writeAtomic($path, $original, self::detectMode($path, 0664));
                } catch (Throwable $restoreError) {
                    error_log('Persistent tokens key rotation rollback failed for ' . $path . ': ' . $restoreError->getMessage());
                }
            }
            throw new RuntimeException('Persistent tokens key rotation failed: ' . $e->getMessage());
        }
    }

    private static function writeAtomic(string $path, string $content, ?int $mode = null): void
    {
        $dir = dirname($path);
        if ($dir === '' || (!is_dir($dir) && !@mkdir($dir, 0775, true))) {
            throw new RuntimeException('Failed to prepare destination directory for ' . basename($path) . '.');
        }

        $tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
        if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
            @unlink($tmp);
            throw new RuntimeException('Failed to write temporary file for ' . basename($path) . '.');
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('Failed to replace ' . basename($path) . '.');
        }
        if ($mode !== null) {
            @chmod($path, $mode);
        }
    }

    private static function detectMode(string $path, int $fallback): int
    {
        $perms = @fileperms($path);
        if (!is_int($perms) || $perms <= 0) {
            return $fallback;
        }
        return $perms & 0777;
    }

    private static function readRequired(string $path, string $label): string
    {
        $raw = @file_get_contents($path);
        if (!is_string($raw)) {
            throw new RuntimeException('Failed to read ' . $label . '.');
        }
        return $raw;
    }

    private static function decryptRequired(string $encrypted, string $key, string $label): string
    {
        $plain = decryptData($encrypted, $key);
        if (!is_string($plain) || $plain === '') {
            throw new RuntimeException('Failed to decrypt ' . $label . ' with the current persistent tokens key.');
        }
        return $plain;
    }

    private static function encryptRequired(string $plain, string $key, string $label): string
    {
        $encrypted = encryptData($plain, $key);
        if (!is_string($encrypted) || $encrypted === '') {
            throw new RuntimeException('Failed to encrypt ' . $label . ' with the new persistent tokens key.');
        }
        return $encrypted;
    }
}
