#!/usr/bin/env php
<?php
declare(strict_types=1);

// src/cli/resumable_cleanup.php
//
// Sweep expired resumable_* upload temp folders based on configured TTL.

require __DIR__ . '/../../config/config.php';
require __DIR__ . '/../../src/lib/SourceContext.php';

$sourceId = '';
$allSources = false;
$force = true;

foreach ($argv as $i => $arg) {
    if ($i === 0) {
        continue;
    }
    if ($arg === '--all') {
        $allSources = true;
        continue;
    }
    if ($arg === '--respect-interval') {
        $force = false;
        continue;
    }
    if (str_starts_with($arg, '--source=')) {
        $sourceId = trim(substr($arg, strlen('--source=')));
        continue;
    }
    if ($arg === '--source' && isset($argv[$i + 1])) {
        $sourceId = trim((string)$argv[$i + 1]);
        continue;
    }
    if ($arg === '--help' || $arg === '-h') {
        $msg = "Usage: php src/cli/resumable_cleanup.php [--all] [--source <id>] [--respect-interval]\n";
        fwrite(STDOUT, $msg);
        exit(0);
    }
}

try {
    if ($allSources) {
        $totals = ['checked' => 0, 'removed' => 0, 'remaining' => 0];
        $sources = SourceContext::listAllSources();
        foreach ($sources as $src) {
            $id = (string)($src['id'] ?? '');
            if ($id !== '') {
                SourceContext::setActiveId($id, false, true);
            }
            $res = \FileRise\Domain\UploadModel::sweepResumableExpired($force);
            $totals['checked'] += (int)($res['checked'] ?? 0);
            $totals['removed'] += (int)($res['removed'] ?? 0);
            $totals['remaining'] += (int)($res['remaining'] ?? 0);
        }
        $msg = sprintf(
            "Resumable cleanup complete (all sources): checked=%d removed=%d remaining=%d\n",
            $totals['checked'],
            $totals['removed'],
            $totals['remaining']
        );
        fwrite(STDOUT, $msg);
        exit(0);
    }

    if ($sourceId !== '') {
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
            fwrite(STDERR, "Invalid source id.\n");
            exit(1);
        }
        SourceContext::setActiveId($sourceId, false, true);
    }

    $res = \FileRise\Domain\UploadModel::sweepResumableExpired($force);
    $msg = sprintf(
        "Resumable cleanup complete: checked=%d removed=%d remaining=%d\n",
        (int)($res['checked'] ?? 0),
        (int)($res['removed'] ?? 0),
        (int)($res['remaining'] ?? 0)
    );
    fwrite(STDOUT, $msg);
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, "Resumable cleanup error: " . $e->getMessage() . "\n");
    exit(1);
}
