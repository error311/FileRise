#!/usr/bin/env php
<?php
declare(strict_types=1);

require __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../src/lib/SourceContext.php';

$token = $argv[1] ?? '';
$token = preg_replace('/[^a-f0-9]/','',$token);
if ($token === '') { fwrite(STDERR, "No token\n"); exit(1); }

$sourceId = $argv[2] ?? '';
$sourceId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$sourceId);
if ($sourceId !== '' && class_exists('SourceContext')) {
    SourceContext::setActiveId($sourceId, false);
}

$metaRoot = class_exists('SourceContext')
    ? SourceContext::metaRoot()
    : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
$uploadRoot = class_exists('SourceContext')
    ? SourceContext::uploadRoot()
    : (string)UPLOAD_DIR;

$root    = rtrim($metaRoot, '/\\') . '/ziptmp';
$tokDir  = $root . '/.tokens';
$logDir  = $root . '/.logs';
@mkdir($tokDir, 0775, true);
@mkdir($logDir, 0775, true);

$tokFile = $tokDir . '/' . $token . '.json';
$logFile = $logDir . '/WORKER-' . $token . '.log';

file_put_contents($logFile, "[".date('c')."] worker start token={$token}\n", FILE_APPEND);

// Keep libzip temp files on same FS as final zip (prevents cross-device rename failures)
@mkdir($root, 0775, true);
@putenv('TMPDIR='.$root);
@ini_set('sys_temp_dir', $root);

// Small janitor: purge old tokens/logs (> 6h)
$now = time();
foreach (glob($tokDir.'/*.json') ?: [] as $f) { if (is_file($f) && ($now - @filemtime($f)) > 21600) @unlink($f); }
foreach (glob($logDir.'/WORKER-*.log') ?: [] as $f) { if (is_file($f) && ($now - @filemtime($f)) > 21600) @unlink($f); }

// Helpers to read/write the token file safely
$job = json_decode((string)@file_get_contents($tokFile), true) ?: [];

$save = function() use (&$job, $tokFile) {
    @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);
    @clearstatcache(true, $tokFile);
};

$touchPhase = function(string $phase) use (&$job, $save) {
    $job['phase'] = $phase;
    $save();
};

$format = strtolower((string)($job['format'] ?? 'zip'));
if (!in_array($format, ['zip', '7z'], true)) {
    $job['status'] = 'error';
    $job['error']  = 'Unsupported archive format.';
    $save();
    file_put_contents($logFile, "[".date('c')."] error: ".$job['error']."\n", FILE_APPEND);
    exit(0);
}
$job['format'] = $format;

$findBin = function(array $candidates): ?string {
    foreach ($candidates as $bin) {
        if ($bin === '') continue;
        if (str_contains($bin, '/')) {
            if (is_file($bin) && is_executable($bin)) {
                return $bin;
            }
            continue;
        }
        $out = [];
        $rc = 1;
        @exec('command -v ' . escapeshellarg($bin) . ' 2>/dev/null', $out, $rc);
        if ($rc === 0 && !empty($out[0])) {
            return trim($out[0]);
        }
    }
    return null;
};

// Init timing
if (empty($job['startedAt'])) {
    $job['startedAt'] = time();
}
$job['status'] = 'working';
$job['error']  = null;
$save();

