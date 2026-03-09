<?php

declare(strict_types=1);

if (!function_exists('fr_automation_bootstrap')) {
    function fr_automation_bootstrap(): void
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

if (!function_exists('fr_automation_json')) {
    /** @param array<string,mixed> $payload */
    function fr_automation_json(int $status, array $payload): void
    {
        fr_automation_bootstrap();

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

if (!function_exists('fr_automation_read_json')) {
    /** @return array<string,mixed> */
    function fr_automation_read_json(): array
    {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('fr_automation_guard')) {
    function fr_automation_require_admin_controller(): void
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

        fr_automation_json(500, ['ok' => false, 'error' => 'Admin controller is unavailable']);
    }

    function fr_automation_guard(string $method, bool $requireCsrf = false): void
    {
        fr_automation_bootstrap();

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            fr_automation_json(405, ['ok' => false, 'error' => 'Method not allowed']);
        }

        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        fr_automation_require_admin_controller();
        \FileRise\Http\Controllers\AdminController::requireAuth();
        \FileRise\Http\Controllers\AdminController::requireAdmin();
        if ($requireCsrf) {
            \FileRise\Http\Controllers\AdminController::requireCsrf();
        }

        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProAutomation')) {
            fr_automation_json(403, ['ok' => false, 'error' => 'Pro automation is not active']);
        }

        if (!\ProAutomation::isReady()) {
            fr_automation_json(500, ['ok' => false, 'error' => 'Automation storage is unavailable']);
        }
    }
}

if (!function_exists('fr_automation_emit_result')) {
    /** @param array<string,mixed> $result */
    function fr_automation_emit_result(array $result): void
    {
        $status = isset($result['status']) ? (int)$result['status'] : 500;
        $payload = $result['payload'] ?? null;
        if (!is_array($payload)) {
            $status = 500;
            $payload = ['ok' => false, 'error' => 'Invalid automation API result payload'];
        }
        fr_automation_json($status, $payload);
    }
}
