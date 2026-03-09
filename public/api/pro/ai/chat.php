<?php

declare(strict_types=1);

require_once __DIR__ . '/_common.php';

try {
    fr_ai_guard('POST', false, true);
    $username = trim((string)($_SESSION['username'] ?? ''));
    $payload = fr_ai_read_json(65536);
    $payload['enforceApiThrottle'] = true;
    $payload['clientIp'] = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $result = ProAiRuntime::chatForUser($username, $payload);
    fr_ai_emit_result($result);
} catch (Throwable $e) {
    fr_ai_json(500, ['ok' => false, 'error' => 'AI chat request failed']);
}
