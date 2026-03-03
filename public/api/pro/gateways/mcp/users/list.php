<?php

declare(strict_types=1);

require_once __DIR__ . '/../../_common.php';

try {
    fr_gateway_guard('GET', false, ['ProMcpRuntime', \FileRise\Domain\ProGatewayApiService::class]);
    $result = \FileRise\Domain\ProGatewayApiService::mcpListUsers();
    fr_gateway_emit_result($result);
} catch (Throwable $e) {
    fr_gateway_json(500, ['ok' => false, 'error' => 'Failed to load MCP users']);
}
