<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_automation_guard('POST', true);
    $actor = isset($_SESSION['username']) ? (string)$_SESSION['username'] : '';
    $result = \FileRise\Domain\ProAutomationApiService::decideAiApproval(fr_automation_read_json(), $actor);
    fr_automation_emit_result($result);
} catch (Throwable $e) {
    fr_automation_json(500, ['ok' => false, 'error' => 'Failed to decide AI approval']);
}
