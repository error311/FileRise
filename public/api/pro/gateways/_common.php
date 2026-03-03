<?php

declare(strict_types=1);

if (!function_exists('fr_gateway_bootstrap')) {
    function fr_gateway_bootstrap(): void
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

if (!function_exists('fr_gateway_json')) {
    /**
     * @param array<string,mixed> $payload
     */
    function fr_gateway_json(int $status, array $payload): void
    {
        fr_gateway_bootstrap();

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

if (!function_exists('fr_gateway_read_json')) {
    /**
     * @return array<string,mixed>
     */
    function fr_gateway_read_json(): array
    {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('fr_gateway_guard')) {
    /**
     * @param array<int,string> $requiredClasses
     */
    function fr_gateway_guard(string $method, bool $requireCsrf, array $requiredClasses = []): void
    {
        fr_gateway_bootstrap();

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            fr_gateway_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        }

        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        \FileRise\Http\Controllers\AdminController::requireAuth();
        \FileRise\Http\Controllers\AdminController::requireAdmin();
        if ($requireCsrf) {
            \FileRise\Http\Controllers\AdminController::requireCsrf();
        }

        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
            fr_gateway_json(403, ['ok' => false, 'error' => 'Pro is not active']);
        }

        foreach ($requiredClasses as $className) {
            if (!class_exists($className)) {
                fr_gateway_json(500, ['ok' => false, 'error' => 'Required Pro helper is unavailable: ' . $className]);
            }
        }
    }
}

if (!function_exists('fr_gateway_emit_result')) {
    /**
     * @param array<string,mixed> $result
     */
    function fr_gateway_emit_result(array $result): void
    {
        $status = isset($result['status']) ? (int)$result['status'] : 500;
        $payload = $result['payload'] ?? null;
        if (!is_array($payload)) {
            $status = 500;
            $payload = ['ok' => false, 'error' => 'Invalid gateway API result payload'];
        }
        fr_gateway_json($status, $payload);
    }
}
