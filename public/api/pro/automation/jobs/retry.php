<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_automation_guard('POST', true);
    $result = \FileRise\Domain\ProAutomationApiService::retryJob(fr_automation_read_json());
    fr_automation_emit_result($result);
} catch (Throwable $e) {
    fr_automation_json(500, ['ok' => false, 'error' => 'Failed to retry job']);
}
