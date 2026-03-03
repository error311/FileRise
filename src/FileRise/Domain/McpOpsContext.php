<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Support\ACL;
use RuntimeException;

/**
 * Auth context for Core MCP operations.
 *
 * The context is built from an authenticated actor identity and always
 * reloads permissions from Core storage so callers cannot inject permissive ACLs.
 */
final class McpOpsContext
{
    private string $username;

    /**
     * @var array<string,mixed>
     */
    private array $permissions;

    private bool $admin;

    /**
     * @param array<string,mixed> $permissions
     */
    private function __construct(string $username, array $permissions, bool $admin)
    {
        $this->username = $username;
        $this->permissions = $permissions;
        $this->admin = $admin;
    }

    /**
     * @param array<string,mixed> $authContext
     */
    public static function fromAuthPayload(array $authContext): self
    {
        self::ensureBootstrap();

        $authenticated = self::truthy($authContext['authenticated'] ?? false);
        if (!$authenticated) {
            throw new RuntimeException('Unauthorized', 401);
        }

        $username = trim((string)($authContext['username'] ?? ''));
        if ($username === '') {
            throw new RuntimeException('Unauthorized', 401);
        }
        if (defined('REGEX_USER') && !preg_match((string)REGEX_USER, $username)) {
            throw new RuntimeException('Invalid username.', 400);
        }

        $permissions = SourceAccessService::loadUserPermissions($username);

        // Ensure admin role can still be derived outside normal session-based flows.
        if (class_exists(UserModel::class) && method_exists(UserModel::class, 'getUserRole')) {
            $role = (string)(UserModel::getUserRole($username) ?? '');
            if ($role === '1') {
                $permissions['role'] = '1';
                $permissions['admin'] = true;
                $permissions['isAdmin'] = true;
            }
        }

        $isAdmin = ACL::isAdmin($permissions);

        return new self($username, $permissions, $isAdmin);
    }

    public function username(): string
    {
        return $this->username;
    }

    /**
     * @return array<string,mixed>
     */
    public function permissions(): array
    {
        return $this->permissions;
    }

    public function isAdmin(): bool
    {
        return $this->admin;
    }

    public function canBypassOwnership(): bool
    {
        if ($this->admin) {
            return true;
        }
        if (!empty($this->permissions['bypassOwnership'])) {
            return true;
        }
        return defined('DEFAULT_BYPASS_OWNERSHIP') && (bool)DEFAULT_BYPASS_OWNERSHIP;
    }

    /**
     * @param mixed $value
     */
    private static function truthy($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return ((int)$value) !== 0;
        }
        $raw = strtolower(trim((string)$value));
        return in_array($raw, ['1', 'true', 'yes', 'on'], true);
    }

    private static function ensureBootstrap(): void
    {
        if (!defined('PROJECT_ROOT')) {
            $projectRoot = dirname(__DIR__, 3);
            require_once $projectRoot . '/config/config.php';
        }
    }
}
