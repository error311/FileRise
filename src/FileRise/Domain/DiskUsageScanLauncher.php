<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Support\WorkerLauncher;
use RuntimeException;

require_once PROJECT_ROOT . '/config/config.php';

final class DiskUsageScanLauncher
{
    /**
     * Launch disk usage scan worker (background when possible, foreground fallback).
     *
     * @return array{pid:?int,logFile:string,logMtime:?int,sourceId:?string}
     */
    public static function launch(string $sourceId = ''): array
    {
        $sourceId = trim($sourceId);
        if ($sourceId !== '') {
            $ctx = DiskUsageModel::resolveSourceContext($sourceId);
            if (empty($ctx['ok'])) {
                $msg = (string)($ctx['message'] ?? 'Invalid source.');
                throw new RuntimeException($msg, 400);
            }
        }

        $worker = self::resolveWorkerPath();
        $php = self::resolvePhpCli();
        $logFile = DiskUsageModel::scanLogPath($sourceId);

        $pid = self::launchBackground($php, $worker, $logFile, $sourceId);
        if ($pid <= 0) {
            if (!WorkerLauncher::allowsForegroundFallback()) {
                throw new RuntimeException('Background disk usage worker is unavailable in async mode.');
            }
            self::launchForeground($php, $worker, $logFile, $sourceId);
            $pid = null;
        }

        return [
            'pid' => ($pid !== null && $pid > 0) ? $pid : null,
            'logFile' => $logFile,
            'logMtime' => is_file($logFile) ? (int)@filemtime($logFile) : null,
            'sourceId' => $sourceId !== '' ? $sourceId : null,
        ];
    }

    private static function resolveWorkerPath(): string
    {
        $worker = realpath(PROJECT_ROOT . '/src/cli/disk_usage_scan.php');
        if (!$worker || !is_file($worker)) {
            throw new RuntimeException('disk_usage_scan.php not found.');
        }
        return $worker;
    }

    private static function resolvePhpCli(): string
    {
        $php = WorkerLauncher::resolvePhpCli();
        if ($php) {
            return $php;
        }

        throw new RuntimeException('No working php CLI found.');
    }

    private static function launchBackground(string $php, string $worker, string $logFile, string $sourceId): int
    {
        if (WorkerLauncher::prefersSync()) {
            return 0;
        }

        $cmdStr =
            'nohup ' . escapeshellcmd($php) . ' ' . escapeshellarg($worker) .
            ($sourceId !== '' ? (' ' . escapeshellarg($sourceId)) : '') .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1 & echo $!';

        $spawn = WorkerLauncher::spawnBackgroundShell($cmdStr);
        return !empty($spawn['ok']) ? (int)($spawn['pid'] ?? 0) : 0;
    }

    private static function launchForeground(string $php, string $worker, string $logFile, string $sourceId): void
    {
        $run = WorkerLauncher::runForegroundCommand(
            escapeshellcmd($php) . ' ' . escapeshellarg($worker) .
            ($sourceId !== '' ? (' ' . escapeshellarg($sourceId)) : '') .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1'
        );

        if (empty($run['ok'])) {
            throw new RuntimeException('Failed to launch disk usage scan (exec/whitelist issue?). See log: ' . $logFile);
        }
    }
}