// Build the list of files to zip using the model (same validation FileRise uses)
try {
    // Reuse FileModel’s validation by calling it but not keeping the zip; we’ll enumerate sizes here.
    $folder = (string)($job['folder'] ?? 'root');
    $names  = (array)($job['files'] ?? []);

    // Resolve folder path similarly to createZipArchive
    $baseDir = realpath($uploadRoot);
    if ($baseDir === false) {
        throw new RuntimeException('Uploads directory not configured correctly.');
    }
    if (strtolower($folder) === 'root' || $folder === "") {
        $folderPathReal = $baseDir;
    } else {
        if (strpos($folder, '..') !== false) throw new RuntimeException('Invalid folder name.');
        $parts = explode('/', trim($folder, "/\\ "));
        foreach ($parts as $part) {
            if ($part === '' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                throw new RuntimeException('Invalid folder name.');
            }
        }
        $folderPath = rtrim($uploadRoot, '/\\') . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
        $folderPathReal = realpath($folderPath);
        if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
            throw new RuntimeException('Folder not found.');
        }
    }

    // Collect files (only regular files)
    $filesToZip = [];
    foreach ($names as $nm) {
        $bn = basename(trim((string)$nm));
        if (!preg_match(REGEX_FILE_NAME, $bn)) continue;
        $fp = $folderPathReal . DIRECTORY_SEPARATOR . $bn;
        if (is_file($fp)) $filesToZip[] = $fp;
    }
    if (!$filesToZip) throw new RuntimeException('No valid files to archive.');

    // Totals for progress
    $filesTotal = count($filesToZip);
    $bytesTotal = 0;
    foreach ($filesToZip as $fp) {
        $sz = @filesize($fp);
        if ($sz !== false) $bytesTotal += (int)$sz;
    }

    $job['filesTotal'] = $filesTotal;
    $job['bytesTotal'] = $bytesTotal;
    $job['filesDone']  = 0;
    $job['bytesDone']  = 0;
    $job['pct']        = 0;
    $job['current']    = null;
    $job['phase']      = 'zipping';
    $save();

    if ($format === 'zip') {
        // Create final zip path in META_DIR/ziptmp
        $zipName = 'download-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.zip';
        $zipPath = $root . DIRECTORY_SEPARATOR . $zipName;

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Could not create zip archive.');
        }

        // Enumerate files; report up to 98%
        $bytesDone = 0;
        $filesDone = 0;
        foreach ($filesToZip as $fp) {
            $bn = basename($fp);
            $zip->addFile($fp, $bn);

            $filesDone++;
            $sz = @filesize($fp);
            if ($sz !== false) $bytesDone += (int)$sz;

            $job['filesDone'] = $filesDone;
            $job['bytesDone'] = $bytesDone;
            $job['current']   = $bn;

            $pct = ($bytesTotal > 0) ? (int) floor(($bytesDone / $bytesTotal) * 98) : 0;
            if ($pct < 0) $pct = 0;
            if ($pct > 98) $pct = 98;
            if ($pct > (int)($job['pct'] ?? 0)) $job['pct'] = $pct;

            $save();
        }

        // Finalizing (this is where libzip writes & renames)
        $job['pct']           = max((int)($job['pct'] ?? 0), 99);
        $job['phase']         = 'finalizing';
        $job['finalizeAt']    = time();

        // Publish selected totals for a truthful UI during finalizing,
        // and clear incremental fields so the UI doesn't show "7/7 14 GB / 14 GB" prematurely.
        $job['selectedFiles'] = $filesTotal;
        $job['selectedBytes'] = $bytesTotal;
        $job['filesDone']     = null;
        $job['bytesDone']     = null;
        $job['current']       = null;

        $save();

        // ---- finalize the zip on disk ----
        $ok = $zip->close();
        $statusStr = method_exists($zip, 'getStatusString') ? $zip->getStatusString() : '';

        if (!$ok || !is_file($zipPath)) {
            $job['status'] = 'error';
            $job['error']  = 'Failed to finalize ZIP' . ($statusStr ? " ($statusStr)" : '');
            $save();
            file_put_contents($logFile, "[".date('c')."] error: ".$job['error']."\n", FILE_APPEND);
            exit(0);
        }

        $job['status']  = 'done';
        $job['zipPath'] = $zipPath;
        $job['pct']     = 100;
        $job['phase']   = 'finalized';
        $save();
        file_put_contents($logFile, "[".date('c')."] done zip={$zipPath}\n", FILE_APPEND);
        exit(0);
    }

    $archiveExt = ($format === '7z') ? '7z' : 'zip';
    $archiveName = 'download-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $archiveExt;
    $archivePath = $root . DIRECTORY_SEPARATOR . $archiveName;

    $listFile = tempnam($root, '7zlist-');
    if ($listFile === false) {
        throw new RuntimeException('Failed to prepare archive file list.');
    }

    $relNames = [];
    foreach ($filesToZip as $fp) {
        $relNames[] = basename($fp);
    }
    if (file_put_contents($listFile, implode("\n", $relNames) . "\n", LOCK_EX) === false) {
        @unlink($listFile);
        throw new RuntimeException('Failed to write archive file list.');
    }

    $job['pct']           = max((int)($job['pct'] ?? 0), 99);
    $job['phase']         = 'finalizing';
    $job['finalizeAt']    = time();
    $job['selectedFiles'] = $filesTotal;
    $job['selectedBytes'] = $bytesTotal;
    $job['filesDone']     = null;
    $job['bytesDone']     = null;
    $job['current']       = null;
    $save();

    $cwd = getcwd();
    if ($cwd !== false) {
        @chdir($folderPathReal);
    }

    $out = [];
    $rc = 1;
    $bin = $findBin(['7zz', '/usr/bin/7zz', '/usr/local/bin/7zz', '/bin/7zz', '7z', '/usr/bin/7z', '/usr/local/bin/7z', '/bin/7z']);
    if (!$bin) {
        throw new RuntimeException('7z is not available on the server.');
    }
    $workArg = '-w' . $root;
    $cmd = escapeshellarg($bin) . ' a -t7z -y -bd ' . escapeshellarg($workArg) . ' ' . escapeshellarg($archivePath) . ' ' . escapeshellarg('@' . $listFile);
    @exec($cmd, $out, $rc);

    if ($cwd !== false) {
        @chdir($cwd);
    }
    @unlink($listFile);

    if ($rc !== 0 || !is_file($archivePath)) {
        $detail = trim(implode("\n", $out));
        if (strlen($detail) > 200) $detail = substr($detail, 0, 200) . '...';
        $job['status'] = 'error';
        $job['error']  = 'Failed to create archive' . ($detail ? ': ' . $detail : '');
        $save();
        file_put_contents($logFile, "[".date('c')."] error: ".$job['error']."\n", FILE_APPEND);
        exit(0);
    }

    $job['status']  = 'done';
    $job['zipPath'] = $archivePath;
    $job['pct']     = 100;
    $job['phase']   = 'finalized';
    $save();
    file_put_contents($logFile, "[".date('c')."] done {$format}={$archivePath}\n", FILE_APPEND);
    exit(0);
} catch (Throwable $e) {
    $job['status'] = 'error';
    $job['error']  = 'Worker exception: '.$e->getMessage();
    $save();
    file_put_contents($logFile, "[".date('c')."] exception: ".$e->getMessage()."\n", FILE_APPEND);
}
