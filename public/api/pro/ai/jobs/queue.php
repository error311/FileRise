<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_ai_guard('POST', true, true);
    if (!class_exists('ProAutomation')) {
        fr_ai_json(500, ['ok' => false, 'error' => 'Automation queue is unavailable']);
    }

    $username = trim((string)($_SESSION['username'] ?? ''));
    $body = fr_ai_read_json(32768);
    $payload = is_array($body['job'] ?? null) ? $body['job'] : $body;
    $payload['createdByUser'] = $username;

    $settings = [];
    if (class_exists('ProAiRuntime') && method_exists('ProAiRuntime', 'getAdminSettings')) {
        $config = ProAiRuntime::getAdminSettings();
        $settings = is_array($config['settings'] ?? null) ? $config['settings'] : [];
    }

    $mode = strtolower(trim((string)($payload['mode'] ?? 'bulk')));
    $writeModes = [
        'invoices_to_sheet',
        'invoices',
        'extract_invoices_csv',
        'tag_images',
        'images_tag',
        'image_tagging',
        'transcribe_audio_tag',
        'audio_transcribe_tag',
        'transcribe_audio',
    ];
    if (!empty($settings['readOnlyMode']) && in_array($mode, $writeModes, true)) {
        fr_ai_json(403, ['ok' => false, 'error' => 'AI read-only mode blocks workflows that write files or tags']);
    }

    // Only runtime settings should control local helper binaries for queued AI jobs.
    $payload['readOnlyMode'] = !empty($settings['readOnlyMode']);
    $payload['ocrBinary'] = (string)($settings['ocrBinaryPath'] ?? '');
    $payload['audioBinary'] = (string)($settings['audioBinaryPath'] ?? '');
    if (!array_key_exists('visionEnabled', $payload)) {
        $payload['visionEnabled'] = !empty($settings['visionEnabledByDefault']);
    }

    $result = ProAutomation::enqueueAiBulkJob($payload, $username);
    if (!empty($result['ok']) && method_exists('ProAutomation', 'ensureWorkerRunning')) {
        $result['worker'] = ProAutomation::ensureWorkerRunning('api.ai.jobs.queue');
    }

    fr_ai_emit_result($result);
} catch (Throwable $e) {
    fr_ai_json(500, ['ok' => false, 'error' => 'Failed to queue AI job']);
}
