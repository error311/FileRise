<?php
// public/api/admin/diskUsageTriggerScan.php
/**
 * @OA\Post(
 *   path="/api/admin/diskUsageTriggerScan.php",
 *   summary="Trigger disk usage scan",
 *   description="Starts a background disk usage scan to build a new snapshot.",
 *   operationId="adminDiskUsageTriggerScan",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(response=200, description="Scan started"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/models/DiskUsageModel.php';

// Basic auth / admin check
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$username = (string)($_SESSION['username'] ?? '');
$isAdmin  = !empty($_SESSION['isAdmin']) || (!empty($_SESSION['admin']) && $_SESSION['admin'] === '1');

if ($username === '' || !$isAdmin) {
    http_response_code(403);
    echo json_encode([
        'ok'    => false,
        'error' => 'Forbidden',
    ]);
    return;
}

// Release session lock early so the scanner/other requests aren't blocked
@session_write_close();

// NOTE: previously this endpoint was Pro-only. Now it works on all instances.
// Pro-only gate removed so free FileRise can also use the Rescan button.

/*
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
    http_response_code(403);
    echo json_encode([
        'ok'    => false,
        'error' => 'FileRise Pro is not active on this instance.',
    ]);
    return;
}
*/

try {
    $worker = realpath(PROJECT_ROOT . '/src/cli/disk_usage_scan.php');
    if (!$worker || !is_file($worker)) {
        throw new RuntimeException('disk_usage_scan.php not found.');
    }

    // Find a PHP CLI binary that actually works (same idea as zip_worker)
    $candidates = array_values(array_filter([
        PHP_BINARY ?: null,
        '/usr/local/bin/php',
        '/usr/bin/php',
        '/bin/php',
    ]));

    $php = null;
    foreach ($candidates as $bin) {
        if (!$bin) {
            continue;
        }
        $rc = 1;
        @exec(escapeshellcmd($bin) . ' -v >/dev/null 2>&1', $out, $rc);
        if ($rc === 0) {
            $php = $bin;
            break;
        }
    }

    if (!$php) {
        throw new RuntimeException('No working php CLI found.');
    }

    $logFile = DiskUsageModel::scanLogPath();

    // nohup php disk_usage_scan.php >> log 2>&1 & echo $!
    $cmdStr =
        'nohup ' . escapeshellcmd($php) . ' ' . escapeshellarg($worker) .
        ' >> ' . escapeshellarg($logFile) . ' 2>&1 & echo $!';

    $pid = @shell_exec('/bin/sh -c ' . escapeshellarg($cmdStr));
    $pid = is_string($pid) ? (int)trim($pid) : 0;

    // If background launch failed (pid 0), fall back to a foreground run so the snapshot
    // still completes and the UI doesn't spin forever on hosts that block background exec.
    if ($pid <= 0) {
        $rc = 1;
        @exec(
            escapeshellcmd($php) . ' ' . escapeshellarg($worker) .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1',
            $out,
            $rc
        );

        if ($rc !== 0) {
            throw new RuntimeException('Failed to launch disk usage scan (exec/whitelist issue?). See log: ' . $logFile);
        }
        // Foreground run finished; no pid to return.
        $pid = null;
    }

    http_response_code(200);
    echo json_encode([
        'ok'      => true,
        'pid'     => $pid > 0 ? $pid : null,
        'message' => 'Disk usage scan started in the background.',
        'logFile' => $logFile,
        'logMtime'=> is_file($logFile) ? (int)@filemtime($logFile) : null,
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'error'   => 'internal_error',
        'message' => $e->getMessage(),
    ]);
}
