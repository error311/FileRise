<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_ai_guard_public('POST');
    $payload = fr_ai_read_json(65536);
    $payload['clientIp'] = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $result = ProAiRuntime::chatForPublicPortal($payload);
    fr_ai_emit_result($result);
} catch (Throwable $e) {
    fr_ai_json(500, ['ok' => false, 'error' => 'Public portal AI chat request failed']);
}
