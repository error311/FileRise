<?php

declare(strict_types=1);

// phpcs:disable PSR1.Files.SideEffects.FoundWithSymbols

if (!function_exists('fr_pro_bootstrap')) {
    function fr_pro_bootstrap(): void
    {
        if (!defined('PROJECT_ROOT')) {
            require_once __DIR__ . '/../../../config/config.php';
        }

        if (!headers_sent()) {
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }
    }
}

if (!function_exists('fr_pro_json')) {
    /**
     * @param array<string,mixed> $payload
     */
    function fr_pro_json(int $status, array $payload): void
    {
        fr_pro_bootstrap();

        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($json) || $json === '') {
            http_response_code(500);
            $json = '{"ok":false,"error":"JSON encode failed"}';
        }
        echo $json;
        exit;
    }
}

if (!function_exists('fr_pro_read_json')) {
    /**
     * @return array<string,mixed>
     */
    function fr_pro_read_json(): array
    {
        fr_pro_bootstrap();

        $raw = file_get_contents('php://input');
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('fr_pro_guard_method')) {
    function fr_pro_guard_method(string $method): void
    {
        fr_pro_bootstrap();

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            fr_pro_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        }
    }
}

if (!function_exists('fr_pro_start_session')) {
    function fr_pro_start_session(): void
    {
        fr_pro_bootstrap();

        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }
}

if (!function_exists('fr_pro_guard_auth')) {
    function fr_pro_guard_auth(bool $requireAdmin = false, bool $requireCsrf = false): void
    {
        fr_pro_start_session();
        \FileRise\Http\Controllers\AdminController::requireAuth();
        if ($requireAdmin) {
            \FileRise\Http\Controllers\AdminController::requireAdmin();
        }
        if ($requireCsrf) {
            \FileRise\Http\Controllers\AdminController::requireCsrf();
        }
    }
}

if (!function_exists('fr_pro_require_active')) {
    /**
     * @param array<int,string> $requiredClasses
     */
    function fr_pro_require_active(
        array $requiredClasses = [],
        ?int $requiredApiLevel = null,
        string $error = 'FileRise Pro is not active on this instance.'
    ): void {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
            fr_pro_json(403, ['ok' => false, 'error' => $error]);
        }

        if ($requiredApiLevel !== null) {
            if (!function_exists('fr_pro_api_level_at_least') || !fr_pro_api_level_at_least($requiredApiLevel)) {
                fr_pro_json(403, ['ok' => false, 'error' => $error]);
            }
        }

        foreach ($requiredClasses as $className) {
            if (!class_exists($className)) {
                fr_pro_json(403, ['ok' => false, 'error' => $error]);
            }
        }
    }
}

if (!function_exists('fr_pro_current_user_context')) {
    /**
     * @return array{username:string,permissions:array<string,mixed>,isAdmin:bool}
     */
    function fr_pro_current_user_context(): array
    {
        fr_pro_bootstrap();

        $username = (string)($_SESSION['username'] ?? '');
        $permissions = [
            'role' => $_SESSION['role'] ?? null,
            'admin' => $_SESSION['admin'] ?? null,
            'isAdmin' => $_SESSION['isAdmin'] ?? null,
            'folderOnly' => $_SESSION['folderOnly'] ?? null,
            'readOnly' => $_SESSION['readOnly'] ?? null,
        ];

        $isAdmin = !empty($_SESSION['isAdmin'])
            || (!empty($_SESSION['admin']) && (string)$_SESSION['admin'] === '1');

        return [
            'username' => $username,
            'permissions' => $permissions,
            'isAdmin' => $isAdmin,
        ];
    }
}

if (!function_exists('fr_pro_emit_result')) {
    /**
     * @param array<string,mixed> $result
     */
    function fr_pro_emit_result(array $result): void
    {
        $status = isset($result['status']) ? (int)$result['status'] : 500;
        $payload = $result['payload'] ?? null;
        if (!is_array($payload)) {
            $status = 500;
            $payload = ['ok' => false, 'error' => 'Invalid Pro API result payload'];
        }

        fr_pro_json($status, $payload);
    }
}

fr_pro_bootstrap();

// phpcs:enable
