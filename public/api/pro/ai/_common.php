<?php

declare(strict_types=1);

if (!function_exists('fr_ai_bootstrap')) {
    function fr_ai_bootstrap(): void
    {
        if (!defined('PROJECT_ROOT')) {
            require_once __DIR__ . '/../../../../config/config.php';
        }

        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }
    }
}

if (!function_exists('fr_ai_json')) {
    /**
     * @param array<string,mixed> $payload
     */
    function fr_ai_json(int $status, array $payload): void
    {
        fr_ai_bootstrap();

        http_response_code($status);
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($json) || $json === '') {
            http_response_code(500);
            $json = '{"ok":false,"error":"JSON encode failed"}';
        }
        echo $json;
        exit;
    }
}

if (!function_exists('fr_ai_read_json')) {
    /** @return array<string,mixed> */
    function fr_ai_read_json(int $maxBytes = 65536): array
    {
        $raw = file_get_contents('php://input');
        if (!is_string($raw)) {
            fr_ai_json(400, ['ok' => false, 'error' => 'Failed to read request body']);
        }
        if (strlen($raw) > $maxBytes) {
            fr_ai_json(413, ['ok' => false, 'error' => 'Request body too large']);
        }

        $trimmed = trim($raw);
        if ($trimmed === '') {
            return [];
        }

        try {
            $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            fr_ai_json(400, ['ok' => false, 'error' => 'Invalid JSON payload']);
        }

        if (!is_array($decoded)) {
            fr_ai_json(400, ['ok' => false, 'error' => 'JSON object payload is required']);
        }

        return $decoded;
    }
}

if (!function_exists('fr_ai_guard')) {
    function fr_ai_require_runtime(): void
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProAiRuntime')) {
            fr_ai_json(403, ['ok' => false, 'error' => 'Pro AI runtime is not active']);
        }
    }

    function fr_ai_require_admin_controller(): void
    {
        if (class_exists('\FileRise\Http\Controllers\AdminController')) {
            return;
        }

        $candidates = [
            PROJECT_ROOT . '/src/FileRise/Http/Controllers/AdminController.php',
            PROJECT_ROOT . '/src/controllers/AdminController.php',
        ];
        foreach ($candidates as $path) {
            if (!is_file($path)) {
                continue;
            }
            require_once $path;
            if (class_exists('\FileRise\Http\Controllers\AdminController')) {
                return;
            }
        }

        fr_ai_json(500, ['ok' => false, 'error' => 'Admin controller is unavailable']);
    }

    function fr_ai_guard(string $method, bool $requireAdmin, bool $requireCsrf): void
    {
        fr_ai_bootstrap();

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            fr_ai_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        }

        fr_ai_require_runtime();

        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        fr_ai_require_admin_controller();
        \FileRise\Http\Controllers\AdminController::requireAuth();
        if ($requireAdmin) {
            \FileRise\Http\Controllers\AdminController::requireAdmin();
        }
        if ($requireCsrf) {
            \FileRise\Http\Controllers\AdminController::requireCsrf();
        }

        fr_ai_require_runtime();
    }

    function fr_ai_guard_public(string $method): void
    {
        fr_ai_bootstrap();

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            fr_ai_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        }

        fr_ai_require_runtime();
    }
}

if (!function_exists('fr_ai_emit_result')) {
    /** @param array<string,mixed> $result */
    function fr_ai_emit_result(array $result): void
    {
        $status = isset($result['status'])
            ? (int)$result['status']
            : (!empty($result['ok']) ? 200 : 400);
        if ($status < 100 || $status > 599) {
            $status = !empty($result['ok']) ? 200 : 400;
        }

        if (!array_key_exists('ok', $result)) {
            $result['ok'] = $status >= 200 && $status < 300;
        }

        if ($status === 429 && !headers_sent() && isset($result['retryAfter'])) {
            $retryAfter = (int)$result['retryAfter'];
            if ($retryAfter > 0) {
                header('Retry-After: ' . $retryAfter);
            }
        }

        fr_ai_json($status, $result);
    }
}
