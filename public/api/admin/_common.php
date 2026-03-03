<?php

declare(strict_types=1);

if (!function_exists('fr_admin_bootstrap')) {
    function fr_admin_bootstrap(): void
    {
        if (!defined('PROJECT_ROOT')) {
            require_once __DIR__ . '/../../../config/config.php';
        }

        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }
    }
}

if (!function_exists('fr_admin_start_session')) {
    function fr_admin_start_session(): void
    {
        fr_admin_bootstrap();

        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }
}

if (!function_exists('fr_admin_read_json')) {
    /**
     * @return array<string,mixed>
     */
    function fr_admin_read_json(): array
    {
        fr_admin_bootstrap();

        $raw = file_get_contents('php://input');
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('fr_admin_emit_result')) {
    /**
     * @param array{status:int,payload:array<string,mixed>,headers?:array<string,string>} $result
     */
    function fr_admin_emit_result(array $result): void
    {
        fr_admin_bootstrap();

        $status = (int)($result['status'] ?? 500);
        $payload = $result['payload'] ?? null;
        if (!is_array($payload)) {
            $status = 500;
            $payload = [
                'ok' => false,
                'error' => 'Invalid admin API result payload',
            ];
        }

        $headers = $result['headers'] ?? [];
        if (is_array($headers)) {
            foreach ($headers as $name => $value) {
                if ($name !== '' && is_string($name)) {
                    header($name . ': ' . (string)$value);
                }
            }
        }

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
