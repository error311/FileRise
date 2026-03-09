<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_ai_guard('POST', false, true);
    $username = trim((string)($_SESSION['username'] ?? ''));
    $body = fr_ai_read_json(16384);
    $id = trim((string)($body['id'] ?? ''));
    $result = ProAiRuntime::deleteRecipeForUser($username, $id);
    fr_ai_emit_result($result);
} catch (Throwable $e) {
    fr_ai_json(500, ['ok' => false, 'error' => 'Failed to delete AI recipe']);
}
