<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_ai_guard('GET', true, false);
    $result = ProAiRuntime::getAdminSettings();
    fr_ai_emit_result($result);
} catch (Throwable $e) {
    fr_ai_json(500, [
        'ok' => false,
        'error' => 'Failed to load AI settings',
    ]);
}
