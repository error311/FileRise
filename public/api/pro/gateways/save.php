<?php

declare(strict_types=1);

require_once __DIR__ . '/_common.php';

try {
    fr_gateway_guard('POST', true, ['ProGateways', \FileRise\Domain\ProGatewayApiService::class]);
    $body = fr_gateway_read_json();
    $actor = isset($_SESSION['username']) ? trim((string)$_SESSION['username']) : '';
    $result = \FileRise\Domain\ProGatewayApiService::saveGateway($body, $actor);
    fr_gateway_emit_result($result);
} catch (Throwable $e) {
    error_log('Gateway save endpoint error: ' . $e->getMessage());
    fr_gateway_json(500, ['ok' => false, 'error' => 'Error saving gateway share']);
}
