<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_gateway_guard('GET', false, ['ProGatewayManaged', \FileRise\Domain\ProGatewayApiService::class]);
    $gatewayId = isset($_GET['id']) ? (string)$_GET['id'] : null;
    $result = \FileRise\Domain\ProGatewayApiService::managedStatus($gatewayId);
    fr_gateway_emit_result($result);
} catch (Throwable $e) {
    fr_gateway_json(500, ['ok' => false, 'error' => 'Failed to load managed gateway status']);
}
