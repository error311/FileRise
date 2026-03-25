<?php

declare(strict_types=1);

namespace FileRise\Support;

final class WorkerLauncher
{
    public static function mode(): string
    {
        $mode = defined('FR_WORKER_MODE') ? strtolower(trim((string)FR_WORKER_MODE)) : 'auto';
        return in_array($mode, ['auto', 'async', 'sync'], true) ? $mode : 'auto';
    }

    public static function prefersSync(): bool
    {
        return self::mode() === 'sync';
    }

    public static function isFunctionEnabled(string $name): bool
    {
        if (!function_exists($name)) {
            return false;
        }

        $disabled = ini_get('disable_functions');
        if (!is_string($disabled) || trim($disabled) === '') {
            return true;
        }

        $needle = strtolower(trim($name));
        foreach (explode(',', strtolower($disabled)) as $item) {
            if (trim($item) === $needle) {
                return false;
            }
        }

        return true;
    }

    public static function hasShell(): bool
    {
        return is_file('/bin/sh') && is_executable('/bin/sh');
    }

    public static function canSpawnBackground(): bool
    {
        if (self::prefersSync() || !self::hasShell()) {
            return false;
        }

        return self::isFunctionEnabled('shell_exec') || self::isFunctionEnabled('exec');
    }

    public static function canRunForeground(): bool
    {
        return self::isFunctionEnabled('exec');
    }

    /**
     * @return array{ok:bool,exitCode?:int,output?:array<int,string>,error?:string}
     */
    public static function runCommand(string $command): array
    {
        if (!self::canRunForeground()) {
            return ['ok' => false, 'error' => 'Foreground execution is unavailable'];
        }

        $lines = [];
        $rc = 1;
        @exec($command, $lines, $rc);

        return [
            'ok' => $rc === 0,
            'exitCode' => $rc,
            'output' => $lines,
        ];
    }

    public static function allowsForegroundFallback(): bool
    {
        return self::mode() !== 'async' && self::canRunForeground();
    }

    public static function resolvePhpCli(): ?string
    {
        $candidates = array_values(array_filter([
            PHP_BINARY ?: null,
            '/usr/local/bin/php',
            '/usr/bin/php',
            '/bin/php',
        ]));

        foreach ($candidates as $bin) {
            $bin = (string)$bin;
            if ($bin === '') {
                continue;
            }

            if (self::isFunctionEnabled('exec')) {
                $rc = 1;
                $out = [];
                @exec(escapeshellcmd($bin) . ' -v >/dev/null 2>&1', $out, $rc);
                if ($rc === 0) {
                    return $bin;
                }
                continue;
            }

            if (self::isFunctionEnabled('shell_exec')) {
                $out = @shell_exec(escapeshellcmd($bin) . ' -v 2>/dev/null');
                if (is_string($out) && trim($out) !== '') {
                    return $bin;
                }
                continue;
            }

            if (is_file($bin) && is_executable($bin)) {
                return $bin;
            }
        }

        return null;
    }

    public static function captureCommand(string $command): ?string
    {
        if (self::isFunctionEnabled('shell_exec')) {
            $out = @shell_exec($command);
            return is_string($out) ? $out : null;
        }

        if (self::isFunctionEnabled('exec')) {
            $lines = [];
            $rc = 1;
            @exec($command, $lines, $rc);
            if ($rc === 0 || !empty($lines)) {
                return implode("\n", $lines);
            }
        }

        return null;
    }

    /**
     * @return array{ok:bool,pid?:int,method?:string,error?:string,reason?:string}
     */
    public static function spawnBackgroundShell(string $command): array
    {
        if (self::prefersSync()) {
            return ['ok' => false, 'error' => 'Worker mode is sync', 'reason' => 'sync_mode'];
        }
        if (!self::hasShell()) {
            return ['ok' => false, 'error' => '/bin/sh is unavailable', 'reason' => 'no_shell'];
        }

        $shellCmd = '/bin/sh -c ' . escapeshellarg($command);

        if (self::isFunctionEnabled('shell_exec')) {
            $pidRaw = @shell_exec($shellCmd);
            $pid = is_string($pidRaw) ? (int)trim($pidRaw) : 0;
            return $pid > 0
                ? ['ok' => true, 'pid' => $pid, 'method' => 'shell_exec']
                : ['ok' => false, 'error' => 'Background spawn returned no PID', 'reason' => 'no_pid'];
        }

        if (self::isFunctionEnabled('exec')) {
            $lines = [];
            $rc = 1;
            @exec($shellCmd, $lines, $rc);
            $pid = (int)trim(implode("\n", $lines));
            return $pid > 0
                ? ['ok' => true, 'pid' => $pid, 'method' => 'exec']
                : ['ok' => false, 'error' => 'Background spawn returned no PID', 'reason' => 'no_pid'];
        }

        return ['ok' => false, 'error' => 'No supported background spawn function is available', 'reason' => 'no_exec'];
    }

    /**
     * @return array{ok:bool,exitCode?:int,error?:string}
     */
    public static function runForegroundCommand(string $command): array
    {
        $run = self::runCommand($command);
        if (!empty($run['ok'])) {
            return ['ok' => true, 'exitCode' => (int)($run['exitCode'] ?? 0)];
        }

        return [
            'ok' => false,
            'error' => (string)($run['error'] ?? 'Foreground command failed'),
            'exitCode' => (int)($run['exitCode'] ?? 1),
        ];
    }
}
