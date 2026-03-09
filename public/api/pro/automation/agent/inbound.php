<?php

declare(strict_types=1);

if (!defined('PROJECT_ROOT')) {
    require_once __DIR__ . '/../../../../../config/config.php';
}

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

/**
 * @param array<string,mixed> $payload
 */
function fr_ai_agent_json(int $status, array $payload): void
{
    http_response_code($status);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($json) || $json === '') {
        http_response_code(500);
        $json = '{"ok":false,"error":"JSON encode failed"}';
    }
    echo $json;
    exit;
}

function fr_ai_agent_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $val = $_SERVER[$key] ?? '';
    return is_string($val) ? trim($val) : '';
}

function fr_ai_agent_token_from_request(array $body): string
{
    $auth = fr_ai_agent_header('Authorization');
    if ($auth !== '' && preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        return trim((string)$m[1]);
    }

    $xToken = fr_ai_agent_header('X-Agent-Token');
    if ($xToken !== '') {
        return $xToken;
    }

    $bodyToken = trim((string)($body['token'] ?? ''));
    if ($bodyToken !== '') {
        return $bodyToken;
    }

    return '';
}

/** @return array<string,mixed> */
function fr_ai_agent_read_json(int $maxBytes = 65536): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw)) {
        fr_ai_agent_json(400, ['ok' => false, 'error' => 'Failed to read request body']);
    }
    if (strlen($raw) > $maxBytes) {
        fr_ai_agent_json(413, ['ok' => false, 'error' => 'Request body too large']);
    }

    $trimmed = trim($raw);
    if ($trimmed === '') {
        return [];
    }

    try {
        $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        fr_ai_agent_json(400, ['ok' => false, 'error' => 'Invalid JSON payload']);
    }

    if (!is_array($decoded)) {
        fr_ai_agent_json(400, ['ok' => false, 'error' => 'JSON object payload is required']);
    }

    return $decoded;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    fr_ai_agent_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProAiRuntime') || !class_exists('ProAutomation')) {
    fr_ai_agent_json(403, ['ok' => false, 'error' => 'Pro AI automation is not active']);
}

$body = fr_ai_agent_read_json(65536);

$token = fr_ai_agent_token_from_request($body);
if ($token === '') {
    fr_ai_agent_json(401, ['ok' => false, 'error' => 'Missing agent token']);
}

$auth = ProAiRuntime::authenticateAgentToken($token);
if (empty($auth['ok']) || !is_array($auth['agent'] ?? null)) {
    fr_ai_agent_json(401, ['ok' => false, 'error' => (string)($auth['error'] ?? 'Invalid token')]);
}

$agent = (array)$auth['agent'];
$message = trim((string)($body['message'] ?? $body['text'] ?? $body['content'] ?? ''));
if ($message === '') {
    fr_ai_agent_json(400, ['ok' => false, 'error' => 'Missing message']);
}
if (strlen($message) > 4000) {
    $message = substr($message, 0, 4000);
}

$agentId = trim((string)($agent['id'] ?? ''));
$fileRiseUser = trim((string)($agent['fileRiseUser'] ?? ''));
$jobPayload = [
    'agentId' => $agentId,
    'fileRiseUser' => $fileRiseUser,
    'sourceId' => (string)($agent['sourceId'] ?? 'local'),
    'rootPath' => (string)($agent['rootPath'] ?? 'root'),
    'provider' => (string)($agent['provider'] ?? ''),
    'model' => (string)($agent['model'] ?? ''),
    'message' => $message,
    'outboundUrl' => (string)($agent['outboundUrl'] ?? ''),
    'outboundSecretEnc' => (string)($agent['outboundSecretEnc'] ?? ''),
];

if (class_exists('ProAudit')) {
    ProAudit::log('ai.agent.inbound.received', [
        'user' => $fileRiseUser !== '' ? $fileRiseUser : 'agent',
        'source' => 'web',
        'meta' => [
            'agentId' => $agentId,
            'messageChars' => strlen($message),
            'sourceId' => (string)($agent['sourceId'] ?? ''),
            'rootPath' => (string)($agent['rootPath'] ?? ''),
            'redacted' => true,
        ],
    ]);
}

$enqueue = ProAutomation::enqueueAiAgentMessageJob($jobPayload, 'agent:' . $agentId);
if (empty($enqueue['ok'])) {
    fr_ai_agent_json(400, ['ok' => false, 'error' => (string)($enqueue['error'] ?? 'Failed to queue AI agent job')]);
}

$worker = null;
if (method_exists('ProAutomation', 'ensureWorkerRunning')) {
    $worker = ProAutomation::ensureWorkerRunning('api.ai.agent.inbound');
}

if (class_exists('ProAudit')) {
    ProAudit::log('ai.agent.job.enqueued', [
        'user' => $fileRiseUser !== '' ? $fileRiseUser : 'agent',
        'source' => 'web',
        'meta' => [
            'agentId' => $agentId,
            'jobId' => (int)($enqueue['jobId'] ?? 0),
        ],
    ]);
}

fr_ai_agent_json(202, [
    'ok' => true,
    'jobId' => (int)($enqueue['jobId'] ?? 0),
    'worker' => $worker,
]);
