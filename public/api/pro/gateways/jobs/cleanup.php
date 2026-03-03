<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_gateway_guard('POST', true, ['ProAutomation', \FileRise\Domain\ProGatewayApiService::class]);
    $actor = isset($_SESSION['username']) ? (string)$_SESSION['username'] : 'admin';
    $result = \FileRise\Domain\ProGatewayApiService::queueGatewayCleanupJob(fr_gateway_read_json(), $actor);
    fr_gateway_emit_result($result);
} catch (Throwable $e) {
    fr_gateway_json(500, ['ok' => false, 'error' => 'Failed to queue gateway cleanup job']);
}
