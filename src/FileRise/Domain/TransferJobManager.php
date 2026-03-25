<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Support\WorkerLauncher;

/**
 * Lightweight job persistence/spawn helper for async transfer operations.
 */
class TransferJobManager
{
    public static function jobsRoot(): string
    {
        $metaRoot = rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'transfer_jobs';
    }

    public static function jobsDir(): string
    {
        return self::jobsRoot() . DIRECTORY_SEPARATOR . '.jobs';
    }

    public static function logsDir(): string
    {
        return self::jobsRoot() . DIRECTORY_SEPARATOR . '.logs';
    }

    public static function ensureDirs(): void
    {
        $root = self::jobsRoot();
        $jobs = self::jobsDir();
        $logs = self::logsDir();
        if (!is_dir($root)) {
            @mkdir($root, 0700, true);
        }
        if (!is_dir($jobs)) {
            @mkdir($jobs, 0700, true);
        }
        if (!is_dir($logs)) {
            @mkdir($logs, 0700, true);
        }
        @chmod($root, 0700);
        @chmod($jobs, 0700);
        @chmod($logs, 0700);
    }

    public static function isValidId(string $jobId): bool
    {
        return (bool)preg_match('/^[a-f0-9]{16,64}$/i', $jobId);
    }

    public static function pathFor(string $jobId): string
    {
        return self::jobsDir() . DIRECTORY_SEPARATOR . strtolower($jobId) . '.json';
    }

    public static function logPathFor(string $jobId): string
    {
        return self::logsDir() . DIRECTORY_SEPARATOR . 'WORKER-' . strtolower($jobId) . '.log';
    }

    public static function load(string $jobId): ?array
    {
        if (!self::isValidId($jobId)) {
            return null;
        }
        $path = self::pathFor($jobId);
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function save(string $jobId, array $job): bool
    {
        if (!self::isValidId($jobId)) {
            return false;
        }
        self::ensureDirs();
        $path = self::pathFor($jobId);
        $job['updatedAt'] = time();
        return @file_put_contents($path, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX) !== false;
    }

    public static function create(array $job): array
    {
        self::ensureDirs();

        $jobId = bin2hex(random_bytes(16));
        $now = time();
        $doc = array_merge([
            'id' => $jobId,
            'status' => 'queued',
            'createdAt' => $now,
            'updatedAt' => $now,
            'startedAt' => null,
            'endedAt' => null,
            'cancelRequested' => false,
            'error' => null,
            'errors' => [],
            'current' => null,
            'phase' => 'queued',
            'pct' => 0,
            'filesDone' => 0,
            'bytesDone' => 0,
            'selectedFiles' => 0,
            'selectedBytes' => 0,
        ], $job);

        $path = self::pathFor($jobId);
        $ok = @file_put_contents($path, json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        if ($ok === false) {
            throw new \RuntimeException('Failed to create transfer job.');
        }
        @chmod($path, 0600);
        return ['id' => $jobId, 'path' => $path, 'job' => $doc];
    }

    public static function listForUser(string $username, bool $isAdmin = false, int $limit = 50): array
    {
        self::ensureDirs();

        $limit = max(1, min(200, $limit));
        $files = glob(self::jobsDir() . DIRECTORY_SEPARATOR . '*.json') ?: [];
        usort($files, static function (string $a, string $b): int {
            return (int)@filemtime($b) <=> (int)@filemtime($a);
        });

        $out = [];
        foreach ($files as $path) {
            if (count($out) >= $limit) {
                break;
            }
            $raw = @file_get_contents($path);
            $job = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($job)) {
                continue;
            }
            $owner = (string)($job['user'] ?? '');
            if (!$isAdmin && $owner !== '' && strcasecmp($owner, $username) !== 0) {
                continue;
            }
            $out[] = $job;
        }

        return $out;
    }

    public static function requestCancel(string $jobId): bool
    {
        $job = self::load($jobId);
        if (!is_array($job)) {
            return false;
        }

        $job['cancelRequested'] = true;
        $status = strtolower((string)($job['status'] ?? 'queued'));
        if (in_array($status, ['queued', 'running'], true)) {
            $job['status'] = 'cancel_requested';
            $job['phase'] = 'cancel_requested';
        }

        return self::save($jobId, $job);
    }

    public static function cleanupOld(int $maxAgeSeconds = 172800): void
    {
        self::ensureDirs();

        $now = time();
        foreach (glob(self::jobsDir() . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
            if (!is_file($path)) {
                continue;
            }
            $age = $now - (int)@filemtime($path);
            if ($age > $maxAgeSeconds) {
                @unlink($path);
            }
        }
        foreach (glob(self::logsDir() . DIRECTORY_SEPARATOR . 'WORKER-*.log') ?: [] as $path) {
            if (!is_file($path)) {
                continue;
            }
            $age = $now - (int)@filemtime($path);
            if ($age > $maxAgeSeconds) {
                @unlink($path);
            }
        }
    }

    public static function spawnWorker(string $jobId): array
    {
        self::ensureDirs();
        if (!self::isValidId($jobId)) {
            return ['ok' => false, 'error' => 'Invalid job id'];
        }

        $worker = realpath(PROJECT_ROOT . '/src/cli/transfer_worker.php');
        if (!$worker || !is_file($worker)) {
            return ['ok' => false, 'error' => 'transfer_worker.php not found'];
        }

        $php = WorkerLauncher::resolvePhpCli();
        if (!$php) {
            return ['ok' => false, 'error' => 'No working php CLI found'];
        }

        $logFile = self::logPathFor($jobId);

        $cmdStr =
            'nohup ' . escapeshellcmd($php) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($jobId) .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1 & echo $!';

        $spawn = WorkerLauncher::spawnBackgroundShell($cmdStr);
        $pid = !empty($spawn['ok']) ? (int)($spawn['pid'] ?? 0) : 0;

        $job = self::load($jobId) ?: [];
        $job['spawn'] = [
            'ts' => time(),
            'pid' => $pid,
            'php' => $php,
            'log' => $logFile,
            'method' => (string)($spawn['method'] ?? ''),
        ];
        self::save($jobId, $job);

        return !empty($spawn['ok'])
            ? ['ok' => true, 'pid' => $pid]
            : [
                'ok' => false,
                'error' => (string)($spawn['error'] ?? 'Worker spawn returned no PID'),
                'reason' => (string)($spawn['reason'] ?? ''),
            ];
    }

    public static function canRunWorkerForeground(): bool
    {
        return WorkerLauncher::canRunForeground();
    }

    public static function runWorkerForeground(string $jobId): array
    {
        self::ensureDirs();
        if (!self::isValidId($jobId)) {
            return ['ok' => false, 'error' => 'Invalid job id'];
        }

        $worker = realpath(PROJECT_ROOT . '/src/cli/transfer_worker.php');
        if (!$worker || !is_file($worker)) {
            return ['ok' => false, 'error' => 'transfer_worker.php not found'];
        }

        $php = WorkerLauncher::resolvePhpCli();
        if (!$php) {
            return ['ok' => false, 'error' => 'No working php CLI found'];
        }

        $logFile = self::logPathFor($jobId);
        $cmd =
            escapeshellcmd($php) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($jobId) .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1';

        $run = WorkerLauncher::runForegroundCommand($cmd);

        $job = self::load($jobId) ?: [];
        $job['spawn'] = [
            'ts' => time(),
            'pid' => 0,
            'php' => $php,
            'log' => $logFile,
            'method' => 'foreground_exec',
        ];
        self::save($jobId, $job);

        return $run;
    }
}
