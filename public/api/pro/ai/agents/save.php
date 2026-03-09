<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_ai_guard('POST', true, true);
    $body = fr_ai_read_json(65536);
    $payload = is_array($body['agent'] ?? null) ? $body['agent'] : $body;
    $result = ProAiRuntime::saveAgent($payload);
    fr_ai_emit_result($result);
} catch (Throwable $e) {
    fr_ai_json(500, ['ok' => false, 'error' => 'Failed to save AI agent']);
}
