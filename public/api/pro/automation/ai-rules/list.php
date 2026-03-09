<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_automation_guard('GET', false);
    $result = \FileRise\Domain\ProAutomationApiService::listAiWatchRules();
    fr_automation_emit_result($result);
} catch (Throwable $e) {
    fr_automation_json(500, ['ok' => false, 'error' => 'Failed to list watched AI rules']);
}
