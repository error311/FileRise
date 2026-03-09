<?php

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

try {
    fr_automation_guard('GET', false);

    $jobId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    $result = \ProAutomation::getAiJobOutputFile($jobId);
    if (empty($result['ok'])) {
        fr_automation_json((int)($result['status'] ?? 404), [
            'ok' => false,
            'error' => (string)($result['error'] ?? 'AI output file is not available'),
        ]);
    }

    $path = (string)($result['path'] ?? '');
    $contentType = trim((string)($result['contentType'] ?? 'text/csv; charset=utf-8'));
    $downloadName = str_replace(["\r", "\n"], '', (string)($result['downloadName'] ?? ('automation_job_' . $jobId . '.csv')));
    if ($path === '' || $downloadName === '') {
        fr_automation_json(500, ['ok' => false, 'error' => 'AI output file metadata is invalid']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_write_close();
    }
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }

    $downloadNameStar = rawurlencode($downloadName);
    $size = @filesize($path);

    header_remove('Content-Type');
    header('Content-Type: ' . $contentType);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
    if (is_int($size) && $size >= 0) {
        header('Content-Length: ' . $size);
    }

    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        fr_automation_json(500, ['ok' => false, 'error' => 'Failed to open AI output file']);
    }

    @fpassthru($fh);
    @fclose($fh);
    exit;
} catch (Throwable $e) {
    fr_automation_json(500, ['ok' => false, 'error' => 'Failed to download AI output file']);
}
