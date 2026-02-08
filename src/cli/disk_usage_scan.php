#!/usr/bin/env php
<?php
declare(strict_types=1);

// src/cli/disk_usage_scan.php
//
// Build or refresh the disk usage snapshot used by the Admin "Storage / Disk Usage" view.

require __DIR__ . '/../../config/config.php';

$start = microtime(true);
$sourceId = $argv[1] ?? '';
$sourceId = is_string($sourceId) ? trim($sourceId) : '';
if ($sourceId !== '' && !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
    fwrite(STDERR, "Invalid source id.\n");
    exit(1);
}

try {
    $snapshot = \FileRise\Domain\DiskUsageModel::buildSnapshot($sourceId);
    $elapsed  = microtime(true) - $start;

    $bytes = (int)($snapshot['root_bytes'] ?? 0);
    $files = (int)($snapshot['root_files'] ?? 0);

    $human = function (int $b): string {
        if ($b <= 0) return '0 B';
        $units = ['B','KB','MB','GB','TB','PB'];
        $i = (int)floor(log($b, 1024));
        $i = max(0, min($i, count($units) - 1));
        $val = $b / pow(1024, $i);
        return sprintf('%.2f %s', $val, $units[$i]);
    };

    $label = $sourceId !== '' ? (" (source: " . $sourceId . ")") : '';
    $msg = sprintf(
        "Disk usage snapshot written to %s%s\nScanned %d files, total %s in %.2f seconds.\n",
        \FileRise\Domain\DiskUsageModel::snapshotPath($sourceId),
        $label,
        $files,
        $human($bytes),
        $elapsed
    );
    fwrite(STDOUT, $msg);
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, "Error building disk usage snapshot: " . $e->getMessage() . "\n");
    exit(1);
}
