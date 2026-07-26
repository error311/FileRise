<?php

namespace FileRise\Support;

use FileRise\Domain\AuthModel;

class OidcAccountLinker
{
    private const SESSION_KEY = 'pending_oidc_account_link';
    private const MAX_AGE_SECONDS = 300;
    private const CONFIRMATION_MAX_AGE_SECONDS = 30;
    private const MAX_GROUPS = 100;
    private const MAX_GROUP_LENGTH = 255;

    public static function begin(
        string $issuer,
        string $subject,
        string $username,
        bool $isAdminByIdp,
        array $proGroups
    ): bool {
        $issuer = trim($issuer);
        $subject = trim($subject);
        $username = trim($username);
        if (
            $issuer === ''
            || $subject === ''
            || $username === ''
            || !preg_match(REGEX_USER, $username)
        ) {
            self::clear();
            return false;
        }

        $normalizedGroups = [];
        foreach (array_slice($proGroups, 0, self::MAX_GROUPS) as $group) {
            $group = trim((string)$group);
            if ($group !== '' && strlen($group) <= self::MAX_GROUP_LENGTH) {
                $normalizedGroups[] = $group;
            }
        }

        session_regenerate_id(true);
        unset(
            $_SESSION['authenticated'],
            $_SESSION['authenticated_at'],
            $_SESSION['username'],
            $_SESSION['isAdmin'],
            $_SESSION['folderOnly'],
            $_SESSION['readOnly'],
            $_SESSION['disableUpload'],
            $_SESSION['pending_login_user'],
            $_SESSION['pending_login_secret'],
            $_SESSION['pending_login_remember_me'],
            $_SESSION['pending_login_oidc_link']
        );
        $_SESSION[self::SESSION_KEY] = [
            'issuer' => $issuer,
            'subject' => $subject,
            'username' => $username,
            'is_admin_by_idp' => $isAdminByIdp,
            'pro_groups' => array_values(array_unique($normalizedGroups)),
            'created_at' => time(),
        ];

        return true;
    }

    public static function getPending(): ?array
    {
        $pending = $_SESSION[self::SESSION_KEY] ?? null;
        if (!is_array($pending)) {
            return null;
        }

        $issuer = trim((string)($pending['issuer'] ?? ''));
        $subject = trim((string)($pending['subject'] ?? ''));
        $username = trim((string)($pending['username'] ?? ''));
        $createdAt = (int)($pending['created_at'] ?? 0);
        $now = time();
        if (
            $issuer === ''
            || $subject === ''
            || $username === ''
            || !preg_match(REGEX_USER, $username)
            || $createdAt <= 0
            || $createdAt > $now
            || ($now - $createdAt) > self::MAX_AGE_SECONDS
        ) {
            self::clear();
            return null;
        }

        return [
            'issuer' => $issuer,
            'subject' => $subject,
            'username' => $username,
            'is_admin_by_idp' => !empty($pending['is_admin_by_idp']),
            'pro_groups' => is_array($pending['pro_groups'] ?? null)
                ? $pending['pro_groups']
                : [],
            'created_at' => $createdAt,
        ];
    }

    public static function getPendingUsername(): ?string
    {
        $pending = self::getPending();
        return $pending === null ? null : (string)$pending['username'];
    }

    public static function isPasswordConfirmationFor(string $username): bool
    {
        $pendingUsername = self::getPendingUsername();
        return $pendingUsername !== null && hash_equals($pendingUsername, $username);
    }

    public static function confirmLocalAuthentication(string $username): bool
    {
        $pending = self::getPending();
        if ($pending === null || !hash_equals((string)$pending['username'], $username)) {
            return false;
        }

        $_SESSION[self::SESSION_KEY]['confirmed_username'] = $username;
        $_SESSION[self::SESSION_KEY]['confirmed_at'] = time();
        return true;
    }

    public static function complete(string $username): array
    {
        $pending = self::getPending();
        if ($pending === null || !hash_equals((string)$pending['username'], $username)) {
            return ['error' => 'OIDC account-link confirmation is invalid or expired.', 'statusCode' => 403];
        }
        $stored = $_SESSION[self::SESSION_KEY] ?? [];
        $confirmedUsername = (string)($stored['confirmed_username'] ?? '');
        $confirmedAt = (int)($stored['confirmed_at'] ?? 0);
        $now = time();
        if (
            !hash_equals($username, $confirmedUsername)
            || $confirmedAt <= 0
            || $confirmedAt > $now
            || ($now - $confirmedAt) > self::CONFIRMATION_MAX_AGE_SECONDS
        ) {
            return ['error' => 'OIDC account link requires fresh local authentication.', 'statusCode' => 403];
        }

        $result = AuthModel::ensureLocalOidcUser(
            $username,
            (bool)$pending['is_admin_by_idp'],
            (string)$pending['issuer'],
            (string)$pending['subject'],
            $username
        );
        if (isset($result['error'])) {
            unset(
                $_SESSION[self::SESSION_KEY]['confirmed_username'],
                $_SESSION[self::SESSION_KEY]['confirmed_at']
            );
            return [
                'error' => 'OIDC account link could not be saved.',
                'statusCode' => 503,
            ];
        }

        $boundUsername = (string)($result['username'] ?? '');
        if ($boundUsername === '' || !hash_equals($username, $boundUsername)) {
            self::clear();
            return ['error' => 'OIDC account-link target changed.', 'statusCode' => 403];
        }

        try {
            AuthModel::applyOidcGroupsToPro($username, (array)$pending['pro_groups']);
        } catch (\Throwable $e) {
            error_log('FileRise: OIDC account linked, but Pro group synchronization failed.');
        }

        self::clear();
        return ['success' => true, 'username' => $username];
    }

    public static function clear(): void
    {
        $clearPendingLogin = !empty($_SESSION['pending_login_oidc_link']);
        unset(
            $_SESSION[self::SESSION_KEY],
            $_SESSION['pending_login_oidc_link']
        );
        if ($clearPendingLogin) {
            unset(
                $_SESSION['pending_login_user'],
                $_SESSION['pending_login_secret'],
                $_SESSION['pending_login_remember_me']
            );
        }
    }
}
