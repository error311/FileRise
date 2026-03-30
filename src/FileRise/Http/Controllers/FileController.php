<?php

namespace FileRise\Http\Controllers;

use FileRise\Support\ACL;
use FileRise\Support\AuditHook;
use FileRise\Support\CryptoAtRest;
use FileRise\Support\EventBus;
use FileRise\Support\FS;
use FileRise\Support\WorkerLauncher;
use FileRise\Storage\StorageAdapterInterface;
use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageRegistry;
use FileRise\Domain\AdminModel;
use FileRise\Domain\FileModel;
use FileRise\Domain\FolderCrypto;
use FileRise\Domain\FolderModel;
use FileRise\Domain\TransferJobManager;
use FileRise\Domain\UserModel as userModel;
use ErrorException;
use RuntimeException;
use Throwable;
use ProPortals;

// src/controllers/FileController.php

require_once dirname(__DIR__, 4) . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/AuditHook.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class FileController
{
    private ?array $jsonBodyOverride = null;

    /* =========================
     * Permission helpers (fail-closed)
     * ========================= */
    private function isAdmin(array $perms): bool
    {
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) {
            return true;
        }
        if (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) {
            return true;
        }
        $role = $_SESSION['role'] ?? null;
        if ($role === 'admin' || $role === '1' || $role === 1) {
            return true;
        }

        $u = $_SESSION['username'] ?? '';
        if ($u) {
            $roleStr = userModel::getUserRole($u);
            if ($roleStr === '1') {
                return true;
            }
        }
        return false;
    }

    private function isFolderOnly(array $perms): bool
    {
        return !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
    }

    private function getMetadataPath(string $folder): string
    {
        $folder = trim($folder);
        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if ($folder === '' || strtolower($folder) === 'root') {
            return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'root_metadata.json';
        }
        return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
    }

    private function loadFolderMetadata(string $folder): array
    {
        $meta = $this->getMetadataPath($folder);
        if (file_exists($meta)) {
            $data = json_decode(file_get_contents($meta), true);
            if (is_array($data)) {
                return $data;
            }
        }
        return [];
    }

    private function loadPerms(string $username): array
    {
        try {
            if (function_exists('loadUserPermissions')) {
                $p = loadUserPermissions($username);
                return is_array($p) ? $p : [];
            }
            if (class_exists(userModel::class) && method_exists(userModel::class, 'getUserPermissions')) {
                $all = userModel::getUserPermissions();
                if (is_array($all)) {
                    if (isset($all[$username])) {
                        return (array)$all[$username];
                    }
                    $lk = strtolower($username);
                    if (isset($all[$lk])) {
                        return (array)$all[$lk];
                    }
                }
            }
        } catch (\Throwable $e) { /* ignore */
        }
        return [];
    }

    private function normalizeSourceId($id): string
    {
        $id = trim((string)$id);
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return '';
        }
        return $id;
    }

    private function withSourceContext(string $sourceId, callable $fn, bool $allowDisabled = false)
    {
        if (!class_exists('SourceContext') || $sourceId === '') {
            return $fn();
        }
        $prev = SourceContext::getActiveId();
        SourceContext::setActiveId($sourceId, false, $allowDisabled);
        try {
            return $fn();
        } finally {
            SourceContext::setActiveId($prev, false);
        }
    }

    private function crossSourceEncryptedError(string $sourceId, string $sourceFolder, string $destSourceId, string $destFolder): ?string
    {
        if (!class_exists('SourceContext')) {
            return null;
        }
        $srcEncrypted = (bool)$this->withSourceContext($sourceId, function () use ($sourceFolder) {
            try {
                return FolderCrypto::isEncryptedOrAncestor($sourceFolder);
            } catch (\Throwable $e) {
                return false;
            }
        });
        $dstEncrypted = (bool)$this->withSourceContext($destSourceId, function () use ($destFolder) {
            try {
                return FolderCrypto::isEncryptedOrAncestor($destFolder);
            } catch (\Throwable $e) {
                return false;
            }
        });
        if ($srcEncrypted || $dstEncrypted) {
            return "Encrypted folders are not supported for cross-source operations.";
        }
        return null;
    }

    private static function folderOfPath(string $path): string
    {
        // normalize path to folder; files: use dirname, folders: return path
        $p = trim(str_replace('\\', '/', $path), "/ \t\r\n");
        if ($p === '' || $p === 'root') {
            return 'root';
        }
        // If it ends with a slash or is an existing folder path, treat as folder
        if (substr($p, -1) === '/') {
            $p = rtrim($p, '/');
        }
        // For files, take the parent folder
        $dir = dirname($p);
        return ($dir === '.' || $dir === '') ? 'root' : $dir;
    }

    private static function ensureSrcDstAllowedForCopy(
        string $user,
        array $perms,
        string $srcPath,
        string $dstFolder
    ): bool {
        $srcFolder = ACL::normalizeFolder(self::folderOfPath($srcPath));
        $dstFolder = ACL::normalizeFolder($dstFolder);
        // Need to be able to see the source (own or full) and copy into destination
        return ACL::canReadOwn($user, $perms, $srcFolder)
            && ACL::canCopy($user, $perms, $dstFolder);
    }

    private static function ensureSrcDstAllowedForMove(
        string $user,
        array $perms,
        string $srcPath,
        string $dstFolder
    ): bool {
        $srcFolder = ACL::normalizeFolder(self::folderOfPath($srcPath));
        $dstFolder = ACL::normalizeFolder($dstFolder);
        // Move removes from source and adds to dest
        return ACL::canDelete($user, $perms, $srcFolder)
            && ACL::canMove($user, $perms, $dstFolder);
    }

    /**
     * Ownership-only enforcement for a set of files in a folder.
     * Returns null if OK, or an error string.
     */
    private function enforceScopeAndOwnership(string $folder, array $files, string $username, array $userPermissions): ?string
    {
        $ignoreOwnership = $this->isAdmin($userPermissions)
            || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
        if ($ignoreOwnership) {
            return null;
        }

        $metadata = $this->loadFolderMetadata($folder);
        foreach ($files as $f) {
            $name = basename((string)$f);
            if (!isset($metadata[$name]['uploader']) || strcasecmp((string)$metadata[$name]['uploader'], $username) !== 0) {
                return "Forbidden: you are not the owner of '{$name}'.";
            }
        }
        return null;
    }

    /**
     * True if the user is an owner of the folder or any ancestor folder (admin also true).
     */
    private function ownsFolderOrAncestor(string $folder, string $username, array $userPermissions): bool
    {
        if ($this->isAdmin($userPermissions)) {
            return true;
        }
        $folder = ACL::normalizeFolder($folder);

        // Direct folder first, then walk up ancestors (excluding 'root' sentinel)
        $f = $folder;
        while ($f !== '' && strtolower($f) !== 'root') {
            if (ACL::isOwner($username, $userPermissions, $f)) {
                return true;
            }
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? '' : substr($f, 0, $pos);
        }
        return false;
    }

    private function enforceSingleFileReadAccess(string $folder, string $file, string $username, array $perms): ?string
    {
        $ignoreOwnership = $this->isAdmin($perms)
            || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
            || ACL::isOwner($username, $perms, $folder)
            || $this->ownsFolderOrAncestor($folder, $username, $perms);

        $fullView = $ignoreOwnership
            || ACL::canRead($username, $perms, $folder)
            || $this->ownsFolderOrAncestor($folder, $username, $perms);
        $ownGrant = !$fullView && ACL::hasGrant($username, $folder, 'read_own');
        if (!$fullView && !$ownGrant) {
            return 'Forbidden: no view access to this folder.';
        }

        $scopeNeed = $fullView ? 'read' : 'read_own';
        $scopeErr = $this->enforceFolderScope($folder, $username, $perms, $scopeNeed);
        if ($scopeErr) {
            return $scopeErr;
        }

        if ($ownGrant) {
            $meta = $this->loadFolderMetadata($folder);
            if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                return 'Forbidden: you are not the owner of this file.';
            }
        }

        return null;
    }

    /**
     * Enforce per-folder scope when the account is in "folder-only" mode.
     * $need: 'read' (default) | 'write' | 'manage' | 'share' | 'read_own'
     * Returns null if allowed, or an error string if forbidden.
     */
    private function enforceFolderScope(
        string $folder,
        string $username,
        array $userPermissions,
        string $need = 'read'
    ): ?string {
        // Admins bypass all folder scope checks
        if ($this->isAdmin($userPermissions)) {
            return null;
        }

        // If the account isn't restricted to a folder scope, don't gate here
        if (!$this->isFolderOnly($userPermissions)) {
            return null;
        }

        $folder = ACL::normalizeFolder($folder);

        // If user owns this folder (or any ancestor), allow
        $f = $folder;
        while ($f !== '' && strtolower($f) !== 'root') {
            if (ACL::isOwner($username, $userPermissions, $f)) {
                return null;
            }
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? '' : substr($f, 0, $pos);
        }

        // Otherwise, require the specific capability on the target folder
        $ok = false;
        switch ($need) {
            case 'manage':
                $ok = ACL::canManage($username, $userPermissions, $folder);
                break;
            case 'write':
                $ok = ACL::canWrite($username, $userPermissions, $folder);
                break; // legacy
            case 'share':
                $ok = ACL::canShare($username, $userPermissions, $folder);
                break; // legacy
            case 'read_own':
                $ok = ACL::canReadOwn($username, $userPermissions, $folder);
                break;
            // granular:
            case 'create':
                $ok = ACL::canCreate($username, $userPermissions, $folder);
                break;
            case 'upload':
                $ok = ACL::canUpload($username, $userPermissions, $folder);
                break;
            case 'edit':
                $ok = ACL::canEdit($username, $userPermissions, $folder);
                break;
            case 'rename':
                $ok = ACL::canRename($username, $userPermissions, $folder);
                break;
            case 'copy':
                $ok = ACL::canCopy($username, $userPermissions, $folder);
                break;
            case 'move':
                $ok = ACL::canMove($username, $userPermissions, $folder);
                break;
            case 'delete':
                $ok = ACL::canDelete($username, $userPermissions, $folder);
                break;
            case 'extract':
                $ok = ACL::canExtract($username, $userPermissions, $folder);
                break;
            case 'shareFile':
            case 'share_file':
                $ok = ACL::canShareFile($username, $userPermissions, $folder);
                break;
            case 'shareFolder':
            case 'share_folder':
                $ok = ACL::canShareFolder($username, $userPermissions, $folder);
                break;
            default: // 'read'
                $ok = ACL::canRead($username, $userPermissions, $folder);
        }

        return $ok ? null : "Forbidden: folder scope violation.";
    }

    private function spawnZipWorker(string $token, string $tokFile, string $logDir, string $sourceId = ''): array
    {
        $worker = realpath(PROJECT_ROOT . '/src/cli/zip_worker.php');
        if (!$worker || !is_file($worker)) {
            return ['ok' => false, 'error' => 'zip_worker.php not found'];
        }

        $php = WorkerLauncher::resolvePhpCli();
        if (!$php) {
            return ['ok' => false, 'error' => 'No working php CLI found'];
        }

        $logFile = $logDir . DIRECTORY_SEPARATOR . 'WORKER-' . $token . '.log';

        // Ensure TMPDIR is on the same FS as the final zip; actually apply it to the child process.
        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $tmpDir = rtrim($metaRoot, '/\\') . '/ziptmp';
        @mkdir($tmpDir, 0775, true);

        // Build one sh -c string so env + nohup + echo $! are in the same shell
        $cmdStr =
            'export TMPDIR=' . escapeshellarg($tmpDir) . ' ; ' .
            'nohup ' . escapeshellcmd($php) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($token) .
            ($sourceId !== '' ? (' ' . escapeshellarg($sourceId)) : '') .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1 & echo $!';

        $spawn = WorkerLauncher::spawnBackgroundShell($cmdStr);
        $pid = !empty($spawn['ok']) ? (int)($spawn['pid'] ?? 0) : 0;

        // Persist spawn metadata into token (best-effort)
        $job = json_decode((string)@file_get_contents($tokFile), true) ?: [];
        $job['spawn'] = [
            'ts'  => time(),
            'php' => $php,
            'pid' => $pid,
            'log' => $logFile,
            'method' => (string)($spawn['method'] ?? ''),
        ];
        @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);

        return !empty($spawn['ok'])
            ? ['ok' => true]
            : [
                'ok' => false,
                'error' => (string)($spawn['error'] ?? 'spawn returned no PID'),
                'reason' => (string)($spawn['reason'] ?? ''),
            ];
    }

    private function runZipWorkerForeground(string $token, string $tokFile, string $logDir, string $sourceId = ''): array
    {
        $worker = realpath(PROJECT_ROOT . '/src/cli/zip_worker.php');
        if (!$worker || !is_file($worker)) {
            return ['ok' => false, 'error' => 'zip_worker.php not found'];
        }

        $php = WorkerLauncher::resolvePhpCli();
        if (!$php) {
            return ['ok' => false, 'error' => 'No working php CLI found'];
        }

        $logFile = $logDir . DIRECTORY_SEPARATOR . 'WORKER-' . $token . '.log';
        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $tmpDir = rtrim($metaRoot, '/\\') . '/ziptmp';
        @mkdir($tmpDir, 0775, true);

        $cmd =
            'TMPDIR=' . escapeshellarg($tmpDir) . ' ' .
            escapeshellcmd($php) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($token) .
            ($sourceId !== '' ? (' ' . escapeshellarg($sourceId)) : '') .
            ' >> ' . escapeshellarg($logFile) . ' 2>&1';

        $run = WorkerLauncher::runForegroundCommand($cmd);

        $job = json_decode((string)@file_get_contents($tokFile), true) ?: [];
        $job['spawn'] = [
            'ts'  => time(),
            'php' => $php,
            'pid' => 0,
            'log' => $logFile,
            'method' => 'foreground_exec',
        ];
        @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);

        return $run;
    }

    // --- small helpers ---
    private function jsonStart(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        header('Content-Type: application/json; charset=utf-8');
        set_error_handler(function ($severity, $message, $file, $line) {
            if (!(error_reporting() & $severity)) {
                return;
            }
            throw new ErrorException($message, 0, $severity, $file, $line);
        });
    }
    private function jsonEnd(): void
    {
        restore_error_handler();
    }
    private function jsonOut(array $payload, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    private function checkCsrf(): bool
    {
        $headersArr = function_exists('getallheaders')
            ? array_change_key_case(getallheaders(), CASE_LOWER)
            : [];
        $receivedToken = $headersArr['x-csrf-token'] ?? '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            $this->jsonOut(['error' => 'Invalid CSRF token'], 403);
            return false;
        }
        return true;
    }
    private function requireAuth(): bool
    {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            $this->jsonOut(['error' => 'Unauthorized'], 401);
            return false;
        }
        return true;
    }
    private function releaseSessionLock(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }
    }
    private function readJsonBody(): array
    {
        if (is_array($this->jsonBodyOverride)) {
            return $this->jsonBodyOverride;
        }
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
    private function withJsonBodyOverride(array $payload, callable $fn): void
    {
        $prev = $this->jsonBodyOverride;
        $this->jsonBodyOverride = $payload;
        try {
            $fn();
        } finally {
            $this->jsonBodyOverride = $prev;
        }
    }
    private function normalizeFolder($f): string
    {
        $f = trim((string)$f);
        if ($f === '' || strtolower($f) === 'root') {
            return 'root';
        }
        return $f;
    }
    private function validFolder($f): bool
    {
        if ($f === 'root') {
            return true;
        }
        return (bool)preg_match(REGEX_FOLDER_NAME, $f);
    }
    private function validFile($f): bool
    {
        $f = basename((string)$f);
        return $f !== '' && (bool)preg_match(REGEX_FILE_NAME, $f);
    }
    private function truthy($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return ((int)$value) !== 0;
        }
        $s = strtolower(trim((string)$value));
        return in_array($s, ['1', 'true', 'yes', 'on'], true);
    }
    private function isAsyncRequested(array $payload): bool
    {
        return $this->truthy($payload['async'] ?? false)
            || $this->truthy($payload['queue'] ?? false)
            || $this->truthy($payload['asyncJob'] ?? false);
    }

    /**
     * Execute a transfer job synchronously in-request as a last resort,
     * when no worker (background or foreground) can be spawned.
     * Updates the job file to 'done' or 'error' and returns a job-envelope.
     *
     * @return array{ok:bool,jobId?:string,status?:string,error?:string}
     */
    private function runJobInRequest(string $jobId, array $jobSpec): array
    {
        $kind = strtolower((string)($jobSpec['kind'] ?? ''));
        $mode = strtolower((string)($jobSpec['mode'] ?? ''));
        $sourceFolder      = (string)($jobSpec['sourceFolder'] ?? '');
        $destinationFolder = (string)($jobSpec['destinationFolder'] ?? '');
        $files             = (array)($jobSpec['files'] ?? []);
        $crossSource       = !empty($jobSpec['crossSource']);
        $sourceId          = (string)($jobSpec['sourceId'] ?? '');
        $destSourceId      = (string)($jobSpec['destSourceId'] ?? '');

        try {
            if ($kind === 'file_move' || $kind === 'file_copy') {
                if ($crossSource) {
                    $result = $kind === 'file_copy'
                        ? FileModel::copyFilesAcrossSources($sourceId, $destSourceId, $sourceFolder, $destinationFolder, $files)
                        : FileModel::moveFilesAcrossSources($sourceId, $destSourceId, $sourceFolder, $destinationFolder, $files);
                } elseif ($kind === 'file_copy') {
                    $result = FileModel::copyFiles($sourceFolder, $destinationFolder, $files);
                } else {
                    $result = FileModel::moveFiles($sourceFolder, $destinationFolder, $files);
                }
            } elseif ($kind === 'folder_move' || $kind === 'folder_copy') {
                // FolderModel has no simple move/copy entry point; route through
                // FolderController which already handles ACLs and all edge cases.
                $payload = ['source' => $sourceFolder, 'destination' => $destinationFolder,
                            'mode' => $mode === 'copy' ? 'copy' : 'move'];
                if ($sourceId !== '')   { $payload['sourceId']     = $sourceId; }
                if ($destSourceId !== '') { $payload['destSourceId'] = $destSourceId; }
                ob_start();
                $fc = new FolderController();
                $fc->setJsonBodyOverride($payload);
                $fc->moveFolder();
                $raw = ob_get_clean();
                $result = json_decode((string)$raw, true) ?: [];
            } else {
                return ['ok' => false, 'error' => 'Unsupported job kind for in-request execution.'];
            }
        } catch (\Throwable $e) {
            $job = TransferJobManager::load($jobId) ?: [];
            $job['status'] = 'error';
            $job['phase']  = 'error';
            $job['error']  = $e->getMessage();
            $job['endedAt'] = time();
            TransferJobManager::save($jobId, $job);
            return ['ok' => false, 'error' => $e->getMessage()];
        }

        if (isset($result['error'])) {
            $job = TransferJobManager::load($jobId) ?: [];
            $job['status'] = 'error';
            $job['phase']  = 'error';
            $job['error']  = (string)$result['error'];
            $job['endedAt'] = time();
            TransferJobManager::save($jobId, $job);
            return ['ok' => false, 'error' => (string)$result['error']];
        }

        $job = TransferJobManager::load($jobId) ?: [];
        $job['status']   = 'done';
        $job['phase']    = 'done';
        $job['pct']      = 100;
        $job['endedAt']  = time();
        $job['error']    = null;
        TransferJobManager::save($jobId, $job);

        return [
            'ok'        => true,
            'jobId'     => $jobId,
            'status'    => 'done',
            'statusUrl' => '/api/file/transferJobStatus.php?jobId=' . urlencode($jobId),
        ];
    }

    private function enqueueTransferJob(array $jobSpec): array
    {
        try {
            $user = trim((string)($jobSpec['user'] ?? ''));
            if ($user === '') {
                return ['error' => 'Missing transfer job user.'];
            }
            $jobSpec['user'] = $user;

            $selectedFiles = (int)($jobSpec['selectedFiles'] ?? 0);
            $selectedBytes = (int)($jobSpec['selectedBytes'] ?? 0);
            if ($selectedFiles < 0) {
                $selectedFiles = 0;
            }
            if ($selectedBytes < 0) {
                $selectedBytes = 0;
            }
            $jobSpec['selectedFiles'] = $selectedFiles;
            $jobSpec['selectedBytes'] = $selectedBytes;

            $created = TransferJobManager::create($jobSpec);
            $jobId = (string)($created['id'] ?? '');
            if ($jobId === '') {
                return ['error' => 'Failed to create transfer job.'];
            }

            if (WorkerLauncher::prefersSync() && WorkerLauncher::allowsForegroundFallback() && TransferJobManager::canRunWorkerForeground()) {
                $run = TransferJobManager::runWorkerForeground($jobId);
                if (empty($run['ok'])) {
                    $job = TransferJobManager::load($jobId) ?: [];
                    $job['status'] = 'error';
                    $job['phase'] = 'error';
                    $job['error'] = 'Worker foreground run failed: ' . (string)($run['error'] ?? 'Unknown error');
                    $job['endedAt'] = time();
                    TransferJobManager::save($jobId, $job);
                    return ['error' => 'Failed to run transfer worker: ' . (string)($run['error'] ?? 'Unknown error')];
                }

                $fresh = TransferJobManager::load($jobId) ?: [];
                return [
                    'ok' => true,
                    'jobId' => $jobId,
                    'status' => (string)($fresh['status'] ?? 'done'),
                    'statusUrl' => '/api/file/transferJobStatus.php?jobId=' . urlencode($jobId),
                ];
            }

            // If no shell execution is available at all, skip the spawn attempt
            // entirely - spawnWorker() would hang waiting for a CLI that can't run.
            if (!WorkerLauncher::canSpawnBackground() && !WorkerLauncher::canRunForeground()) {
                $syncResult = $this->runJobInRequest($jobId, $jobSpec);
                if (!empty($syncResult['ok'])) {
                    return $syncResult;
                }
                $job = TransferJobManager::load($jobId) ?: [];
                $job['status'] = 'error';
                $job['phase']  = 'error';
                $job['error']  = (string)($syncResult['error'] ?? 'In-request execution failed');
                $job['endedAt'] = time();
                TransferJobManager::save($jobId, $job);
                return ['error' => $job['error']];
            }

            $spawn = TransferJobManager::spawnWorker($jobId);
            if (empty($spawn['ok'])) {
                if (WorkerLauncher::allowsForegroundFallback() && TransferJobManager::canRunWorkerForeground()) {
                    $run = TransferJobManager::runWorkerForeground($jobId);
                    if (!empty($run['ok'])) {
                        $fresh = TransferJobManager::load($jobId) ?: [];
                        return [
                            'ok' => true,
                            'jobId' => $jobId,
                            'status' => (string)($fresh['status'] ?? 'done'),
                            'statusUrl' => '/api/file/transferJobStatus.php?jobId=' . urlencode($jobId),
                        ];
                    }
                }

                $syncResult = $this->runJobInRequest($jobId, $jobSpec);
                if (!empty($syncResult['ok'])) {
                    return $syncResult;
                }

                $job = TransferJobManager::load($jobId) ?: [];
                $job['status'] = 'error';
                $job['phase'] = 'error';
                $job['error'] = 'Worker spawn failed: ' . (string)($spawn['error'] ?? 'Unknown error');
                $job['endedAt'] = time();
                TransferJobManager::save($jobId, $job);
                return ['error' => 'Failed to start transfer worker: ' . (string)($spawn['error'] ?? 'Unknown error')];
            }

            return [
                'ok' => true,
                'jobId' => $jobId,
                'status' => 'queued',
                'statusUrl' => '/api/file/transferJobStatus.php?jobId=' . urlencode($jobId),
            ];
        } catch (\Throwable $e) {
            return ['error' => 'Failed to queue transfer job.'];
        }
    }
    private function transferJobToPublic(array $job): array
    {
        return [
            'id' => $job['id'] ?? null,
            'kind' => $job['kind'] ?? null,
            'mode' => $job['mode'] ?? null,
            'itemType' => $job['itemType'] ?? null,
            'status' => $job['status'] ?? 'unknown',
            'phase' => $job['phase'] ?? null,
            'error' => $job['error'] ?? null,
            'errors' => isset($job['errors']) && is_array($job['errors']) ? array_values($job['errors']) : [],
            'pct' => $job['pct'] ?? null,
            'filesDone' => $job['filesDone'] ?? 0,
            'bytesDone' => $job['bytesDone'] ?? 0,
            'selectedFiles' => $job['selectedFiles'] ?? 0,
            'selectedBytes' => $job['selectedBytes'] ?? 0,
            'current' => $job['current'] ?? null,
            'cancelRequested' => !empty($job['cancelRequested']),
            'createdAt' => $job['createdAt'] ?? null,
            'startedAt' => $job['startedAt'] ?? null,
            'endedAt' => $job['endedAt'] ?? null,
            'sourceFolder' => $job['sourceFolder'] ?? null,
            'destinationFolder' => $job['destinationFolder'] ?? null,
            'targetFolder' => $job['targetFolder'] ?? null,
            'sourceId' => $job['sourceId'] ?? null,
            'destSourceId' => $job['destSourceId'] ?? null,
            'crossSource' => !empty($job['crossSource']),
        ];
    }

    /**
     * Safe filesize() wrapper.
     */
    private function filesizeSafe(string $path): int
    {
        $s = @filesize($path);
        return ($s === false) ? 0 : (int)$s;
    }

    /**
     * Ensure UTF-8 text, collapsing some whitespace but keeping newlines.
     */
    private function normalizeSnippetText(string $text): string
    {
        if (function_exists('mb_detect_encoding')) {
            $enc = mb_detect_encoding($text, ['UTF-8', 'ISO-8859-1', 'Windows-1252'], true);
            if ($enc && $enc !== 'UTF-8') {
                $text = mb_convert_encoding($text, 'UTF-8', $enc);
            }
        } else {
            $text = @utf8_encode($text);
        }

        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = preg_replace("/[ \t]+/u", ' ', $text);

        $lines = explode("\n", $text);
        $lines = array_map(static fn($l) => trim($l), $lines);

        return implode("\n", $lines);
    }

    /**
     * Multibyte-safe substring with truncation flag.
     */
    private function mbSubstrSafe(string $text, int $maxChars, bool &$truncated): string
    {
        if ($maxChars <= 0) {
            $truncated = ($text !== '');
            return '';
        }

        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($text, 'UTF-8') > $maxChars) {
                $truncated = true;
                return mb_substr($text, 0, $maxChars, 'UTF-8');
            }
            return $text;
        }

        if (strlen($text) > $maxChars) {
            $truncated = true;
            return substr($text, 0, $maxChars);
        }

        return $text;
    }

    /**
     * Plain text / code files: read the first chunk only.
     */
    private function extractTextFileSnippet(string $path, int $maxChars, bool &$truncated): string
    {
        $truncated = false;

        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return '';
        }

        $chunkSize = 64 * 1024;
        $data = @fread($fh, $chunkSize);
        @fclose($fh);

        if ($data === false) {
            return '';
        }

        $text = $this->normalizeSnippetText($data);
        return $this->mbSubstrSafe($text, $maxChars, $truncated);
    }

    /**
     * DOCX: pull text from word/document.xml (<w:t> tags).
     */
    private function extractDocxSnippet(string $path, int $maxChars, bool &$truncated): string
    {
        if (!class_exists('ZipArchive')) {
            return '';
        }

        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            return '';
        }

        $xml = $zip->getFromName('word/document.xml');
        $zip->close();

        if ($xml === false || $xml === '') {
            return '';
        }

        $xml = preg_replace('/<w:br[^>]*\/>/i', "\n", $xml);
        $xml = preg_replace('/<\/w:p>/i', "\n", $xml);

        $textPieces = [];

        if (preg_match_all('/<w:t[^>]*>(.*?)<\/w:t>/si', $xml, $m) && !empty($m[1])) {
            foreach ($m[1] as $raw) {
                $piece = strip_tags((string)$raw);
                $piece = html_entity_decode($piece, ENT_QUOTES | ENT_XML1, 'UTF-8');
                $piece = $this->normalizeSnippetText($piece);
                if ($piece !== '') {
                    $textPieces[] = $piece;
                }
                if (strlen(implode("\n", $textPieces)) > ($maxChars * 2)) {
                    break;
                }
            }
        }

        $text = implode("\n", $textPieces);
        $text = $this->normalizeSnippetText($text);

        return $this->mbSubstrSafe($text, $maxChars, $truncated);
    }

    /**
     * XLSX: get text from xl/sharedStrings.xml (<t> tags).
     */
    private function extractXlsxSnippet(string $path, int $maxChars, bool &$truncated): string
    {
        if (!class_exists('ZipArchive')) {
            return '';
        }

        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            return '';
        }

        $xml = $zip->getFromName('xl/sharedStrings.xml');
        $zip->close();

        if ($xml === false || $xml === '') {
            return '';
        }

        $textPieces = [];

        if (preg_match_all('/<t[^>]*>(.*?)<\/t>/si', $xml, $m) && !empty($m[1])) {
            foreach ($m[1] as $raw) {
                $piece = strip_tags((string)$raw);
                $piece = html_entity_decode($piece, ENT_QUOTES | ENT_XML1, 'UTF-8');
                $piece = $this->normalizeSnippetText($piece);
                if ($piece !== '') {
                    $textPieces[] = $piece;
                }
                if (strlen(implode("\n", $textPieces)) > ($maxChars * 2)) {
                    break;
                }
            }
        }

        $text = implode("\n", $textPieces);
        $text = $this->normalizeSnippetText($text);

        return $this->mbSubstrSafe($text, $maxChars, $truncated);
    }

    /**
     * PPTX: use the first slide (ppt/slides/slide1.xml), <a:t> tags.
     */
    private function extractPptxSnippet(string $path, int $maxChars, bool &$truncated): string
    {
        if (!class_exists('ZipArchive')) {
            return '';
        }

        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            return '';
        }

        $xml = $zip->getFromName('ppt/slides/slide1.xml');
        $zip->close();

        if ($xml === false || $xml === '') {
            return '';
        }

        $textPieces = [];

        if (preg_match_all('/<a:t[^>]*>(.*?)<\/a:t>/si', $xml, $m) && !empty($m[1])) {
            foreach ($m[1] as $raw) {
                $piece = strip_tags((string)$raw);
                $piece = html_entity_decode($piece, ENT_QUOTES | ENT_XML1, 'UTF-8');
                $piece = $this->normalizeSnippetText($piece);
                if ($piece !== '') {
                    $textPieces[] = $piece;
                }
                if (strlen(implode("\n", $textPieces)) > ($maxChars * 2)) {
                    break;
                }
            }
        }

        $text = implode("\n", $textPieces);
        $text = $this->normalizeSnippetText($text);

        return $this->mbSubstrSafe($text, $maxChars, $truncated);
    }
    /* =========================
     * Actions
     * ========================= */

    public function copyFiles()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            if (
                !$data
                || !isset($data['source'], $data['destination'], $data['files'])
                || !is_array($data['files'])
            ) {
                $this->jsonOut(["error" => "Invalid request"], 400);
                return;
            }

            $sourceFolder      = $this->normalizeFolder($data['source']);
            $destinationFolder = $this->normalizeFolder($data['destination']);
            $files             = array_values(array_filter(array_map('basename', (array)$data['files'])));


            if (!$this->validFolder($sourceFolder) || !$this->validFolder($destinationFolder)) {
                $this->jsonOut(["error" => "Invalid folder name(s)."], 400);
                return;
            }
            if (empty($files)) {
                $this->jsonOut(["error" => "No files specified."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            $useSources = (class_exists('SourceContext') && SourceContext::sourcesEnabled());
            $rawSourceId = $useSources ? ($data['sourceId'] ?? '') : '';
            $rawDestId = $useSources ? ($data['destSourceId'] ?? '') : '';
            $sourceId = $useSources
                ? $this->normalizeSourceId($rawSourceId !== '' ? $rawSourceId : SourceContext::getActiveId())
                : '';
            $destSourceId = $useSources
                ? $this->normalizeSourceId($rawDestId !== '' ? $rawDestId : $sourceId)
                : '';
            $asyncRequested = $this->isAsyncRequested($data);

            if ($useSources && (($rawSourceId !== '' && $sourceId === '') || ($rawDestId !== '' && $destSourceId === ''))) {
                $this->jsonOut(["error" => "Invalid source id."], 400);
                return;
            }

            $crossSource = ($sourceId !== '' && $destSourceId !== '' && $sourceId !== $destSourceId);
            if ($crossSource) {
                $sourceInfo = SourceContext::getSourceById($sourceId);
                $destInfo = SourceContext::getSourceById($destSourceId);
                if (!$sourceInfo || !$destInfo) {
                    $this->jsonOut(["error" => "Invalid source."], 400);
                    return;
                }
                if (!$this->isAdmin($userPermissions)) {
                    if (empty($sourceInfo['enabled']) || empty($destInfo['enabled'])) {
                        $this->jsonOut(["error" => "Source is disabled."], 403);
                        return;
                    }
                }
                if (!empty($destInfo['readOnly'])) {
                    $this->jsonOut(["error" => "Destination source is read-only."], 403);
                    return;
                }

                // --- Permission gates: source ---------------------------------
                $srcErr = $this->withSourceContext($sourceId, function () use ($username, $userPermissions, $sourceFolder, $files) {
                    $hasSourceView = ACL::canReadOwn($username, $userPermissions, $sourceFolder)
                        || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
                    if (!$hasSourceView) {
                        return "Forbidden: no read access to source";
                    }

                    $needSrcScope = ACL::canRead($username, $userPermissions, $sourceFolder) ? 'read' : 'read_own';
                    $sv = $this->enforceFolderScope($sourceFolder, $username, $userPermissions, $needSrcScope);
                    if ($sv) {
                        return $sv;
                    }

                    $ignoreOwnership = $this->isAdmin($userPermissions)
                        || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
                    if (
                        !$ignoreOwnership
                        && !ACL::canRead($username, $userPermissions, $sourceFolder)
                        && ACL::hasGrant($username, $sourceFolder, 'read_own')
                    ) {
                        $ownErr = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
                        if ($ownErr) {
                            return $ownErr;
                        }
                    }
                    return null;
                });
                if ($srcErr) {
                    $this->jsonOut(["error" => $srcErr], 403);
                    return;
                }

                // --- Permission gates: destination -----------------------------
                $dstErr = $this->withSourceContext($destSourceId, function () use ($username, $userPermissions, $destinationFolder) {
                    $hasDestCreate = ACL::canCreate($username, $userPermissions, $destinationFolder)
                        || $this->ownsFolderOrAncestor($destinationFolder, $username, $userPermissions);
                    if (!$hasDestCreate) {
                        return "Forbidden: no write access to destination";
                    }
                    $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions, 'create');
                    if ($dv) {
                        return $dv;
                    }
                    return null;
                });
                if ($dstErr) {
                    $this->jsonOut(["error" => $dstErr], 403);
                    return;
                }

                $encErr = $this->crossSourceEncryptedError($sourceId, $sourceFolder, $destSourceId, $destinationFolder);
                if ($encErr) {
                    $this->jsonOut(["error" => $encErr], 400);
                    return;
                }

                if (!empty($userPermissions['readOnly'])) {
                    $this->jsonOut(["error" => "Account is read-only."], 403);
                    return;
                }
                if (!empty($userPermissions['disableUpload'])) {
                    $this->jsonOut(["error" => "Uploads are disabled for your account."], 403);
                    return;
                }

                if ($asyncRequested) {
                    $queued = $this->enqueueTransferJob([
                        'user' => $username,
                        'kind' => 'file_copy',
                        'itemType' => 'file',
                        'mode' => 'copy',
                        'sourceFolder' => $sourceFolder,
                        'destinationFolder' => $destinationFolder,
                        'sourceId' => $sourceId,
                        'destSourceId' => $destSourceId,
                        'crossSource' => true,
                        'files' => $files,
                        'selectedFiles' => count($files),
                        'selectedBytes' => is_numeric($data['totalBytes'] ?? null) ? (int)$data['totalBytes'] : 0,
                    ]);
                    if (isset($queued['error'])) {
                        $this->jsonOut(['error' => $queued['error']], 500);
                        return;
                    }
                    $this->jsonOut($queued, 202);
                    return;
                }

                $this->releaseSessionLock();
                $result = FileModel::copyFilesAcrossSources($sourceId, $destSourceId, $sourceFolder, $destinationFolder, $files);
                if (isset($result['success'])) {
                    foreach ($files as $name) {
                        $from = ($sourceFolder === 'root') ? $name : ($sourceFolder . '/' . $name);
                        $to   = ($destinationFolder === 'root') ? $name : ($destinationFolder . '/' . $name);
                        AuditHook::log('file.copy', [
                            'user'   => $username,
                            'folder' => $destinationFolder,
                            'from'   => $from,
                            'to'     => $to,
                        ]);
                    }
                }
                $this->jsonOut($result);
                return;
            }

            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            // --- Permission gates (granular) ------------------------------------
            // Source: own-only view is enough to copy (we'll enforce ownership below if no full read)
            $hasSourceView = ACL::canReadOwn($username, $userPermissions, $sourceFolder)
                || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
            if (!$hasSourceView) {
                $this->jsonOut(["error" => "Forbidden: no read access to source"], 403);
                return;
            }

            // Destination: must have 'copy' capability (or own ancestor)
            $hasDestCreate = ACL::canCreate($username, $userPermissions, $destinationFolder)
                || $this->ownsFolderOrAncestor($destinationFolder, $username, $userPermissions);
            if (!$hasDestCreate) {
                $this->jsonOut(["error" => "Forbidden: no write access to destination"], 403);
                return;
            }

            $needSrcScope = ACL::canRead($username, $userPermissions, $sourceFolder) ? 'read' : 'read_own';

            // Folder-scope checks with the needed capabilities
            $sv = $this->enforceFolderScope($sourceFolder, $username, $userPermissions, $needSrcScope);
            if ($sv) {
                $this->jsonOut(["error" => $sv], 403);
                return;
            }

            $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions, 'create');
            if ($dv) {
                $this->jsonOut(["error" => $dv], 403);
                return;
            }

            // If the user doesn't have full read on source (only read_own), enforce per-file ownership
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

            if (
                !$ignoreOwnership
                && !ACL::canRead($username, $userPermissions, $sourceFolder)   // no explicit full read
                && ACL::hasGrant($username, $sourceFolder, 'read_own')         // but has own-only
            ) {
                $ownErr = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
                if ($ownErr) {
                    $this->jsonOut(["error" => $ownErr], 403);
                    return;
                }
            }

            // Account flags: copy writes new objects into destination
            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }
            if (!empty($userPermissions['readOnly'])) {
                $this->jsonOut(["error" => "Account is read-only."], 403);
                return;
            }
            if (!empty($userPermissions['disableUpload'])) {
                $this->jsonOut(["error" => "Uploads are disabled for your account."], 403);
                return;
            }

            if ($asyncRequested) {
                $queued = $this->enqueueTransferJob([
                    'user' => $username,
                    'kind' => 'file_copy',
                    'itemType' => 'file',
                    'mode' => 'copy',
                    'sourceFolder' => $sourceFolder,
                    'destinationFolder' => $destinationFolder,
                    'sourceId' => $sourceId,
                    'destSourceId' => $destSourceId,
                    'crossSource' => false,
                    'files' => $files,
                    'selectedFiles' => count($files),
                    'selectedBytes' => is_numeric($data['totalBytes'] ?? null) ? (int)$data['totalBytes'] : 0,
                ]);
                if (isset($queued['error'])) {
                    $this->jsonOut(['error' => $queued['error']], 500);
                    return;
                }
                $this->jsonOut($queued, 202);
                return;
            }

            // --- Do the copy ----------------------------------------------------
            $this->releaseSessionLock();
            $result = FileModel::copyFiles($sourceFolder, $destinationFolder, $files);
            if (isset($result['success'])) {
                foreach ($files as $name) {
                    $from = ($sourceFolder === 'root') ? $name : ($sourceFolder . '/' . $name);
                    $to   = ($destinationFolder === 'root') ? $name : ($destinationFolder . '/' . $name);
                    AuditHook::log('file.copy', [
                        'user'   => $username,
                        'folder' => $destinationFolder,
                        'from'   => $from,
                        'to'     => $to,
                    ]);
                }
            }
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::copyFiles error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while copying files.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function deleteFiles()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            if (!is_array($data) || !isset($data['files']) || !is_array($data['files'])) {
                $this->jsonOut(["error" => "No file names provided"], 400);
                return;
            }

            // sanitize/normalize the list (empty names filtered out)
            $files = array_values(array_filter(array_map('strval', $data['files']), fn($s) => $s !== ''));
            if (!$files) {
                $this->jsonOut(["error" => "No file names provided"], 400);
                return;
            }

            $folder = $this->normalizeFolder($data['folder'] ?? 'root');
            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // --- Permission gates (granular) ------------------------------------
            // Need delete on folder (or ancestor-owner)
            $hasDelete = ACL::canDelete($username, $userPermissions, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);
            if (!$hasDelete) {
                $this->jsonOut(["error" => "Forbidden: no delete permission"], 403);
                return;
            }

            // --- Folder-scope check (granular) ----------------------------------
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'delete');
            if ($dv) {
                $this->jsonOut(["error" => $dv], 403);
                return;
            }

            // --- Ownership enforcement when user only has viewOwn ----------------
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
            $isFolderOwner = ACL::isOwner($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);

            // If user is not owner/admin and does NOT have full view, but does have own-only, enforce per-file ownership
            if (
                !$ignoreOwnership
                && !$isFolderOwner
                && !ACL::canRead($username, $userPermissions, $folder)   // lacks full read
                && ACL::hasGrant($username, $folder, 'read_own')         // has own-only
            ) {
                $ownErr = $this->enforceScopeAndOwnership($folder, $files, $username, $userPermissions);
                if ($ownErr) {
                    $this->jsonOut(["error" => $ownErr], 403);
                    return;
                }
            }

            // --- Perform delete --------------------------------------------------
            $result = FileModel::deleteFiles($folder, $files);
            if (isset($result['success'])) {
                foreach ($files as $name) {
                    $path = ($folder === 'root') ? $name : ($folder . '/' . $name);
                    AuditHook::log('file.delete', [
                        'user'   => $username,
                        'folder' => $folder,
                        'path'   => $path,
                    ]);
                }
                $sampleFiles = array_slice(array_values($files), 0, 20);
                $eventPayload = [
                    'user' => $username,
                    'folder' => $folder,
                    'count' => count($files),
                    'files' => $sampleFiles,
                    'truncated' => count($files) > count($sampleFiles),
                ];
                if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                    $activeSourceId = $this->normalizeSourceId(SourceContext::getActiveId());
                    if ($activeSourceId !== '') {
                        $eventPayload['sourceId'] = $activeSourceId;
                    }
                }
                EventBus::emit('file.delete', $eventPayload);
            }
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::deleteFiles error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while deleting files.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function moveFiles()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            if (
                !$data
                || !isset($data['source'], $data['destination'], $data['files'])
                || !is_array($data['files'])
            ) {
                $this->jsonOut(["error" => "Invalid request"], 400);
                return;
            }

            $sourceFolder      = $this->normalizeFolder($data['source']);
            $destinationFolder = $this->normalizeFolder($data['destination']);
            if (!$this->validFolder($sourceFolder) || !$this->validFolder($destinationFolder)) {
                $this->jsonOut(["error" => "Invalid folder name(s)."], 400);
                return;
            }

            $files            = $data['files'];
            $username         = $_SESSION['username'] ?? '';
            $userPermissions  = $this->loadPerms($username);

            $useSources = (class_exists('SourceContext') && SourceContext::sourcesEnabled());
            $rawSourceId = $useSources ? ($data['sourceId'] ?? '') : '';
            $rawDestId = $useSources ? ($data['destSourceId'] ?? '') : '';
            $sourceId = $useSources
                ? $this->normalizeSourceId($rawSourceId !== '' ? $rawSourceId : SourceContext::getActiveId())
                : '';
            $destSourceId = $useSources
                ? $this->normalizeSourceId($rawDestId !== '' ? $rawDestId : $sourceId)
                : '';
            $asyncRequested = $this->isAsyncRequested($data);

            if ($useSources && (($rawSourceId !== '' && $sourceId === '') || ($rawDestId !== '' && $destSourceId === ''))) {
                $this->jsonOut(["error" => "Invalid source id."], 400);
                return;
            }

            $crossSource = ($sourceId !== '' && $destSourceId !== '' && $sourceId !== $destSourceId);
            if ($crossSource) {
                $sourceInfo = SourceContext::getSourceById($sourceId);
                $destInfo = SourceContext::getSourceById($destSourceId);
                if (!$sourceInfo || !$destInfo) {
                    $this->jsonOut(["error" => "Invalid source."], 400);
                    return;
                }
                if (!$this->isAdmin($userPermissions)) {
                    if (empty($sourceInfo['enabled']) || empty($destInfo['enabled'])) {
                        $this->jsonOut(["error" => "Source is disabled."], 403);
                        return;
                    }
                }
                if (!empty($sourceInfo['readOnly'])) {
                    $this->jsonOut(["error" => "Source is read-only."], 403);
                    return;
                }
                if (!empty($destInfo['readOnly'])) {
                    $this->jsonOut(["error" => "Destination source is read-only."], 403);
                    return;
                }

                $srcErr = $this->withSourceContext($sourceId, function () use ($username, $userPermissions, $sourceFolder, $files) {
                    $hasSourceView = ACL::canReadOwn($username, $userPermissions, $sourceFolder)
                        || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
                    if (!$hasSourceView) {
                        return "Forbidden: no read access to source";
                    }

                    $hasSourceDelete = ACL::canDelete($username, $userPermissions, $sourceFolder)
                        || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
                    if (!$hasSourceDelete) {
                        return "Forbidden: no delete permission on source";
                    }

                    $sv = $this->enforceFolderScope($sourceFolder, $username, $userPermissions, 'delete');
                    if ($sv) {
                        return $sv;
                    }

                    $ignoreOwnership = $this->isAdmin($userPermissions)
                        || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
                    if (
                        !$ignoreOwnership
                        && !ACL::canRead($username, $userPermissions, $sourceFolder)
                        && ACL::hasGrant($username, $sourceFolder, 'read_own')
                    ) {
                        $ownErr = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
                        if ($ownErr) {
                            return $ownErr;
                        }
                    }

                    return null;
                });
                if ($srcErr) {
                    $this->jsonOut(["error" => $srcErr], 403);
                    return;
                }

                $dstErr = $this->withSourceContext($destSourceId, function () use ($username, $userPermissions, $destinationFolder) {
                    $hasDestMove = ACL::canMove($username, $userPermissions, $destinationFolder)
                        || $this->ownsFolderOrAncestor($destinationFolder, $username, $userPermissions);
                    if (!$hasDestMove) {
                        return "Forbidden: no move permission on destination";
                    }
                    $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions, 'move');
                    if ($dv) {
                        return $dv;
                    }
                    return null;
                });
                if ($dstErr) {
                    $this->jsonOut(["error" => $dstErr], 403);
                    return;
                }

                $encErr = $this->crossSourceEncryptedError($sourceId, $sourceFolder, $destSourceId, $destinationFolder);
                if ($encErr) {
                    $this->jsonOut(["error" => $encErr], 400);
                    return;
                }

                if (!empty($userPermissions['readOnly'])) {
                    $this->jsonOut(["error" => "Account is read-only."], 403);
                    return;
                }
                if (!empty($userPermissions['disableUpload'])) {
                    $this->jsonOut(["error" => "Uploads are disabled for your account."], 403);
                    return;
                }

                if ($asyncRequested) {
                    $queued = $this->enqueueTransferJob([
                        'user' => $username,
                        'kind' => 'file_move',
                        'itemType' => 'file',
                        'mode' => 'move',
                        'sourceFolder' => $sourceFolder,
                        'destinationFolder' => $destinationFolder,
                        'sourceId' => $sourceId,
                        'destSourceId' => $destSourceId,
                        'crossSource' => true,
                        'files' => $files,
                        'selectedFiles' => count($files),
                        'selectedBytes' => is_numeric($data['totalBytes'] ?? null) ? (int)$data['totalBytes'] : 0,
                    ]);
                    if (isset($queued['error'])) {
                        $this->jsonOut(['error' => $queued['error']], 500);
                        return;
                    }
                    $this->jsonOut($queued, 202);
                    return;
                }

                $this->releaseSessionLock();
                $result = FileModel::moveFilesAcrossSources($sourceId, $destSourceId, $sourceFolder, $destinationFolder, $files);
                if (isset($result['success'])) {
                    foreach ($files as $name) {
                        $from = ($sourceFolder === 'root') ? $name : ($sourceFolder . '/' . $name);
                        $to   = ($destinationFolder === 'root') ? $name : ($destinationFolder . '/' . $name);
                        AuditHook::log('file.move', [
                            'user'   => $username,
                            'folder' => $destinationFolder,
                            'from'   => $from,
                            'to'     => $to,
                        ]);
                    }
                    $sampleFiles = array_slice(array_values($files), 0, 20);
                    $eventPayload = [
                        'user' => $username,
                        'sourceFolder' => $sourceFolder,
                        'destinationFolder' => $destinationFolder,
                        'count' => count($files),
                        'files' => $sampleFiles,
                        'truncated' => count($files) > count($sampleFiles),
                    ];
                    if ($sourceId !== '') {
                        $eventPayload['sourceId'] = $sourceId;
                    }
                    if ($destSourceId !== '') {
                        $eventPayload['destSourceId'] = $destSourceId;
                    }
                    EventBus::emit('file.move', $eventPayload);
                }
                $this->jsonOut($result);
                return;
            }

            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            // --- Permission gates (granular) ------------------------------------
            // Must be able to at least SEE the source and DELETE there
            $hasSourceView = ACL::canReadOwn($username, $userPermissions, $sourceFolder)
                || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
            if (!$hasSourceView) {
                $this->jsonOut(["error" => "Forbidden: no read access to source"], 403);
                return;
            }

            $hasSourceDelete = ACL::canDelete($username, $userPermissions, $sourceFolder)
                || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
            if (!$hasSourceDelete) {
                $this->jsonOut(["error" => "Forbidden: no delete permission on source"], 403);
                return;
            }

            // Destination must allow MOVE
            $hasDestMove = ACL::canMove($username, $userPermissions, $destinationFolder)
                || $this->ownsFolderOrAncestor($destinationFolder, $username, $userPermissions);
            if (!$hasDestMove) {
                $this->jsonOut(["error" => "Forbidden: no move permission on destination"], 403);
                return;
            }

            // --- Folder-scope checks --------------------------------------------
            // Source needs 'delete' scope; destination needs 'move' scope
            $sv = $this->enforceFolderScope($sourceFolder, $username, $userPermissions, 'delete');
            if ($sv) {
                $this->jsonOut(["error" => $sv], 403);
                return;
            }

            $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions, 'move');
            if ($dv) {
                $this->jsonOut(["error" => $dv], 403);
                return;
            }

            // --- Ownership enforcement when only viewOwn on source --------------
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

            if (
                !$ignoreOwnership
                && !ACL::canRead($username, $userPermissions, $sourceFolder)   // no explicit full read
                && ACL::hasGrant($username, $sourceFolder, 'read_own')         // but has own-only
            ) {
                $ownErr = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
                if ($ownErr) {
                    $this->jsonOut(["error" => $ownErr], 403);
                    return;
                }
            }

            if ($asyncRequested) {
                $queued = $this->enqueueTransferJob([
                    'user' => $username,
                    'kind' => 'file_move',
                    'itemType' => 'file',
                    'mode' => 'move',
                    'sourceFolder' => $sourceFolder,
                    'destinationFolder' => $destinationFolder,
                    'sourceId' => $sourceId,
                    'destSourceId' => $destSourceId,
                    'crossSource' => false,
                    'files' => $files,
                    'selectedFiles' => count($files),
                    'selectedBytes' => is_numeric($data['totalBytes'] ?? null) ? (int)$data['totalBytes'] : 0,
                ]);
                if (isset($queued['error'])) {
                    $this->jsonOut(['error' => $queued['error']], 500);
                    return;
                }
                $this->jsonOut($queued, 202);
                return;
            }

            // --- Perform move ----------------------------------------------------
            $this->releaseSessionLock();
            $result = FileModel::moveFiles($sourceFolder, $destinationFolder, $files);
            if (isset($result['success'])) {
                foreach ($files as $name) {
                    $from = ($sourceFolder === 'root') ? $name : ($sourceFolder . '/' . $name);
                    $to   = ($destinationFolder === 'root') ? $name : ($destinationFolder . '/' . $name);
                    AuditHook::log('file.move', [
                        'user'   => $username,
                        'folder' => $destinationFolder,
                        'from'   => $from,
                        'to'     => $to,
                    ]);
                }
                $sampleFiles = array_slice(array_values($files), 0, 20);
                $eventPayload = [
                    'user' => $username,
                    'sourceFolder' => $sourceFolder,
                    'destinationFolder' => $destinationFolder,
                    'count' => count($files),
                    'files' => $sampleFiles,
                    'truncated' => count($files) > count($sampleFiles),
                ];
                if ($sourceId !== '') {
                    $eventPayload['sourceId'] = $sourceId;
                }
                if ($destSourceId !== '') {
                    $eventPayload['destSourceId'] = $destSourceId;
                }
                EventBus::emit('file.move', $eventPayload);
            }
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::moveFiles error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while moving files.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function transferJobStart(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        header('Content-Type: application/json; charset=utf-8');

        if (!$this->checkCsrf()) {
            return;
        }
        if (!$this->requireAuth()) {
            return;
        }

        $data = $this->readJsonBody();
        if (!is_array($data) || !$data) {
            $this->jsonOut(['error' => 'Invalid input.'], 400);
            return;
        }

        $kind = strtolower(trim((string)($data['kind'] ?? '')));
        $payload = isset($data['payload']) && is_array($data['payload']) ? $data['payload'] : $data;
        $payload['async'] = true;
        if (!array_key_exists('totalBytes', $payload) && array_key_exists('totalBytes', $data)) {
            $payload['totalBytes'] = $data['totalBytes'];
        }
        if (!array_key_exists('totalFiles', $payload) && array_key_exists('totalFiles', $data)) {
            $payload['totalFiles'] = $data['totalFiles'];
        }

        if ($kind === 'file_copy' || $kind === 'file_move') {
            $this->withJsonBodyOverride($payload, function () use ($kind): void {
                if ($kind === 'file_copy') {
                    $this->copyFiles();
                    return;
                }
                $this->moveFiles();
            });
            return;
        }

        if ($kind === 'folder_copy' || $kind === 'folder_move') {
            if (!isset($payload['mode'])) {
                $payload['mode'] = $kind === 'folder_copy' ? 'copy' : 'move';
            }
            $folderController = new FolderController();
            $folderController->setJsonBodyOverride($payload);
            $folderController->moveFolder();
            return;
        }

        $this->jsonOut(['error' => 'Invalid transfer kind.'], 400);
    }

    public function transferJobStatus(): void
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }

            $jobId = trim((string)($_GET['jobId'] ?? $_GET['id'] ?? ''));
            if (!TransferJobManager::isValidId($jobId)) {
                $this->jsonOut(['error' => 'Invalid job id.'], 400);
                return;
            }

            $job = TransferJobManager::load($jobId);
            if (!is_array($job)) {
                $this->jsonOut(['error' => 'Job not found.'], 404);
                return;
            }

            $username = (string)($_SESSION['username'] ?? '');
            $perms = $this->loadPerms($username);
            $isAdmin = $this->isAdmin($perms);
            $owner = (string)($job['user'] ?? '');
            if (!$isAdmin && $owner !== '' && strcasecmp($owner, $username) !== 0) {
                $this->jsonOut(['error' => 'Forbidden.'], 403);
                return;
            }

            $this->jsonOut([
                'ok' => true,
                'job' => $this->transferJobToPublic($job),
            ]);
        } catch (Throwable $e) {
            error_log('FileController::transferJobStatus error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal error fetching transfer status.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function transferJobList(): void
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }

            $username = (string)($_SESSION['username'] ?? '');
            $perms = $this->loadPerms($username);
            $isAdmin = $this->isAdmin($perms);
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
            $jobs = TransferJobManager::listForUser($username, $isAdmin, $limit);
            $out = array_map(fn(array $job): array => $this->transferJobToPublic($job), $jobs);
            $this->jsonOut(['ok' => true, 'jobs' => $out]);
        } catch (Throwable $e) {
            error_log('FileController::transferJobList error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal error listing transfer jobs.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function transferJobCancel(): void
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            $jobId = trim((string)($data['jobId'] ?? $data['id'] ?? ''));
            if (!TransferJobManager::isValidId($jobId)) {
                $this->jsonOut(['error' => 'Invalid job id.'], 400);
                return;
            }

            $job = TransferJobManager::load($jobId);
            if (!is_array($job)) {
                $this->jsonOut(['error' => 'Job not found.'], 404);
                return;
            }

            $username = (string)($_SESSION['username'] ?? '');
            $perms = $this->loadPerms($username);
            $isAdmin = $this->isAdmin($perms);
            $owner = (string)($job['user'] ?? '');
            if (!$isAdmin && $owner !== '' && strcasecmp($owner, $username) !== 0) {
                $this->jsonOut(['error' => 'Forbidden.'], 403);
                return;
            }

            $status = strtolower((string)($job['status'] ?? 'queued'));
            if (in_array($status, ['done', 'error', 'cancelled'], true)) {
                $this->jsonOut(['ok' => true, 'job' => $this->transferJobToPublic($job)]);
                return;
            }

            if (!TransferJobManager::requestCancel($jobId)) {
                $this->jsonOut(['error' => 'Failed to cancel job.'], 500);
                return;
            }

            $fresh = TransferJobManager::load($jobId) ?: [];
            $freshStatus = strtolower((string)($fresh['status'] ?? 'queued'));
            if (in_array($freshStatus, ['queued', 'cancel_requested'], true)) {
                $fresh['status'] = 'cancelled';
                $fresh['phase'] = 'cancelled';
                $fresh['endedAt'] = time();
                TransferJobManager::save($jobId, $fresh);
                $fresh = TransferJobManager::load($jobId) ?: $fresh;
            }

            $this->jsonOut([
                'ok' => true,
                'job' => $this->transferJobToPublic($fresh),
            ]);
        } catch (Throwable $e) {
            error_log('FileController::transferJobCancel error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal error cancelling transfer job.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function renameFile()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            if (!$data || !isset($data['folder'], $data['oldName'], $data['newName'])) {
                $this->jsonOut(["error" => "Invalid input"], 400);
                return;
            }

            $folder  = $this->normalizeFolder($data['folder']);
            $oldName = basename(trim((string)$data['oldName']));
            $newName = basename(trim((string)$data['newName']));
            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name"], 400);
                return;
            }
            if (!$this->validFile($oldName) || !$this->validFile($newName)) {
                $this->jsonOut(["error" => "Invalid file name(s)."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            // Need granular rename (or ancestor-owner)
            if (!(ACL::canRename($username, $userPermissions, $folder))) {
                $this->jsonOut(["error" => "Forbidden: no rename rights"], 403);
                return;
            }

            // Folder scope: rename
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'rename');
            if ($dv) {
                $this->jsonOut(["error" => $dv], 403);
                return;
            }

            // Ownership for non-admins when not a folder owner
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
            $isFolderOwner = ACL::isOwner($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);
            if (!$ignoreOwnership && !$isFolderOwner) {
                $violation = $this->enforceScopeAndOwnership($folder, [$oldName], $username, $userPermissions);
                if ($violation) {
                    $this->jsonOut(["error" => $violation], 403);
                    return;
                }
            }

            $result = FileModel::renameFile($folder, $oldName, $newName);
            if (!is_array($result)) {
                throw new RuntimeException('FileModel::renameFile returned non-array');
            }
            if (isset($result['error'])) {
                $this->jsonOut($result, 400);
                return;
            }
            $finalName = isset($result['newName']) ? (string)$result['newName'] : $newName;
            AuditHook::log('file.rename', [
                'user'   => $username,
                'folder' => $folder,
                'from'   => ($folder === 'root') ? $oldName : ($folder . '/' . $oldName),
                'to'     => ($folder === 'root') ? $finalName : ($folder . '/' . $finalName),
            ]);
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::renameFile error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while renaming file.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function saveFile()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            if (empty($data) || !isset($data["fileName"])) {
                $this->jsonOut(["error" => "Invalid request data"], 400);
                return;
            }

            $fileName = basename(trim((string)$data["fileName"]));
            $folder   = $this->normalizeFolder($data["folder"] ?? 'root');
            if (!$this->validFile($fileName)) {
                $this->jsonOut(["error" => "Invalid file name."], 400);
                return;
            }
            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);
            $sourceId = '';
            $allowDisabled = false;
            if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $rawSourceId = trim((string)($data['sourceId'] ?? ''));
                if ($rawSourceId !== '') {
                    $sourceId = $this->normalizeSourceId($rawSourceId);
                    if ($sourceId === '') {
                        $this->jsonOut(["error" => "Invalid source id."], 400);
                        return;
                    }
                    $info = SourceContext::getSourceById($sourceId);
                    if (!$info) {
                        $this->jsonOut(["error" => "Invalid source."], 400);
                        return;
                    }
                    $allowDisabled = $this->isAdmin($userPermissions);
                    if (!$allowDisabled && empty($info['enabled'])) {
                        $this->jsonOut(["error" => "Source is disabled."], 403);
                        return;
                    }
                    if (!empty($info['readOnly'])) {
                        $this->jsonOut(["error" => "Source is read-only."], 403);
                        return;
                    }
                }
            }

            $runner = function () use ($data, $fileName, $folder, $username, $userPermissions) {
                if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                    $this->jsonOut(["error" => "Source is read-only."], 403);
                    return;
                }

                // Need write (or ancestor-owner)
                if (!(ACL::canEdit($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                    $this->jsonOut(["error" => "Forbidden: no full write access"], 403);
                    return;
                }

                // Folder scope: write
                $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'edit');
                if ($dv) {
                    $this->jsonOut(["error" => $dv], 403);
                    return;
                }

                // If overwriting, enforce ownership for non-admins (unless folder owner)
                $storage = StorageRegistry::getAdapter();
                $baseDir = rtrim((class_exists('SourceContext') ? SourceContext::uploadRoot() : (string)UPLOAD_DIR), '/\\');
                $dir = ($folder === 'root') ? $baseDir : $baseDir . DIRECTORY_SEPARATOR . $folder;
                $path = $dir . DIRECTORY_SEPARATOR . $fileName;
                if ($storage->stat($path) !== null) {
                    $ignoreOwnership = $this->isAdmin($userPermissions)
                        || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
                        || ACL::isOwner($username, $userPermissions, $folder)
                        || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);

                    if (!$ignoreOwnership) {
                        $violation = $this->enforceScopeAndOwnership($folder, [$fileName], $username, $userPermissions);
                        if ($violation) {
                            $this->jsonOut(["error" => $violation], 403);
                            return;
                        }
                    }
                }

                $deny = ['php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8', 'pht', 'shtml', 'cgi', 'fcgi'];
                $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
                if (in_array($ext, $deny, true)) {
                    $this->jsonOut(['error' => 'Saving this file type is not allowed.'], 400);
                    return;
                }

                $content = (string)($data['content'] ?? '');
                $result = FileModel::saveFile($folder, $fileName, $content, $username);
                if (!is_array($result)) {
                    throw new RuntimeException('FileModel::saveFile returned non-array');
                }
                if (isset($result['error'])) {
                    $this->jsonOut($result, 400);
                    return;
                }
                AuditHook::log('file.edit', [
                    'user'   => $username,
                    'folder' => $folder,
                    'path'   => ($folder === 'root') ? $fileName : ($folder . '/' . $fileName),
                ]);
                $this->jsonOut($result);
            };

            if ($sourceId !== '') {
                $this->withSourceContext($sourceId, $runner, $allowDisabled);
                return;
            }
            $runner();
        } catch (Throwable $e) {
            error_log('FileController::saveFile error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while saving file.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    /**
     * Stream a file with proper HTTP Range support so HTML5 video/audio can seek.
     *
     * @param string $fullPath     Absolute filesystem path
     * @param string $downloadName Name shown in Content-Disposition
     * @param string $mimeType     MIME type (from FileModel::getDownloadInfo)
     * @param bool   $inline       true => inline, false => attachment
     */
    private function streamFileWithRange(string $fullPath, string $downloadName, string $mimeType, bool $inline): void
    {
        if (!is_file($fullPath) || !is_readable($fullPath)) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'File not found']);
            exit;
        }

        $size = (int)@filesize($fullPath);
        $start = 0;
        $end   = $size > 0 ? $size - 1 : 0;

        if ($size < 0) {
            $size = 0;
            $end  = 0;
        }

        // Close session + disable output buffering for streaming
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
        }
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', 'off');
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        $disposition = $inline ? 'inline' : 'attachment';
        $mime = $mimeType ?: 'application/octet-stream';

        header('X-Content-Type-Options: nosniff');
        header('Accept-Ranges: bytes');
        header("Content-Type: {$mime}");
        header("Content-Disposition: {$disposition}; filename=\"" . basename($downloadName) . "\"");

        // Handle HTTP Range header (single range + suffix range)
        $length = $size;
        $rangeHeader = $_SERVER['HTTP_RANGE'] ?? '';
        if ($rangeHeader !== '' && preg_match('/bytes=\s*(\d*)-(\d*)/i', $rangeHeader, $m)) {
            $rangeStart = $m[1];
            $rangeEnd = $m[2];

            if ($size <= 0) {
                http_response_code(416);
                header('Content-Range: bytes */0');
                exit;
            }

            if ($rangeStart !== '' || $rangeEnd !== '') {
                if ($rangeStart === '' && $rangeEnd !== '') {
                    // suffix range: last N bytes
                    $suffixLen = (int)$rangeEnd;
                    if ($suffixLen <= 0) {
                        http_response_code(416);
                        header("Content-Range: bytes */{$size}");
                        exit;
                    }
                    $start = max($size - $suffixLen, 0);
                    $end = $size - 1;
                } else {
                    $start = (int)$rangeStart;
                    $end = ($rangeEnd !== '') ? (int)$rangeEnd : ($size - 1);
                }

                if ($start < 0 || $start >= $size || $end < $start) {
                    http_response_code(416);
                    header("Content-Range: bytes */{$size}");
                    exit;
                }
                if ($end >= $size) {
                    $end = $size - 1;
                }

                $length = $end - $start + 1;

                http_response_code(206);
                header("Content-Range: bytes {$start}-{$end}/{$size}");
                header("Content-Length: {$length}");
            } else {
                http_response_code(200);
                if ($size > 0) {
                    header("Content-Length: {$size}");
                }
            }
        } else {
            // no range => full file
            http_response_code(200);
            if ($size > 0) {
                header("Content-Length: {$size}");
            }
        }

        $fp = @fopen($fullPath, 'rb');
        if ($fp === false) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Unable to open file.']);
            exit;
        }

        if ($start > 0) {
            @fseek($fp, $start);
        }

        $bytesToSend = $length;
        $chunkSize = 8192;

        while ($bytesToSend > 0 && !feof($fp)) {
            $readSize = ($bytesToSend > $chunkSize) ? $chunkSize : $bytesToSend;
            $buffer = fread($fp, $readSize);
            if ($buffer === false) {
                break;
            }
            echo $buffer;
            flush();
            $bytesToSend -= strlen($buffer);

            if (connection_aborted()) {
                break;
            }
        }

        fclose($fp);
        exit;
    }

    private function readStreamChunk($stream, int $length)
    {
        if (is_resource($stream)) {
            return fread($stream, $length);
        }
        if (is_object($stream) && method_exists($stream, 'read')) {
            return $stream->read($length);
        }
        if (is_object($stream) && method_exists($stream, 'getContents')) {
            return $stream->getContents();
        }
        return false;
    }

    private function closeStream($stream): void
    {
        if (is_resource($stream)) {
            fclose($stream);
            return;
        }
        if (is_object($stream) && method_exists($stream, 'close')) {
            $stream->close();
        }
    }

    private function adapterErrorDetail(StorageAdapterInterface $storage): string
    {
        if (method_exists($storage, 'getLastError')) {
            $detail = trim((string)$storage->getLastError());
            if ($detail !== '') {
                $detail = preg_replace('/(\\w+:\\/\\/)([^\\s@]+@)/i', '$1', $detail) ?? $detail;
                if (strlen($detail) > 240) {
                    $detail = substr($detail, 0, 240) . '...';
                }
                return $detail;
            }
        }
        return '';
    }

    private function streamAdapterWithRange(
        StorageAdapterInterface $storage,
        string $path,
        string $downloadName,
        string $mimeType,
        bool $inline
    ): void {
        $stat = $storage->stat($path);
        if (!$stat || ($stat['type'] ?? '') !== 'file') {
            if (!$stat || ($stat['type'] ?? '') === '') {
                $probe = $storage->openReadStream($path, 1, 0);
                if ($probe === false) {
                    http_response_code(404);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode(['error' => 'File not found']);
                    exit;
                }
                $this->closeStream($probe);
                $stat = [
                    'type' => 'file',
                    'size' => 0,
                    'sizeUnknown' => true,
                ];
            } else {
                http_response_code(404);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['error' => 'File not found']);
                exit;
            }
        }

        $size = (int)($stat['size'] ?? 0);
        $sizeUnknown = !empty($stat['sizeUnknown']);
        $start = 0;
        $end   = $size > 0 ? $size - 1 : 0;

        if ($size < 0) {
            $size = 0;
            $end  = 0;
        }

        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }

        // Close session + disable output buffering for streaming
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
        }
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', 'off');
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        $disposition = $inline ? 'inline' : 'attachment';
        $mime = $mimeType ?: 'application/octet-stream';

        header('X-Content-Type-Options: nosniff');
        header('Accept-Ranges: ' . ($sizeUnknown ? 'none' : 'bytes'));
        header("Content-Type: {$mime}");
        header("Content-Disposition: {$disposition}; filename=\"" . basename($downloadName) . "\"");

        if ($sizeUnknown) {
            http_response_code(200);
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
                exit;
            }

            $stream = $storage->openReadStream($path, null, 0);
            if ($stream === false) {
                $detail = $this->adapterErrorDetail($storage);
                $msg = $detail !== '' ? ('Unable to open file stream: ' . $detail) : 'Unable to open file stream.';
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['error' => $msg]);
                exit;
            }

            $chunkSize = 8192;
            while (true) {
                $buffer = $this->readStreamChunk($stream, $chunkSize);
                if ($buffer === false || $buffer === '') {
                    break;
                }
                echo $buffer;
                flush();

                if (connection_aborted()) {
                    break;
                }
            }

            $this->closeStream($stream);
            exit;
        }

        $length = $size;
        $rangeRequested = false;
        $rangeHeader = $_SERVER['HTTP_RANGE'] ?? '';
        if ($rangeHeader !== '' && preg_match('/bytes=\\s*(\\d*)-(\\d*)/i', $rangeHeader, $m)) {
            $rangeRequested = true;
            $rangeStart = $m[1];
            $rangeEnd = $m[2];

            if ($size <= 0) {
                http_response_code(416);
                header('Content-Range: bytes */0');
                exit;
            }

            if ($rangeStart !== '' || $rangeEnd !== '') {
                if ($rangeStart === '' && $rangeEnd !== '') {
                    $suffixLen = (int)$rangeEnd;
                    if ($suffixLen <= 0) {
                        http_response_code(416);
                        header("Content-Range: bytes */{$size}");
                        exit;
                    }
                    $start = max($size - $suffixLen, 0);
                    $end = $size - 1;
                } else {
                    $start = (int)$rangeStart;
                    $end = ($rangeEnd !== '') ? (int)$rangeEnd : ($size - 1);
                }

                if ($start < 0 || $start >= $size || $end < $start) {
                    http_response_code(416);
                    header("Content-Range: bytes */{$size}");
                    exit;
                }
                if ($end >= $size) {
                    $end = $size - 1;
                }

                $length = $end - $start + 1;

                http_response_code(206);
                header("Content-Range: bytes {$start}-{$end}/{$size}");
                header("Content-Length: {$length}");
            } else {
                http_response_code(200);
                if ($size > 0) {
                    header("Content-Length: {$size}");
                }
            }
        } else {
            http_response_code(200);
            if ($size > 0) {
                header("Content-Length: {$size}");
            }
        }

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
            exit;
        }

        $streamLength = ($rangeRequested && $length > 0) ? $length : null;
        $streamOffset = $rangeRequested ? $start : 0;
        $stream = $storage->openReadStream($path, $streamLength, $streamOffset);
        if ($stream === false) {
            $detail = $this->adapterErrorDetail($storage);
            $msg = $detail !== '' ? ('Unable to open file stream: ' . $detail) : 'Unable to open file stream.';
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => $msg]);
            exit;
        }

        $bytesToSend = $length;
        $chunkSize = 8192;

        while ($bytesToSend > 0) {
            $readSize = ($bytesToSend > $chunkSize) ? $chunkSize : $bytesToSend;
            $buffer = $this->readStreamChunk($stream, $readSize);
            if ($buffer === false || $buffer === '') {
                break;
            }
            echo $buffer;
            flush();
            $bytesToSend -= strlen($buffer);

            if (connection_aborted()) {
                break;
            }
        }

        $this->closeStream($stream);
        exit;
    }

    /**
     * Stream an encrypted-at-rest file by decrypting it on the fly (no Range support).
     *
     * @param string $fullPath     Absolute filesystem path (ciphertext on disk)
     * @param string $downloadName Name shown in Content-Disposition
     * @param string $mimeType     MIME type (detected from ciphertext path / extension)
     * @param bool   $inline       true => inline, false => attachment
     */
    private function streamEncryptedFileNoRange(string $fullPath, string $downloadName, string $mimeType, bool $inline): void
    {
        if (!is_file($fullPath) || !is_readable($fullPath)) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'File not found']);
            exit;
        }

        if (!CryptoAtRest::masterKeyIsConfigured()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Encryption master key is not configured on this server.']);
            exit;
        }

        $hdr = CryptoAtRest::readHeader($fullPath);
        if (!$hdr) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Encrypted file header is invalid.']);
            exit;
        }

        $plainSize = (int)($hdr['plainSize'] ?? 0);

        // No Range support for v1 encryption-at-rest.
        if (!empty($_SERVER['HTTP_RANGE'])) {
            http_response_code(416);
            header('X-Content-Type-Options: nosniff');
            header('Accept-Ranges: none');
            if ($plainSize > 0) {
                header('Content-Range: bytes */' . $plainSize);
            }
            exit;
        }

        // Close session + disable output buffering for streaming
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
        }
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', 'off');
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        $disposition = $inline ? 'inline' : 'attachment';
        $mime = $mimeType ?: 'application/octet-stream';

        header('X-Content-Type-Options: nosniff');
        header('Accept-Ranges: none');
        header("Content-Type: {$mime}");
        header("Content-Disposition: {$disposition}; filename=\"" . basename($downloadName) . "\"");
        if ($plainSize > 0) {
            header('Content-Length: ' . $plainSize);
        }

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
            http_response_code(200);
            exit;
        }

        http_response_code(200);

        try {
            $out = fopen('php://output', 'wb');
            if ($out === false) {
                throw new \RuntimeException('Unable to open output stream.');
            }
            CryptoAtRest::streamDecrypted($fullPath, $out);
            @fclose($out);
        } catch (\Throwable $e) {
            error_log('Encrypted download failed: ' . $e->getMessage());
        }
        exit;
    }

    public function downloadFile()
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        $readParam = function (string $key): string {
            $val = $_GET[$key] ?? null;
            if (is_array($val)) {
                $val = reset($val);
            }
            if (is_string($val) || is_numeric($val)) {
                return (string)$val;
            }
            $raw = $_SERVER['QUERY_STRING'] ?? '';
            if ($raw !== '') {
                $parsed = [];
                parse_str($raw, $parsed);
                $alt = $parsed[$key] ?? null;
                if (is_array($alt)) {
                    $alt = reset($alt);
                }
                if (is_string($alt) || is_numeric($alt)) {
                    return (string)$alt;
                }
            }
            return '';
        };

        $file   = basename($readParam('file'));
        $folder = trim($readParam('folder')) ?: 'root';
        $inlineParam = isset($_GET['inline']) && (string)$_GET['inline'] === '1';

        if (!preg_match(REGEX_FILE_NAME, $file)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);

        $sourceId = '';
        $allowDisabled = false;
        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $rawSourceId = trim((string)($_GET['sourceId'] ?? ''));
            if ($rawSourceId !== '') {
                $sourceId = $this->normalizeSourceId($rawSourceId);
                if ($sourceId === '') {
                    http_response_code(400);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode(["error" => "Invalid source id."]);
                    exit;
                }
                $info = SourceContext::getSourceById($sourceId);
                if (!$info) {
                    http_response_code(400);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode(["error" => "Invalid source."]);
                    exit;
                }
                $allowDisabled = $this->isAdmin($perms);
                if (!$allowDisabled && empty($info['enabled'])) {
                    http_response_code(403);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode(["error" => "Source is disabled."]);
                    exit;
                }
            }
        }

        $runner = function () use ($file, $folder, $inlineParam, $username, $perms, $sourceId) {
            $storage = StorageRegistry::getAdapter();
            $isLocal = $storage->isLocal();

            $ignoreOwnership = $this->isAdmin($perms)
            || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

        // Treat ancestor-folder ownership as full view as well
            $fullView = $ignoreOwnership
            || ACL::canRead($username, $perms, $folder)
            || $this->ownsFolderOrAncestor($folder, $username, $perms);

            $ownGrant = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

            if (!$fullView && !$ownGrant) {
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => "Forbidden: no view access to this folder."]);
                exit;
            }

        // If own-only, enforce uploader==user
            if ($ownGrant) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                    http_response_code(403);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
                    exit;
                }
            }

            $downloadInfo = FileModel::getDownloadInfo($folder, $file);
            if (isset($downloadInfo['error'])) {
                http_response_code(in_array($downloadInfo['error'], ["File not found.", "Access forbidden."]) ? 404 : 400);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => $downloadInfo['error']]);
                exit;
            }

            $realFilePath = $downloadInfo['filePath'];
            $mimeType     = $downloadInfo['mimeType'];
            $downloadName = $downloadInfo['downloadName'] ?? basename($realFilePath);

            $ext   = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
            $isSvg = ($ext === 'svg' || $ext === 'svgz');

        // Inline-safe types with explicit MIME mapping (avoid nosniff + octet-stream issues)
            $inlineImageMime = [
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png'  => 'image/png',
            'gif'  => 'image/gif',
            'bmp'  => 'image/bmp',
            'webp' => 'image/webp',
            'ico'  => 'image/x-icon',
            ];
            $inlineVideoMime = [
            'mp4'  => 'video/mp4',
            'm4v'  => 'video/mp4',
            'mkv'  => 'video/x-matroska',
            'webm' => 'video/webm',
            'mov'  => 'video/quicktime',
            'ogv'  => 'video/ogg',
            ];
            $inlineAudioMime = [
            'mp3'  => 'audio/mpeg',
            'wav'  => 'audio/wav',
            'm4a'  => 'audio/mp4',
            'ogg'  => 'audio/ogg',
            'flac' => 'audio/flac',
            'aac'  => 'audio/aac',
            'wma'  => 'audio/x-ms-wma',
            'opus' => 'audio/opus',
            ];
            $inlineDocMime = [
            'pdf'  => 'application/pdf',
            ];

        // Default mime if not provided
            if (empty($mimeType)) {
                $mimeType = 'application/octet-stream';
            }

        // SECURITY: SVG/SVGZ is never rendered inline, even if ?inline=1
        // Also serve as octet-stream to avoid any chance of inline execution.
            if ($isSvg || $mimeType === 'image/svg+xml') {
                $mimeType = 'application/octet-stream';
                $inline   = false;
            } else {
                $inline = false;
                if ($inlineParam) {
                    if (isset($inlineImageMime[$ext])) {
                        $inline = true;
                        $mimeType = $inlineImageMime[$ext];
                    } elseif (isset($inlineVideoMime[$ext])) {
                        $inline = true;
                        $mimeType = $inlineVideoMime[$ext];
                    } elseif (isset($inlineAudioMime[$ext])) {
                        $inline = true;
                        $mimeType = $inlineAudioMime[$ext];
                    } elseif (isset($inlineDocMime[$ext])) {
                        $inline = true;
                        $mimeType = $inlineDocMime[$ext];
                    }
                }
            }

            $portalMeta = null;
            $portalSubmissionRef = '';
            if (!empty($_GET['source']) && strtolower((string)$_GET['source']) === 'portal') {
                $slug = trim((string)($_GET['portal'] ?? ''));
                if ($slug !== '') {
                    $slug = str_replace(["\r", "\n"], '', $slug);
                    $portalMeta = $this->getValidatedPortalMeta($slug, $folder, $username, $sourceId);
                    if ($portalMeta) {
                        $portalSubmissionRef = $this->sanitizePortalSubmissionRef((string)($_GET['submissionRef'] ?? ''));
                    }
                }
            }

            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
                AuditHook::log('file.download', [
                'user'   => $username,
                'folder' => $folder,
                'path'   => ($folder === 'root') ? $file : ($folder . '/' . $file),
                'meta'   => $portalMeta,
                ]);
                if ($portalMeta && !$inlineParam) {
                    $this->logPortalDownload(
                        (string)($portalMeta['portal'] ?? ''),
                        $folder,
                        $file,
                        (string)$username,
                        $portalSubmissionRef,
                        (string)$sourceId
                    );
                }
            }

            if (!$isLocal) {
                $this->streamAdapterWithRange($storage, $realFilePath, $downloadName, $mimeType, $inline);
            }

        // Encrypted-at-rest files: decrypt on download (no Range)
            $isEncryptedFile = false;
            try {
                $isEncryptedFile = CryptoAtRest::isEncryptedFile($realFilePath);
            } catch (\Throwable $e) {
                $isEncryptedFile = false;
            }

            if ($isEncryptedFile) {
                $this->streamEncryptedFileNoRange($realFilePath, basename($realFilePath), $mimeType, $inline);
            }

        // Stream with proper Range support for video/audio seeking
            $this->streamFileWithRange($realFilePath, basename($realFilePath), $mimeType, $inline);
        };

        if ($sourceId !== '') {
            $this->withSourceContext($sourceId, $runner, $allowDisabled);
            return;
        }

        $runner();
        return;
    }

    private function sanitizePortalSubmissionRef(string $value): string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '', $value));
        if ($clean === '') {
            return '';
        }
        return substr($clean, 0, 48);
    }

    private function getValidatedPortalMeta(string $slug, string $folder, string $username, string $sourceId): ?array
    {
        if ($slug === '' || $username === '') {
            return null;
        }

        $portal = $this->loadPortalRecord($slug);
        if (!$portal) {
            return null;
        }

        if ($this->isPortalExpired((string)($portal['expiresAt'] ?? ''))) {
            return null;
        }

        if (!$this->portalAllowsDownload($portal)) {
            return null;
        }

        $portalFolder = ACL::normalizeFolder((string)($portal['folder'] ?? 'root'));
        $allowSubfolders = !empty($portal['allowSubfolders']);
        if (!$this->portalFolderMatches($portalFolder, $folder, $allowSubfolders)) {
            return null;
        }

        $portalUsername = $this->resolvePortalUsername($portal, $slug);
        if ($portalUsername === '' || strcasecmp($portalUsername, $username) !== 0) {
            return null;
        }

        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $portalSourceRaw = trim((string)($portal['sourceId'] ?? ''));
            $portalSourceId = $portalSourceRaw !== '' ? $this->normalizeSourceId($portalSourceRaw) : 'local';
            if ($portalSourceId === '') {
                return null;
            }
            $requestSourceId = $sourceId !== '' ? $sourceId : 'local';
            if ($portalSourceId !== $requestSourceId) {
                return null;
            }
        }

        return ['portal' => $slug];
    }

    private function loadPortalRecord(string $slug): ?array
    {
        if ($slug === '' || !defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
            return null;
        }
        if (!defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            return null;
        }
        $proPortalsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProPortals.php';
        if (!is_file($proPortalsPath)) {
            return null;
        }
        require_once $proPortalsPath;
        $store = new ProPortals(FR_PRO_BUNDLE_DIR);
        $portals = $store->listPortals();
        if (!is_array($portals)) {
            return null;
        }
        $portal = $portals[$slug] ?? null;
        return is_array($portal) ? $portal : null;
    }

    private function portalAllowsDownload(array $portal): bool
    {
        $hasAllowDownload = array_key_exists('allowDownload', $portal);
        $uploadOnly = !empty($portal['uploadOnly']);
        $allowDownload = $hasAllowDownload ? !empty($portal['allowDownload']) : true;
        return $hasAllowDownload ? (bool)$allowDownload : !$uploadOnly;
    }

    private function isPortalExpired(string $expiresAt): bool
    {
        $expiresAt = trim($expiresAt);
        if ($expiresAt === '') {
            return false;
        }
        $ts = strtotime($expiresAt . ' 23:59:59');
        if ($ts === false) {
            return false;
        }
        return time() > $ts;
    }

    private function resolvePortalUsername(array $portal, string $slug): string
    {
        $portalUser = isset($portal['portalUser']) && is_array($portal['portalUser']) ? $portal['portalUser'] : [];
        $username = trim((string)($portalUser['username'] ?? ''));
        if ($username !== '') {
            return $username;
        }

        $portalUserCreate = !array_key_exists('create', $portalUser) || !empty($portalUser['create']);
        if (!$portalUserCreate || $slug === '') {
            return '';
        }

        $clean = preg_replace('/[^A-Za-z0-9_-]+/', '-', $slug);
        $clean = trim((string)$clean, '-_');
        $cleanLower = strtolower($clean);
        if (strpos($cleanLower, 'portal-') === 0) {
            $cleanLower = substr($cleanLower, 7);
        } elseif ($cleanLower === 'portal') {
            $cleanLower = '';
        }
        if ($cleanLower === '') {
            return '';
        }
        $candidate = 'portal_' . $cleanLower;
        if (!preg_match(REGEX_USER, $candidate)) {
            return '';
        }
        return $candidate;
    }

    private function portalFolderMatches(string $portalFolder, string $folder, bool $allowSubfolders): bool
    {
        $portalFolder = ACL::normalizeFolder($portalFolder);
        $folder = ACL::normalizeFolder($folder);
        if ($portalFolder === 'root') {
            return $allowSubfolders ? true : $folder === 'root';
        }
        if ($folder === $portalFolder) {
            return true;
        }
        if ($allowSubfolders && strpos($folder, $portalFolder . '/') === 0) {
            return true;
        }
        return false;
    }

    private function detectClientIp(): string
    {
        $ip = '';
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $parts = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
            foreach ($parts as $part) {
                $candidate = trim($part);
                if ($candidate !== '') {
                    $ip = $candidate;
                    break;
                }
            }
        } elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
            $ip = trim((string)$_SERVER['HTTP_X_REAL_IP']);
        } elseif (!empty($_SERVER['REMOTE_ADDR'])) {
            $ip = trim((string)$_SERVER['REMOTE_ADDR']);
        }
        return $ip;
    }

    private function logPortalDownload(
        string $slug,
        string $folder,
        string $file,
        string $username,
        string $submissionRef,
        string $sourceId
    ): void {
        if ($slug === '' || !defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
            return;
        }

        $metaRoot = rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR;
        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $metaRoot = $sourceId !== '' ? SourceContext::metaRootForId($sourceId) : SourceContext::metaRoot();
        }

        if (!is_dir($metaRoot)) {
            @mkdir($metaRoot, 0775, true);
        }

        $entry = [
            'slug'          => $slug,
            'folder'        => $folder,
            'file'          => $file,
            'path'          => ($folder === 'root') ? $file : ($folder . '/' . $file),
            'username'      => $username,
            'submissionRef' => $submissionRef,
            'sourceId'      => $sourceId,
            'ip'            => $this->detectClientIp(),
            'userAgent'     => (string)($_SERVER['HTTP_USER_AGENT'] ?? ''),
            'createdAt'     => gmdate('c'),
        ];

        $logPath = $metaRoot . 'portal_downloads.log';
        @file_put_contents(
            $logPath,
            json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
            FILE_APPEND | LOCK_EX
        );
    }

    public function videoThumbnail()
    {
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        $readParam = function (string $key): string {
            $val = $_GET[$key] ?? null;
            if (is_array($val)) {
                $val = reset($val);
            }
            if (is_string($val) || is_numeric($val)) {
                return (string)$val;
            }
            $raw = $_SERVER['QUERY_STRING'] ?? '';
            if ($raw !== '') {
                $parsed = [];
                parse_str($raw, $parsed);
                $alt = $parsed[$key] ?? null;
                if (is_array($alt)) {
                    $alt = reset($alt);
                }
                if (is_string($alt) || is_numeric($alt)) {
                    return (string)$alt;
                }
            }
            return '';
        };

        $rawFile = $readParam('file');
        $rawFolder = $readParam('folder');
        $file   = basename($rawFile);
        $folder = trim($rawFolder) ?: 'root';

        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);

        $fail = function (int $code, string $message): void {
            http_response_code($code);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => $message]);
            exit;
        };

        if (!preg_match(REGEX_FILE_NAME, $file)) {
            $fail(400, "Invalid file name.");
        }
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            $fail(400, "Invalid folder name.");
        }

        $sourceId = '';
        $allowDisabled = false;
        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $rawSourceId = trim($readParam('sourceId'));
            if ($rawSourceId !== '') {
                $sourceId = $this->normalizeSourceId($rawSourceId);
                if ($sourceId === '') {
                    $fail(400, "Invalid source id.");
                }
                $info = SourceContext::getSourceById($sourceId);
                if (!$info) {
                    $fail(400, "Invalid source.");
                }
                $allowDisabled = $this->isAdmin($perms);
                if (!$allowDisabled && empty($info['enabled'])) {
                    $fail(403, "Source is disabled.");
                }
            }
        }

        $runner = function () use ($file, $folder, $username, $perms, $fail) {
            $storage = StorageRegistry::getAdapter();
            if (!$storage->isLocal()) {
                $fail(501, "Thumbnail unavailable for remote sources.");
            }

            $ignoreOwnership = $this->isAdmin($perms)
                || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

            $fullView = $ignoreOwnership
                || ACL::canRead($username, $perms, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $perms);

            $ownGrant = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

            if (!$fullView && !$ownGrant) {
                $fail(403, "Forbidden: no view access to this folder.");
            }

            if ($ownGrant) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                    $fail(403, "Forbidden: you are not the owner of this file.");
                }
            }

            $downloadInfo = FileModel::getDownloadInfo($folder, $file);
            if (isset($downloadInfo['error'])) {
                $code = in_array($downloadInfo['error'], ["File not found.", "Access forbidden."]) ? 404 : 400;
                $fail($code, $downloadInfo['error']);
            }

            $realFilePath = $downloadInfo['filePath'];
            $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
            $videoExts = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'ogv'];
            $isPdf = ($ext === 'pdf');
            $isVideo = in_array($ext, $videoExts, true);
            if (!$isVideo && !$isPdf) {
                $fail(415, "Unsupported media type.");
            }

            $isEncryptedFile = false;
            try {
                $isEncryptedFile = CryptoAtRest::isEncryptedFile($realFilePath);
            } catch (\Throwable $e) {
                $isEncryptedFile = false;
            }
            if ($isEncryptedFile) {
                $fail(404, "Thumbnail unavailable.");
            }

            $maxMb = $isPdf ? 50 : 200;
            try {
                $cfg = AdminModel::getConfig();
                if (is_array($cfg) && !isset($cfg['error'])) {
                    $display = (isset($cfg['display']) && is_array($cfg['display'])) ? $cfg['display'] : [];
                    if ($isPdf && (!array_key_exists('enablePdfThumbnails', $display) || empty($display['enablePdfThumbnails']))) {
                        $fail(404, "Thumbnail unavailable.");
                    }
                    if ($isVideo && isset($display['hoverPreviewMaxVideoMb'])) {
                        $maxMb = (int)$display['hoverPreviewMaxVideoMb'];
                    }
                }
            } catch (\Throwable $e) {
/* best-effort only */
            }
            if ($isPdf) {
                $envPdfMaxMb = getenv('FR_PDF_THUMB_MAX_MB');
                if ($envPdfMaxMb !== false && $envPdfMaxMb !== '') {
                    $maxMb = (int)$envPdfMaxMb;
                }
            }
            $maxMb = max(1, min(2048, $maxMb));
            $maxBytes = $maxMb * 1024 * 1024;
            $size = @filesize($realFilePath);
            if ($size !== false && $maxBytes > 0 && $size > $maxBytes) {
                $fail(413, $isPdf ? "PDF too large for thumbnail." : "Video too large for thumbnail.");
            }

            $metaRoot = class_exists('SourceContext')
                ? SourceContext::metaRoot()
                : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
            $thumbDir = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'thumb_cache' . DIRECTORY_SEPARATOR;
            if (!is_dir($thumbDir) && !@mkdir($thumbDir, 0775, true) && !is_dir($thumbDir)) {
                $fail(500, "Thumbnail cache unavailable.");
            }

            $stat = @stat($realFilePath) ?: [];
            $mtime = (int)($stat['mtime'] ?? 0);
            $fsize = (int)($stat['size'] ?? 0);
            $maxW = 320;
            $maxH = 180;
            $envW = getenv('FR_VIDEO_THUMB_MAX_W');
            if ($envW !== false && $envW !== '') {
                $maxW = (int)$envW;
            }
            $envH = getenv('FR_VIDEO_THUMB_MAX_H');
            if ($envH !== false && $envH !== '') {
                $maxH = (int)$envH;
            }
            if ($isPdf) {
                $envPdfW = getenv('FR_PDF_THUMB_MAX_W');
                if ($envPdfW !== false && $envPdfW !== '') {
                    $maxW = (int)$envPdfW;
                }
                $envPdfH = getenv('FR_PDF_THUMB_MAX_H');
                if ($envPdfH !== false && $envPdfH !== '') {
                    $maxH = (int)$envPdfH;
                }
            }
            $maxW = max(64, min(2048, $maxW));
            $maxH = max(64, min(2048, $maxH));
            $hash = hash('sha256', $realFilePath . '|' . $mtime . '|' . $fsize . '|' . $maxW . 'x' . $maxH . '|' . ($isPdf ? 'pdf' : 'video'));
            $thumbPath = $thumbDir . ($isPdf ? 'pthumb_' : 'vthumb_') . $hash . '.jpg';

            if (!is_file($thumbPath) || @filesize($thumbPath) === 0) {
                if (!WorkerLauncher::canRunForeground()) {
                    // exec unavailable - return 204 No Content so the browser
                    // silently skips the thumbnail without showing an error.
                    http_response_code(204);
                    return;
                }

                @session_write_close();

                $suffix = '';
                try {
                    $suffix = bin2hex(random_bytes(4));
                } catch (\Throwable $e) {
                    $suffix = str_replace('.', '', uniqid('t', true));
                }
                $tmp = $thumbPath . '.' . $suffix . '.tmp.jpg';
                $ok = false;

                if ($isPdf) {
                    $pdfThumbBinary = trim((string)getenv('FR_PDF_THUMB_BINARY'));
                    if ($pdfThumbBinary === '') {
                        $pdfThumbBinary = 'pdftoppm';
                    }
                    if (strpos($pdfThumbBinary, '/') === false) {
                        foreach (['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm', '/bin/pdftoppm'] as $cand) {
                            if (is_file($cand) && is_executable($cand)) {
                                $pdfThumbBinary = $cand;
                                break;
                            }
                        }
                    }
                    if (strpos($pdfThumbBinary, '/') === false) {
                        $which = [];
                        $rc = 1;
                        @exec('command -v ' . escapeshellarg($pdfThumbBinary) . ' 2>/dev/null', $which, $rc);
                        if ($rc === 0 && !empty($which[0])) {
                            $pdfThumbBinary = trim($which[0]);
                        }
                    }
                    if (strpos($pdfThumbBinary, '/') !== false && (!is_file($pdfThumbBinary) || !is_executable($pdfThumbBinary))) {
                        $fail(501, "Thumbnail generator unavailable.");
                    }

                    $tmpPrefix = preg_replace('/\.jpg$/', '', $tmp);
                    $cmd = sprintf(
                        '%s -jpeg -f 1 -singlefile -scale-to %d %s %s',
                        escapeshellarg($pdfThumbBinary),
                        max($maxW, $maxH),
                        escapeshellarg($realFilePath),
                        escapeshellarg((string)$tmpPrefix)
                    );
                    @exec($cmd . ' 2>&1', $out, $code);
                    $ok = $code === 0 && is_file($tmp) && @filesize($tmp) > 0;
                } else {
                    $ffmpeg = trim((string)getenv('FR_FFMPEG_PATH'));
                    if ($ffmpeg === '') {
                        try {
                            $cfg = AdminModel::getConfig();
                            if (is_array($cfg) && empty($cfg['error'])) {
                                $ffmpeg = trim((string)($cfg['ffmpegPath'] ?? ''));
                            }
                        } catch (\Throwable $e) {
                            // best-effort only
                        }
                    }
                    if ($ffmpeg === '') {
                        $ffmpeg = 'ffmpeg';
                    }
                    if ($ffmpeg === '') {
                        $fail(501, "Thumbnail generator unavailable.");
                    }
                    if (strpos($ffmpeg, '/') === false) {
                        foreach (['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/bin/ffmpeg'] as $cand) {
                            if (is_file($cand) && is_executable($cand)) {
                                $ffmpeg = $cand;
                                break;
                            }
                        }
                    }
                    if (strpos($ffmpeg, '/') === false) {
                        $which = [];
                        $rc = 1;
                        @exec('command -v ' . escapeshellarg($ffmpeg) . ' 2>/dev/null', $which, $rc);
                        if ($rc === 0 && !empty($which[0])) {
                            $ffmpeg = trim($which[0]);
                        }
                    }
                    if (strpos($ffmpeg, '/') !== false && (!is_file($ffmpeg) || !is_executable($ffmpeg))) {
                        $fail(501, "Thumbnail generator unavailable.");
                    }

                    $scale = "scale={$maxW}:{$maxH}:force_original_aspect_ratio=decrease";
                    $run = function (string $seek) use ($ffmpeg, $realFilePath, $tmp, $scale): bool {
                        $cmd = sprintf(
                            '%s -hide_banner -loglevel error -y -ss %s -i %s -frames:v 1 -vf %s -an -q:v 4 %s',
                            escapeshellarg($ffmpeg),
                            escapeshellarg($seek),
                            escapeshellarg($realFilePath),
                            escapeshellarg($scale),
                            escapeshellarg($tmp)
                        );
                        @exec($cmd . ' 2>&1', $out, $code);
                        return $code === 0 && is_file($tmp) && @filesize($tmp) > 0;
                    };

                    $ok = $run('00:00:01');
                    if (!$ok) {
                        $ok = $run('00:00:00');
                    }
                }

                if ($ok) {
                    @rename($tmp, $thumbPath);
                }
                if (is_file($tmp)) {
                    @unlink($tmp);
                }
            }

            if (!is_file($thumbPath) || @filesize($thumbPath) === 0) {
                $fail(404, "Thumbnail unavailable.");
            }

            $thumbSize = @filesize($thumbPath);
            header('Content-Type: image/jpeg');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: private, max-age=86400');
            if ($thumbSize) {
                header('Content-Length: ' . $thumbSize);
            }

            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
                http_response_code(200);
                exit;
            }

            http_response_code(200);
            $out = fopen($thumbPath, 'rb');
            if ($out) {
                fpassthru($out);
                @fclose($out);
            }
            exit;
        };

        if ($sourceId !== '') {
            $this->withSourceContext($sourceId, $runner, $allowDisabled);
            return;
        }

        $runner();
        return;
    }

    public function zipStatus()
    {
        if (!$this->requireAuth()) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Unauthorized"]);
            return;
        }
        $username = $_SESSION['username'] ?? '';
        $token = isset($_GET['k']) ? preg_replace('/[^a-f0-9]/', '', (string)$_GET['k']) : '';
        if ($token === '' || strlen($token) < 8) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Bad token"]);
            return;
        }

        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $tokFile = rtrim($metaRoot, '/\\') . '/ziptmp/.tokens/' . $token . '.json';
        if (!is_file($tokFile)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Not found"]);
            return;
        }
        $job = json_decode((string)@file_get_contents($tokFile), true) ?: [];
        if (($job['user'] ?? '') !== $username) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Forbidden"]);
            return;
        }

        $ready = (($job['status'] ?? '') === 'done') && !empty($job['zipPath']) && is_file($job['zipPath']);

        $out = [
            'status'      => $job['status']      ?? 'unknown',
            'error'       => $job['error']       ?? null,
            'ready'       => $ready,
            // progress (if present)
            'pct'         => $job['pct']         ?? null,
            'filesDone'   => $job['filesDone']   ?? null,
            'filesTotal'  => $job['filesTotal']  ?? null,
            'bytesDone'   => $job['bytesDone']   ?? null,
            'bytesTotal'  => $job['bytesTotal']  ?? null,
            'current'     => $job['current']     ?? null,
            'phase'       => $job['phase']       ?? null,
            // timing (always include for UI)
            'startedAt'   => $job['startedAt']   ?? null,
            'finalizeAt'  => $job['finalizeAt']  ?? null,
        ];

        if (($job['status'] ?? '') === 'queued') {
            $queuedAt = (int)($job['ctime'] ?? 0);
            if ($queuedAt > 0 && empty($job['startedAt'])) {
                $age = time() - $queuedAt;
                if ($age > 20) {
                    $out['status'] = 'error';
                    $out['error'] = 'Archive worker did not start. Check server PHP CLI and permissions.';
                    $out['ready'] = false;
                }
            }
        }

        if ($ready) {
            $out['size']        = @filesize($job['zipPath']) ?: null;
            $out['downloadUrl'] = '/api/file/downloadZipFile.php?k=' . urlencode($token);
        }

        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
        echo json_encode($out);
    }

    public function downloadZipFile()
    {
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo "Unauthorized";
            return;
        }
        $username = $_SESSION['username'] ?? '';
        $token = isset($_GET['k']) ? preg_replace('/[^a-f0-9]/', '', (string)$_GET['k']) : '';
        if ($token === '' || strlen($token) < 8) {
            http_response_code(400);
            echo "Bad token";
            return;
        }

        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $tokFile = rtrim($metaRoot, '/\\') . '/ziptmp/.tokens/' . $token . '.json';
        if (!is_file($tokFile)) {
            http_response_code(404);
            echo "Not found";
            return;
        }
        $job = json_decode((string)@file_get_contents($tokFile), true) ?: [];
        @unlink($tokFile); // one-shot token

        if (($job['user'] ?? '') !== $username) {
            http_response_code(403);
            echo "Forbidden";
            return;
        }
        $zip = (string)($job['zipPath'] ?? '');
        $zipReal = realpath($zip);
        $root = realpath(rtrim($metaRoot, '/\\') . '/ziptmp');
        if (!$zipReal || !$root || strpos($zipReal, $root) !== 0 || !is_file($zipReal)) {
            http_response_code(404);
            echo "Not found";
            return;
        }

        AuditHook::log('file.download_zip', [
            'user'   => $username,
            'folder' => (string)($job['folder'] ?? 'root'),
            'meta'   => [
                'files' => is_array($job['files'] ?? null) ? count($job['files']) : null,
            ],
        ]);

        @session_write_close();
        @set_time_limit(0);
        @ignore_user_abort(true);
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
        }
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', 'off');
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        $format = strtolower((string)($job['format'] ?? 'zip'));
        if (!in_array($format, ['zip', '7z'], true)) {
            @unlink($zipReal);
            http_response_code(400);
            echo "Unsupported archive format.";
            return;
        }
        $ext = ($format === '7z') ? '7z' : 'zip';
        $mimeMap = [
            'zip' => 'application/zip',
            '7z'  => 'application/x-7z-compressed',
        ];
        $mimeType = $mimeMap[$format] ?? 'application/octet-stream';

        @clearstatcache(true, $zipReal);
        $name = isset($_GET['name']) ? preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$_GET['name']) : 'files.' . $ext;
        if ($name === '' || str_ends_with($name, '.')) {
            $name = 'files';
        }
        $lower = strtolower($name);
        foreach (['.zip', '.7z'] as $suffix) {
            if (str_ends_with($lower, $suffix)) {
                $name = substr($name, 0, -strlen($suffix));
                break;
            }
        }
        $name = rtrim($name, '.');
        if ($name === '') {
            $name = 'files';
        }
        $name .= '.' . $ext;
        $size = (int)@filesize($zipReal);

        header('X-Accel-Buffering: no');
        header('X-Content-Type-Options: nosniff');
        header('Content-Type: ' . $mimeType);
        header('Content-Disposition: attachment; filename="' . $name . '"');
        if ($size > 0) {
            header('Content-Length: ' . $size);
        }
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');

        readfile($zipReal);
        @unlink($zipReal);
    }

    public function downloadZip()
    {
        try {
            if (!$this->checkCsrf()) {
                $this->jsonOut(["error" => "Bad CSRF"], 400);
                return;
            }
            if (!$this->requireAuth()) {
                $this->jsonOut(["error" => "Unauthorized"], 401);
                return;
            }

            $data = $this->readJsonBody();
            if (!is_array($data) || !isset($data['folder'], $data['files']) || !is_array($data['files'])) {
                $this->jsonOut(["error" => "Invalid input."], 400);
                return;
            }

            $folder = $this->normalizeFolder($data['folder']);
            $files  = $data['files'];
            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }

            $username = $_SESSION['username'] ?? '';
            $perms    = $this->loadPerms($username);

            $sourceId = '';
            $allowDisabled = false;
            if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $rawSourceId = trim((string)($data['sourceId'] ?? ''));
                if ($rawSourceId !== '') {
                    $sourceId = $this->normalizeSourceId($rawSourceId);
                    if ($sourceId === '') {
                        $this->jsonOut(["error" => "Invalid source id."], 400);
                        return;
                    }
                    $info = SourceContext::getSourceById($sourceId);
                    if (!$info) {
                        $this->jsonOut(["error" => "Invalid source."], 400);
                        return;
                    }
                    $allowDisabled = $this->isAdmin($perms);
                    if (!$allowDisabled && empty($info['enabled'])) {
                        $this->jsonOut(["error" => "Source is disabled."], 403);
                        return;
                    }
                }
            }

            $runner = function () use ($data, $folder, $files, $username, $perms) {
                $storage = StorageRegistry::getAdapter();
                if (!$storage->isLocal()) {
                    $this->jsonOut(["error" => "Archive operations are not supported for remote storage."], 400);
                    return;
                }

                $format = strtolower(trim((string)($data['format'] ?? 'zip')));
                if ($format === '') {
                    $format = 'zip';
                }
                $allowedFormats = ['zip', '7z'];
                if (!in_array($format, $allowedFormats, true)) {
                    $msg = "Invalid archive format.";
                    $this->jsonOut(["error" => $msg], 400);
                    return;
                }

                $findBin = function (array $candidates): ?string {
                    foreach ($candidates as $bin) {
                        if ($bin === '') {
                            continue;
                        }
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

                if ($format === '7z') {
                    $bin = $findBin(['7zz', '/usr/bin/7zz', '/usr/local/bin/7zz', '/bin/7zz', '7z', '/usr/bin/7z', '/usr/local/bin/7z', '/bin/7z']);
                    if (!$bin) {
                        $this->jsonOut(["error" => "7z is not available on the server; cannot create 7z archives."], 400);
                        return;
                    }
                }

                $activeSourceId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';

            // Optional zip gate by account flag
                if (!$this->isAdmin($perms) && !empty($perms['disableZip'])) {
                    $this->jsonOut(["error" => "Archive downloads are not allowed for your account."], 403);
                    return;
                }

                $ignoreOwnership = $this->isAdmin($perms)
                || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

            // Ancestor-owner counts as full view
                $fullView = $ignoreOwnership
                || ACL::canRead($username, $perms, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $perms);
                $ownOnly  = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

                if (!$fullView && !$ownOnly) {
                    $this->jsonOut(["error" => "Forbidden: no view access to this folder."], 403);
                    return;
                }

            // If own-only, ensure all files are owned by the user
                if ($ownOnly) {
                    $meta = $this->loadFolderMetadata($folder);
                    foreach ($files as $f) {
                        $bn = basename((string)$f);
                        if (!isset($meta[$bn]['uploader']) || strcasecmp((string)$meta[$bn]['uploader'], $username) !== 0) {
                            $this->jsonOut(["error" => "Forbidden: you are not the owner of '{$bn}'."], 403);
                            return;
                        }
                    }
                }

                $metaRoot = class_exists('SourceContext')
                ? SourceContext::metaRoot()
                : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
                $root   = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'ziptmp';
                $tokDir = $root . DIRECTORY_SEPARATOR . '.tokens';
                $logDir = $root . DIRECTORY_SEPARATOR . '.logs';
                if (!is_dir($tokDir)) {
                    @mkdir($tokDir, 0700, true);
                }
                if (!is_dir($logDir)) {
                    @mkdir($logDir, 0700, true);
                }
                @chmod($tokDir, 0700);
                @chmod($logDir, 0700);
                if (!is_dir($tokDir) || !is_writable($tokDir)) {
                    $this->jsonOut(["error" => "Archive token dir not writable."], 500);
                    return;
                }

            // Light janitor: purge old tokens/logs > 6h (best-effort)
                $now = time();
                foreach ((glob($tokDir . DIRECTORY_SEPARATOR . '*.json') ?: []) as $tf) {
                    if (is_file($tf) && ($now - (int)@filemtime($tf)) > 21600) {
                        @unlink($tf);
                    }
                }
                foreach ((glob($logDir . DIRECTORY_SEPARATOR . 'WORKER-*.log') ?: []) as $lf) {
                    if (is_file($lf) && ($now - (int)@filemtime($lf)) > 21600) {
                        @unlink($lf);
                    }
                }

            // Per-user and global caps (simple anti-DoS)
                $perUserCap = 2;    // tweak if desired
                $globalCap  = 8;    // tweak if desired

                $tokens = glob($tokDir . DIRECTORY_SEPARATOR . '*.json') ?: [];
                $mine   = 0;
                $all = 0;
                foreach ($tokens as $tf) {
                    $job = json_decode((string)@file_get_contents($tf), true) ?: [];
                    $st  = $job['status'] ?? 'unknown';
                    $pid = (int)($job['spawn']['pid'] ?? 0);
                    $tokenKey = pathinfo($tf, PATHINFO_FILENAME);
                    $pidAlive = false;
                    $pidCmdChecked = false;
                    $pidLooksLikeWorker = false;
                    if ($pid > 0) {
                        if (is_dir('/proc/' . $pid)) {
                            $pidAlive = true;
                            $cmdline = @file_get_contents('/proc/' . $pid . '/cmdline');
                            if (is_string($cmdline) && $cmdline !== '') {
                                $pidCmdChecked = true;
                                $cmdline = str_replace("\0", ' ', $cmdline);
                                if (str_contains($cmdline, 'zip_worker.php') && ($tokenKey === '' || str_contains($cmdline, $tokenKey))) {
                                    $pidLooksLikeWorker = true;
                                }
                            }
                        } elseif (function_exists('posix_kill')) {
                            $pidAlive = @posix_kill($pid, 0);
                        }
                    }
                    $queuedAt = (int)($job['ctime'] ?? 0);
                    $startedAt = (int)($job['startedAt'] ?? 0);
                    $queuedAge = ($queuedAt > 0) ? ($now - $queuedAt) : 0;

                    $staleQueued = ($st === 'queued' && $startedAt <= 0 && $queuedAge > 120);
                    $staleWorkingNoPid = (in_array($st, ['working', 'finalizing'], true) && $pid <= 0 && $queuedAge > 120);
                    $staleRunning = (in_array($st, ['working', 'finalizing'], true) && $pid > 0 && !$pidAlive);
                    $stalePidMismatch = (in_array($st, ['working', 'finalizing'], true) && $pid > 0 && $pidAlive && $pidCmdChecked && !$pidLooksLikeWorker && $queuedAge > 120);
                    if ($staleQueued || $staleWorkingNoPid || $staleRunning || $stalePidMismatch) {
                        @unlink($tf);
                        continue;
                    }

                    if ($st === 'queued' || $st === 'working' || $st === 'finalizing') {
                        $all++;
                        if (($job['user'] ?? '') === $username) {
                            $mine++;
                        }
                    }
                }
                if ($mine >= $perUserCap) {
                    $this->jsonOut(["error" => "You already have archive jobs running. Try again shortly."], 429);
                    return;
                }
                if ($all  >= $globalCap) {
                    $this->jsonOut(["error" => "Archive queue is busy. Try again shortly."], 429);
                    return;
                }

            // Create job token
                $token   = bin2hex(random_bytes(16));
                $tokFile = $tokDir . DIRECTORY_SEPARATOR . $token . '.json';
                $job = [
                'user'       => $username,
                'folder'     => $folder,
                'files'      => array_values($files),
                'sourceId'   => $activeSourceId,
                'format'     => $format,
                'status'     => 'queued',
                'ctime'      => time(),
                'startedAt'  => null,
                'finalizeAt' => null,
                'zipPath'    => null,
                'error'      => null
                ];
                if (file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX) === false) {
                    $this->jsonOut(["error" => "Failed to create archive job."], 500);
                    return;
                }

            // If no exec is available, fall back to synchronous ZipArchive for zip format.
            // 7z requires exec and cannot be supported in this environment.
                if (!WorkerLauncher::canSpawnBackground() && !WorkerLauncher::canRunForeground()) {
                    if ($format !== 'zip') {
                        $job['status'] = 'error';
                        $job['error']  = 'Archive format not supported: exec() is unavailable on this host.';
                        @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);
                        $this->jsonOut(["error" => "Archive format '$format' is not supported on this host (exec disabled). Use ZIP instead."], 501);
                        return;
                    }

                    // ZIP: run synchronously via ZipArchive (pure PHP, no exec needed)
                    $zipResult = FileModel::createZipArchive($folder, $files);
                    if (isset($zipResult['error'])) {
                        $job['status'] = 'error';
                        $job['error']  = $zipResult['error'];
                        @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);
                        $this->jsonOut(["error" => $zipResult['error']], 500);
                        return;
                    }

                    $job['status']  = 'done';
                    $job['zipPath'] = $zipResult['zipPath'];
                    @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);
                    $this->jsonOut([
                        'ok'          => true,
                        'token'       => $token,
                        'status'      => 'done',
                        'statusUrl'   => '/api/file/zipStatus.php?k=' . urlencode($token),
                        'downloadUrl' => '/api/file/downloadZipFile.php?k=' . urlencode($token),
                    ]);
                    return;
                }

                if (WorkerLauncher::prefersSync() && WorkerLauncher::allowsForegroundFallback()) {
                    $run = $this->runZipWorkerForeground($token, $tokFile, $logDir, $activeSourceId);
                    if (empty($run['ok'])) {
                        $job['status'] = 'error';
                        $job['error']  = 'Foreground zip failed: ' . (string)($run['error'] ?? 'Unknown error');
                        @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);
                        $this->jsonOut(["error" => "Failed to build archive: " . (string)($run['error'] ?? 'Unknown error')], 500);
                        return;
                    }
                } else {
                    $spawn = $this->spawnZipWorker($token, $tokFile, $logDir, $activeSourceId);
                    if (!$spawn['ok']) {
                        if (WorkerLauncher::allowsForegroundFallback()) {
                            $run = $this->runZipWorkerForeground($token, $tokFile, $logDir, $activeSourceId);
                            if (!empty($run['ok'])) {
                                $this->jsonOut([
                                    'ok'          => true,
                                    'token'       => $token,
                                    'status'      => 'done',
                                    'statusUrl'   => '/api/file/zipStatus.php?k=' . urlencode($token),
                                    'downloadUrl' => '/api/file/downloadZipFile.php?k=' . urlencode($token)
                                ]);
                                return;
                            }
                        }

                        $job['status'] = 'error';
                        $job['error']  = 'Spawn failed: ' . $spawn['error'];
                        @file_put_contents($tokFile, json_encode($job, JSON_PRETTY_PRINT), LOCK_EX);
                        $this->jsonOut(["error" => "Failed to enqueue archive: " . $spawn['error']], 500);
                        return;
                    }
                }

                $this->jsonOut([
                'ok'          => true,
                'token'       => $token,
                'status'      => WorkerLauncher::prefersSync() ? 'done' : 'queued',
                'statusUrl'   => '/api/file/zipStatus.php?k=' . urlencode($token),
                'downloadUrl' => '/api/file/downloadZipFile.php?k=' . urlencode($token)
                ]);
            };

            if ($sourceId !== '') {
                $this->withSourceContext($sourceId, $runner, $allowDisabled);
                return;
            }

            $runner();
            return;
        } catch (Throwable $e) {
            error_log('FileController::downloadZip enqueue error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal error while queuing archive.'], 500);
        }
    }

    public function extractZip()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $storage = StorageRegistry::getAdapter();
            if (!$storage->isLocal()) {
                $this->jsonOut(["error" => "Archive operations are not supported for remote storage."], 400);
                return;
            }

            $data = $this->readJsonBody();
            if (!is_array($data) || !isset($data['folder'], $data['files']) || !is_array($data['files'])) {
                $this->jsonOut(["error" => "Invalid input."], 400);
                return;
            }

            $folder = $this->normalizeFolder($data['folder']);
            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }

            $username = $_SESSION['username'] ?? '';
            $perms    = $this->loadPerms($username);

            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            // must be able to write into target folder (or be ancestor-owner)
            if (!(ACL::canExtract($username, $perms, $folder) || $this->ownsFolderOrAncestor($folder, $username, $perms))) {
                $this->jsonOut(["error" => "Forbidden: no full write access to destination"], 403);
                return;
            }

            // Folder scope: write
            $dv = $this->enforceFolderScope($folder, $username, $perms, 'extract');
            if ($dv) {
                $this->jsonOut(["error" => $dv], 403);
                return;
            }

            $result = FileModel::extractZipArchive($folder, $data['files']);
            if (isset($result['success'])) {
                AuditHook::log('file.extract_zip', [
                    'user'   => $username,
                    'folder' => $folder,
                    'meta'   => [
                        'files' => is_array($data['files']) ? count($data['files']) : null,
                    ],
                ]);
            }
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::extractZip error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while extracting ZIP.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function snippet(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        $storage = StorageRegistry::getAdapter();

        // Session -> snapshot user + perms -> release lock
        if (session_status() !== PHP_SESSION_ACTIVE) {
            @session_start();
        }

        $user  = (string)($_SESSION['username'] ?? '');
        $perms = loadUserPermissions($user) ?: [];
        $perms['role'] = $_SESSION['role'] ?? ($perms['role'] ?? null);
        $perms['admin'] = $_SESSION['admin'] ?? ($perms['admin'] ?? null);
        $perms['isAdmin'] = $_SESSION['isAdmin'] ?? ($perms['isAdmin'] ?? null);

        @session_write_close();

        // ---- Input ----
        $folder = isset($_GET['folder']) ? (string)$_GET['folder'] : 'root';
        $folder = str_replace('\\', '/', trim($folder));
        $folder = ($folder === '' || $folder === 'root') ? 'root' : trim($folder, '/');

        $file = isset($_GET['file']) ? (string)$_GET['file'] : '';
        $file = trim($file);

        if ($file === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing file parameter.']);
            return;
        }

        // ---- ACL ----
        if (class_exists('ACL')) {
            $folderNorm = ACL::normalizeFolder($folder);
            $accessErr = $this->enforceSingleFileReadAccess($folderNorm, $file, $user, $perms);
            if ($accessErr !== null) {
                http_response_code(403);
                echo json_encode(['error' => $accessErr]);
                return;
            }
            $folder = $folderNorm;
        }

        // ---- Resolve file via model ----
        try {
            $info = FileModel::getDownloadInfo($folder, $file);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Internal error.']);
            return;
        }

        if (!is_array($info) || !empty($info['error'] ?? null)) {
            http_response_code(404);
            echo json_encode([
                'error' => isset($info['error']) ? (string)$info['error'] : 'File not found.',
            ]);
            return;
        }

        $fullPath = $info['filePath'] ?? null;
        if (!$storage->isLocal()) {
            if (!$fullPath || !$storage->stat($fullPath)) {
                http_response_code(404);
                echo json_encode(['error' => 'File not found or not readable.']);
                return;
            }

            $maxChars  = 1200;
            $truncated = false;
            $snippet   = '';

            $ext = strtolower(pathinfo((string)$fullPath, PATHINFO_EXTENSION));
            $textExts = [
                'txt',
                'text',
                'md',
                'markdown',
                'log',
                'csv',
                'tsv',
                'tab',
                'json',
                'yml',
                'yaml',
                'xml',
                'ini',
                'cfg',
                'conf',
                'config',
                'html',
                'htm',
                'css',
                'js',
                'ts',
                'php',
            ];

            if (in_array($ext, $textExts, true)) {
                $raw = $storage->read((string)$fullPath, 64 * 1024, 0);
                if ($raw !== false) {
                    $text = $this->normalizeSnippetText($raw);
                    $snippet = $this->mbSubstrSafe($text, $maxChars, $truncated);
                }
            }

            echo json_encode([
                'snippet'   => trim($snippet),
                'truncated' => $truncated,
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        if (!$fullPath || !is_file($fullPath) || !is_readable($fullPath)) {
            http_response_code(404);
            echo json_encode(['error' => 'File not found or not readable.']);
            return;
        }

        // ---- Limits & supported formats ----
        $maxChars      = 1200;              // backend cap
        $maxOfficeSize = defined('OFFICE_SNIPPET_MAX_BYTES')
            ? (int)OFFICE_SNIPPET_MAX_BYTES
            : 5 * 1024 * 1024;
        $truncated     = false;

        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));

        $textExts = [
            'txt',
            'text',
            'md',
            'markdown',
            'log',
            'csv',
            'tsv',
            'tab',
            'json',
            'yml',
            'yaml',
            'xml',
            'ini',
            'cfg',
            'conf',
            'config',
            'html',
            'htm',
            'css',
            'js',
            'ts',
            'php',
        ];

        $officeDocExts = ['doc', 'docx', 'docm', 'dotx'];
        $officeXlsExts = ['xls', 'xlsx', 'xlsm', 'xltx'];
        $officePptExts = ['ppt', 'pptx', 'pptm', 'potx'];

        $snippet = '';

        if (in_array($ext, $textExts, true)) {
            $snippet = $this->extractTextFileSnippet($fullPath, $maxChars, $truncated);
        } elseif (in_array($ext, $officeDocExts, true)) {
            if ($this->filesizeSafe($fullPath) <= $maxOfficeSize) {
                $snippet = $this->extractDocxSnippet($fullPath, $maxChars, $truncated);
            }
        } elseif (in_array($ext, $officeXlsExts, true)) {
            if ($this->filesizeSafe($fullPath) <= $maxOfficeSize) {
                $snippet = $this->extractXlsxSnippet($fullPath, $maxChars, $truncated);
            }
        } elseif (in_array($ext, $officePptExts, true)) {
            if ($this->filesizeSafe($fullPath) <= $maxOfficeSize) {
                $snippet = $this->extractPptxSnippet($fullPath, $maxChars, $truncated);
            }
        }

        if (!is_string($snippet)) {
            $snippet = '';
        }
        $snippet = trim($snippet);

        echo json_encode([
            'snippet'   => $snippet,
            'truncated' => $truncated,
        ], JSON_UNESCAPED_UNICODE);
    }

    public function shareFile()
    {
        $token        = trim((string)($_GET['token'] ?? ''));
        $providedPass = (string)($_GET['pass'] ?? '');
        $view         = ((string)($_GET['view'] ?? '') === '1');
        $inlineRequested = ((string)($_GET['inline'] ?? '') === '1');

        // adjust if your token format differs
        if ($token === '' || !preg_match('/^[a-f0-9]{32}$/i', $token)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Missing or invalid token."]);
            exit;
        }

        $record = FileModel::getShareRecord($token);
        if (!$record) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "Share link not found."]);
            exit;
        }

        if (time() > $record['expires']) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "This link has expired."]);
            exit;
        }

        $renderPasswordForm = function (string $errorMsg = '') use ($token, $view): void {
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header("Content-Security-Policy: frame-ancestors 'none'");
            header("Content-Type: text/html; charset=utf-8");
            ?>
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Enter Password</title>
                <link rel="stylesheet" href="<?php echo htmlspecialchars(fr_with_base_path('/css/vendor/roboto.css?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>">
                <link rel="stylesheet" href="<?php echo htmlspecialchars(fr_with_base_path('/css/share.css?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>">
            </head>
            <body class="fr-share-body">
                <div class="fr-share-shell">
                    <div class="fr-share-card">
                        <div class="fr-share-card-header">
                            <img id="shareLogo" class="fr-share-logo" src="<?php echo htmlspecialchars(fr_with_base_path('/assets/logo.svg?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>" alt="FileRise">
                            <div>
                                <div class="fr-share-title">This file is protected</div>
                                <div class="fr-share-subtitle">Enter the password to continue.</div>
                            </div>
                        </div>
                        <?php if ($errorMsg !== '') : ?>
                            <div class="fr-share-alert fr-share-alert-error"><?php echo htmlspecialchars($errorMsg, ENT_QUOTES, 'UTF-8'); ?></div>
                        <?php endif; ?>
                        <form class="fr-share-form" method="get" action="<?php echo htmlspecialchars(fr_with_base_path('/api/file/share.php'), ENT_QUOTES, 'UTF-8'); ?>">
                            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
                            <?php if ($view) :
                                ?><input type="hidden" name="view" value="1"><?php
                            endif; ?>
                            <label for="pass" class="fr-share-label">Password</label>
                            <input type="password" name="pass" id="pass" class="fr-share-input" required>
                            <button type="submit" class="fr-share-btn">Unlock</button>
                        </form>
                    </div>
                </div>
                <script src="<?php echo htmlspecialchars(fr_with_base_path('/js/shareBranding.js?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>" defer></script>
            </body>
            </html>
            <?php
            exit;
        };

        if (!empty($record['password']) && empty($providedPass)) {
            $renderPasswordForm('');
        }

        if (!empty($record['password'])) {
            if (!password_verify($providedPass, $record['password'])) {
                if ($view) {
                    $renderPasswordForm('Invalid password.');
                }
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => "Invalid password."]);
                exit;
            }
        }

        $folder = trim($record['folder'], "/\\ ");
        $file   = $record['file'];

        // Encrypted folders/files: sharing is blocked (v1).
        try {
            $fKey = ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder;
            if (FolderCrypto::isEncryptedOrAncestor($fKey)) {
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => "Sharing is disabled inside encrypted folders."]);
                exit;
            }
        } catch (\Throwable $e) {
/* ignore */
        }

        $storage = StorageRegistry::getAdapter();
        $folderKey = ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder;

        if ($view) {
            $info = FileModel::getDownloadInfo($folderKey, $file);
            if (!is_array($info) || !empty($info['error'] ?? null)) {
                http_response_code(404);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => "File not found."]);
                exit;
            }

            $realFilePath = (string)($info['filePath'] ?? '');
            $mimeType = (string)($info['mimeType'] ?? 'application/octet-stream');
            $downloadName = (string)($info['downloadName'] ?? basename($realFilePath));
            if ($downloadName === '') {
                $downloadName = $file;
            }
            $ext = strtolower(pathinfo($downloadName, PATHINFO_EXTENSION));

            $sizeBytes = null;
            $modifiedTs = null;
            if ($storage->isLocal()) {
                $sizeBytes = @filesize($realFilePath);
                $modifiedTs = @filemtime($realFilePath);
            } else {
                $stat = $storage->stat($realFilePath);
                if (is_array($stat)) {
                    if (array_key_exists('size', $stat)) {
                        $sizeBytes = (int)$stat['size'];
                    }
                    $rawMtime = $stat['mtime'] ?? $stat['modified'] ?? $stat['lastModified'] ?? null;
                    if (is_numeric($rawMtime)) {
                        $modifiedTs = (int)$rawMtime;
                    } elseif (is_string($rawMtime) && $rawMtime !== '') {
                        $ts = strtotime($rawMtime);
                        if ($ts !== false) {
                            $modifiedTs = $ts;
                        }
                    }
                }
            }

            $formatBytes = function (?int $bytes): string {
                if ($bytes === null || $bytes < 0) {
                    return '-';
                }
                if ($bytes < 1024) {
                    return $bytes . " B";
                }
                if ($bytes < 1048576) {
                    return round($bytes / 1024, 2) . " KB";
                }
                if ($bytes < 1073741824) {
                    return round($bytes / 1048576, 2) . " MB";
                }
                return round($bytes / 1073741824, 2) . " GB";
            };

            $sizeLabel = $formatBytes(is_int($sizeBytes) ? $sizeBytes : null);
            $modifiedLabel = $modifiedTs ? date('M j, Y H:i', $modifiedTs) : '-';
            $typeLabel = $ext !== '' ? strtoupper($ext) : 'FILE';

            $imgExt = ['jpg','jpeg','png','gif','bmp','webp','ico'];
            $vidExt = ['mp4','mkv','webm','mov','ogv'];
            $audExt = ['mp3','wav','m4a','ogg','flac','aac','wma','opus'];
            $pdfExt = ['pdf'];
            $previewType = '';
            $lowerMime = strtolower($mimeType);
            if (in_array($ext, $imgExt, true) || (str_starts_with($lowerMime, 'image/') && $lowerMime !== 'image/svg+xml')) {
                $previewType = 'image';
            } elseif (in_array($ext, $vidExt, true) || str_starts_with($lowerMime, 'video/')) {
                $previewType = 'video';
            } elseif (in_array($ext, $audExt, true) || str_starts_with($lowerMime, 'audio/')) {
                $previewType = 'audio';
            } elseif (in_array($ext, $pdfExt, true) || $lowerMime === 'application/pdf') {
                $previewType = 'pdf';
            }
            if ($ext === 'svg' || $ext === 'svgz') {
                $previewType = '';
            }

            $passParam = $providedPass !== '' ? ('&pass=' . urlencode($providedPass)) : '';
            $downloadUrl = fr_with_base_path('/api/file/share.php?token=' . urlencode($token) . $passParam);
            $previewUrl = $downloadUrl . '&inline=1';

            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header('X-Frame-Options: DENY');
            header("Content-Security-Policy: frame-ancestors 'none'");
            header("Content-Type: text/html; charset=utf-8");
            ?>
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Shared File: <?php echo htmlspecialchars($downloadName, ENT_QUOTES, 'UTF-8'); ?></title>
                <link rel="stylesheet" href="<?php echo htmlspecialchars(fr_with_base_path('/css/vendor/roboto.css?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>">
                <link rel="stylesheet" href="<?php echo htmlspecialchars(fr_with_base_path('/css/share.css?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>">
            </head>
            <body class="fr-share-body">
                <div class="fr-share-shell">
                    <div class="fr-share-card fr-share-card-wide">
                        <div class="fr-share-card-header">
                            <img id="shareLogo" class="fr-share-logo" src="<?php echo htmlspecialchars(fr_with_base_path('/assets/logo.svg?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>" alt="FileRise">
                            <div>
                                <div class="fr-share-kicker">Shared file</div>
                                <div class="fr-share-title"><?php echo htmlspecialchars($downloadName, ENT_QUOTES, 'UTF-8'); ?></div>
                            </div>
                            <div class="fr-share-actions">
                                <a class="fr-share-btn" href="<?php echo htmlspecialchars($downloadUrl, ENT_QUOTES, 'UTF-8'); ?>">Download</a>
                                <?php if ($previewType !== '') : ?>
                                    <a class="fr-share-btn fr-share-btn-ghost" href="<?php echo htmlspecialchars($previewUrl, ENT_QUOTES, 'UTF-8'); ?>" target="_blank" rel="noopener">Open</a>
                                <?php endif; ?>
                            </div>
                        </div>

                        <div class="fr-share-preview">
                            <?php if ($previewType === 'image') : ?>
                                <img src="<?php echo htmlspecialchars($previewUrl, ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($downloadName, ENT_QUOTES, 'UTF-8'); ?>">
                            <?php elseif ($previewType === 'video') : ?>
                                <video controls preload="metadata" src="<?php echo htmlspecialchars($previewUrl, ENT_QUOTES, 'UTF-8'); ?>"></video>
                            <?php elseif ($previewType === 'audio') : ?>
                                <audio controls preload="metadata" src="<?php echo htmlspecialchars($previewUrl, ENT_QUOTES, 'UTF-8'); ?>"></audio>
                            <?php elseif ($previewType === 'pdf') : ?>
                                <iframe src="<?php echo htmlspecialchars($previewUrl, ENT_QUOTES, 'UTF-8'); ?>" title="Preview"></iframe>
                            <?php else : ?>
                                <div class="fr-share-preview-empty">Preview not available for this file type.</div>
                            <?php endif; ?>
                        </div>

                        <div class="fr-share-meta">
                            <div class="fr-share-meta-item">
                                <div class="fr-share-meta-label">Size</div>
                                <div class="fr-share-meta-value"><?php echo htmlspecialchars($sizeLabel, ENT_QUOTES, 'UTF-8'); ?></div>
                            </div>
                            <div class="fr-share-meta-item">
                                <div class="fr-share-meta-label">Modified</div>
                                <div class="fr-share-meta-value"><?php echo htmlspecialchars($modifiedLabel, ENT_QUOTES, 'UTF-8'); ?></div>
                            </div>
                            <div class="fr-share-meta-item">
                                <div class="fr-share-meta-label">Type</div>
                                <div class="fr-share-meta-value"><?php echo htmlspecialchars($typeLabel, ENT_QUOTES, 'UTF-8'); ?></div>
                            </div>
                        </div>
                    </div>
                    <div id="shareFooter" class="fr-share-footer">
                        &copy; <?php echo date("Y"); ?> FileRise. All rights reserved.
                    </div>
                </div>
                <script src="<?php echo htmlspecialchars(fr_with_base_path('/js/shareBranding.js?v={{APP_QVER}}'), ENT_QUOTES, 'UTF-8'); ?>" defer></script>
            </body>
            </html>
            <?php
            exit;
        }

        if (!$storage->isLocal()) {
            $info = FileModel::getDownloadInfo($folderKey, $file);
            if (!is_array($info) || !empty($info['error'] ?? null)) {
                http_response_code(404);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => "File not found."]);
                exit;
            }

            $realFilePath = (string)$info['filePath'];
            $mimeType = (string)($info['mimeType'] ?? 'application/octet-stream');

            // Clear any buffered output so headers + binary stream are clean
            while (ob_get_level() > 0) {
                ob_end_clean();
            }

            header('X-Content-Type-Options: nosniff');
            header("Content-Security-Policy: sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");

            header_remove('Content-Type');
            header_remove('Content-Disposition');

            $downloadName = (string)($info['downloadName'] ?? basename($realFilePath));
            $downloadName = str_replace(["\r", "\n"], '', $downloadName);
            $downloadNameStar = rawurlencode($downloadName);
            $ext = strtolower(pathinfo($downloadName, PATHINFO_EXTENSION));

            $rasterMime = [
                'jpg'  => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png'  => 'image/png',
                'gif'  => 'image/gif',
                'bmp'  => 'image/bmp',
                'webp' => 'image/webp',
                'ico'  => 'image/x-icon',
            ];
            $inlineMime = [
                'mp4'  => 'video/mp4',
                'mkv'  => 'video/x-matroska',
                'webm' => 'video/webm',
                'mov'  => 'video/quicktime',
                'ogv'  => 'video/ogg',
                'mp3'  => 'audio/mpeg',
                'wav'  => 'audio/wav',
                'm4a'  => 'audio/mp4',
                'ogg'  => 'audio/ogg',
                'flac' => 'audio/flac',
                'aac'  => 'audio/aac',
                'wma'  => 'audio/x-ms-wma',
                'opus' => 'audio/opus',
                'pdf'  => 'application/pdf',
            ];

            $inline = false;
            if ($ext === 'svg' || $ext === 'svgz' || $mimeType === 'image/svg+xml') {
                $mimeType = 'application/octet-stream';
                $inline = false;
            } elseif (isset($rasterMime[$ext])) {
                $mimeType = $rasterMime[$ext];
                $inline = true;
            } elseif ($inlineRequested) {
                $lowerMime = strtolower($mimeType);
                $inlineOk = isset($inlineMime[$ext])
                    || str_starts_with($lowerMime, 'video/')
                    || str_starts_with($lowerMime, 'audio/')
                    || $lowerMime === 'application/pdf';
                if ($inlineOk) {
                    if (isset($inlineMime[$ext])) {
                        $mimeType = $inlineMime[$ext];
                    }
                    $inline = true;
                }
            }

            if ($inline) {
                header('Content-Type: ' . $mimeType);
                header("Content-Disposition: inline; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
            } else {
                header('Content-Type: ' . ($mimeType ?: 'application/octet-stream'));
                header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
            }

            header("Cache-Control: no-store, no-cache, must-revalidate");
            header("Pragma: no-cache");

            $stat = $storage->stat($realFilePath);
            $size = (int)($stat['size'] ?? 0);
            if ($size > 0) {
                header('Content-Length: ' . $size);
            }

            AuditHook::log('file.download', [
                'user'   => 'share:' . $token,
                'source' => 'share',
                'folder' => $folderKey,
                'path'   => ($folderKey === 'root') ? $file : ($folderKey . '/' . $file),
                'meta'   => [
                    'token' => $token,
                ],
            ]);

            $this->streamAdapterWithRange($storage, $realFilePath, $downloadName, $mimeType, $inline);
        }

        $uploadRoot = class_exists('SourceContext') ? SourceContext::uploadRoot() : (string)UPLOAD_DIR;
        $filePath = rtrim($uploadRoot, '/\\') . DIRECTORY_SEPARATOR;
        if (!empty($folder) && strtolower($folder) !== 'root') {
            $filePath .= $folder . DIRECTORY_SEPARATOR;
        }
        $filePath .= $file;

        $realFilePath  = realpath($filePath);
        $uploadDirReal = realpath($uploadRoot);

        if ($realFilePath === false || $uploadDirReal === false || strpos($realFilePath, $uploadDirReal) !== 0) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "File not found."]);
            exit;
        }
        if (!file_exists($realFilePath)) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(["error" => "File not found."]);
            exit;
        }

        try {
            if (CryptoAtRest::isEncryptedFile($realFilePath)) {
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(["error" => "Sharing is disabled for encrypted files."]);
                exit;
            }
        } catch (\Throwable $e) {
/* ignore */
        }

        $mimeType = mime_content_type($realFilePath) ?: 'application/octet-stream';
        $ext      = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));

        if (headers_sent($hf, $hl)) {
            error_log("share.php headers already sent at {$hf}:{$hl}");
        }

        // Clear any buffered output so headers + binary stream are clean
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        // Harden against content-type sniffing
        header('X-Content-Type-Options: nosniff');

        // Defense-in-depth: if a browser ignores attachment somehow, this reduces blast radius
        header("Content-Security-Policy: sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");

        // IMPORTANT: prevent header override from earlier code / middleware
        header_remove('Content-Type');
        header_remove('Content-Disposition');

        $downloadName = basename($realFilePath);
        // prevent header injection
        $downloadName = str_replace(["\r", "\n"], '', $downloadName);
        $downloadNameStar = rawurlencode($downloadName);

        $rasterMime = [
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png'  => 'image/png',
            'gif'  => 'image/gif',
            'bmp'  => 'image/bmp',
            'webp' => 'image/webp',
            'ico'  => 'image/x-icon',
        ];
        $inlineMime = [
            'mp4'  => 'video/mp4',
            'mkv'  => 'video/x-matroska',
            'webm' => 'video/webm',
            'mov'  => 'video/quicktime',
            'ogv'  => 'video/ogg',
            'mp3'  => 'audio/mpeg',
            'wav'  => 'audio/wav',
            'm4a'  => 'audio/mp4',
            'ogg'  => 'audio/ogg',
            'flac' => 'audio/flac',
            'aac'  => 'audio/aac',
            'wma'  => 'audio/x-ms-wma',
            'opus' => 'audio/opus',
            'pdf'  => 'application/pdf',
        ];

        // If detector says SVG, never inline it (even if extension lies)
        if ($ext === 'svg' || $ext === 'svgz' || $mimeType === 'image/svg+xml') {
            header('Content-Type: application/octet-stream');
            header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
        } elseif (isset($rasterMime[$ext])) {
            // Raster images: force correct MIME so gallery/inline works even under nosniff
            header('Content-Type: ' . $rasterMime[$ext]);
            header("Content-Disposition: inline; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
        } elseif ($inlineRequested) {
            $lowerMime = strtolower((string)$mimeType);
            $inlineOk = isset($inlineMime[$ext])
                || str_starts_with($lowerMime, 'video/')
                || str_starts_with($lowerMime, 'audio/')
                || $lowerMime === 'application/pdf';
            if ($inlineOk) {
                if (isset($inlineMime[$ext])) {
                    $mimeType = $inlineMime[$ext];
                }
                header('Content-Type: ' . ($mimeType ?: 'application/octet-stream'));
                header("Content-Disposition: inline; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
            } else {
                header('Content-Type: ' . $mimeType);
                header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
            }
        } else {
            header('Content-Type: ' . $mimeType);
            header("Content-Disposition: attachment; filename=\"{$downloadName}\"; filename*=UTF-8''{$downloadNameStar}");
        }

        header("Cache-Control: no-store, no-cache, must-revalidate");
        header("Pragma: no-cache");
        header('Content-Length: ' . filesize($realFilePath));

        AuditHook::log('file.download', [
            'user'   => 'share:' . $token,
            'source' => 'share',
            'folder' => ($folder === '' || strtolower($folder) === 'root') ? 'root' : $folder,
            'path'   => ($folder === '' || strtolower($folder) === 'root') ? $file : ($folder . '/' . $file),
            'meta'   => [
                'token' => $token,
            ],
        ]);

        readfile($realFilePath);
        exit;
    }

    public function createAuthFileLink(): void
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }
            if (!$this->checkCsrf()) {
                return;
            }

            $input = $this->readJsonBody();
            if (!is_array($input) || !$input) {
                $this->jsonOut(['error' => 'Invalid input.'], 400);
                return;
            }

            $folder = $this->normalizeFolder($input['folder'] ?? '');
            $file = basename((string)($input['file'] ?? ''));
            if (!$this->validFolder($folder)) {
                $this->jsonOut(['error' => 'Invalid folder name.'], 400);
                return;
            }
            if (!$this->validFile($file)) {
                $this->jsonOut(['error' => 'Invalid file name.'], 400);
                return;
            }

            $rawSourceId = trim((string)($input['sourceId'] ?? ''));
            $sourceId = $this->normalizeSourceId($rawSourceId);
            if ($rawSourceId !== '' && $sourceId === '') {
                $this->jsonOut(['error' => 'Invalid source id.'], 400);
                return;
            }
            $expiresAt = null;
            if (isset($input['expiresAt'])) {
                $rawExpiresAt = (int)$input['expiresAt'];
                if ($rawExpiresAt > 0) {
                    $expiresAt = $rawExpiresAt;
                }
            } elseif (isset($input['expiresInSeconds'])) {
                $expiresIn = (int)$input['expiresInSeconds'];
                if ($expiresIn > 0) {
                    $expiresIn = min($expiresIn, 365 * 86400);
                    $expiresAt = time() + $expiresIn;
                }
            }

            $username = $_SESSION['username'] ?? '';
            $perms = $this->loadPerms($username);

            $runner = function () use ($folder, $file, $username, $perms, $expiresAt): void {
                $accessErr = $this->enforceSingleFileReadAccess($folder, $file, $username, $perms);
                if ($accessErr) {
                    $this->jsonOut(['error' => $accessErr], 403);
                    return;
                }

                $downloadInfo = FileModel::getDownloadInfo($folder, $file);
                if (isset($downloadInfo['error'])) {
                    $status = in_array($downloadInfo['error'], ['File not found.', 'Access forbidden.'], true) ? 404 : 400;
                    $this->jsonOut(['error' => $downloadInfo['error']], $status);
                    return;
                }

                $effectiveSourceId = '';
                if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                    $effectiveSourceId = SourceContext::getActiveId();
                }

                $result = FileModel::createAuthFileLink(
                    $folder,
                    $file,
                    $effectiveSourceId,
                    (string)$username,
                    $expiresAt
                );
                if (isset($result['error'])) {
                    $this->jsonOut(['error' => $result['error']], 500);
                    return;
                }

                $token = (string)($result['token'] ?? '');
                if ($token === '') {
                    $this->jsonOut(['error' => 'Could not create file link.'], 500);
                    return;
                }

                AuditHook::log('file.link.create', [
                    'user'   => $username,
                    'folder' => $folder,
                    'path'   => ($folder === 'root') ? $file : ($folder . '/' . $file),
                    'meta'   => [
                        'tokenHash' => substr(hash('sha256', $token), 0, 24),
                        'sourceId' => $effectiveSourceId,
                    ],
                ]);

                $payload = [
                    'ok' => true,
                    'token' => $token,
                    'url' => fr_with_base_path('/index.html?fileLink=' . rawurlencode($token)),
                    'sourceId' => $effectiveSourceId,
                ];
                if (isset($result['expiresAt']) && !is_null($result['expiresAt'])) {
                    $payload['expiresAt'] = (int)$result['expiresAt'];
                }
                $this->jsonOut($payload, 200);
            };

            if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $info = SourceContext::getSourceById($sourceId);
                if (!$info) {
                    $this->jsonOut(['error' => 'Invalid source id.'], 400);
                    return;
                }
                if (empty($info['enabled'])) {
                    $this->jsonOut(['error' => 'Source is disabled.'], 403);
                    return;
                }
                $this->withSourceContext($sourceId, $runner, false);
                return;
            }

            $runner();
        } catch (Throwable $e) {
            error_log('FileController::createAuthFileLink error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while creating file link.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function resolveAuthFileLink(): void
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }

            $token = strtolower(trim((string)($_GET['token'] ?? '')));
            if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
                $this->jsonOut(['error' => 'Invalid token.'], 400);
                return;
            }

            $record = FileModel::getAuthFileLinkRecord($token);
            if (!$record || !is_array($record)) {
                $this->jsonOut(['error' => 'Link is invalid or expired.'], 404);
                return;
            }

            $folder = $this->normalizeFolder($record['folder'] ?? 'root');
            $file = basename((string)($record['file'] ?? ''));
            if (!$this->validFolder($folder) || !$this->validFile($file)) {
                $this->jsonOut(['error' => 'Link is invalid or expired.'], 404);
                return;
            }

            $recordSourceId = $this->normalizeSourceId($record['sourceId'] ?? '');
            $username = $_SESSION['username'] ?? '';
            $perms = $this->loadPerms($username);

            $runner = function () use ($folder, $file, $username, $perms, $recordSourceId): void {
                $accessErr = $this->enforceSingleFileReadAccess($folder, $file, $username, $perms);
                if ($accessErr) {
                    $this->jsonOut(['error' => 'Forbidden: no view access to this folder.'], 403);
                    return;
                }

                $downloadInfo = FileModel::getDownloadInfo($folder, $file);
                if (isset($downloadInfo['error'])) {
                    $this->jsonOut(['error' => 'Link is invalid or expired.'], 404);
                    return;
                }

                $this->jsonOut([
                    'ok' => true,
                    'folder' => $folder,
                    'file' => $file,
                    'sourceId' => $recordSourceId,
                ], 200);
            };

            if ($recordSourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $info = SourceContext::getSourceById($recordSourceId);
                if (!$info || empty($info['enabled'])) {
                    $this->jsonOut(['error' => 'Link is invalid or expired.'], 404);
                    return;
                }
                $this->withSourceContext($recordSourceId, $runner, false);
                return;
            }

            $runner();
        } catch (Throwable $e) {
            error_log('FileController::resolveAuthFileLink error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while resolving file link.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function createShareLink()
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }

            $input = $this->readJsonBody();
            if (!$input) {
                $this->jsonOut(["error" => "Invalid input."], 400);
                return;
            }

            $folder = $this->normalizeFolder($input['folder'] ?? '');
            $file   = basename((string)($input['file'] ?? ''));
            $value  = isset($input['expirationValue']) ? (int)$input['expirationValue'] : 60;
            $unit   = $input['expirationUnit'] ?? 'minutes';
            $password = (string)($input['password'] ?? '');

            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }
            if (!$this->validFile($file)) {
                $this->jsonOut(["error" => "Invalid file name."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // Need share (or ancestor-owner)
            if (!(ACL::canShareFile($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->jsonOut(["error" => "Forbidden: no share access"], 403);
                return;
            }

            // Folder scope: share
            $sv = $this->enforceFolderScope($folder, $username, $userPermissions, 'share');
            if ($sv) {
                $this->jsonOut(["error" => $sv], 403);
                return;
            }

            try {
                if (FolderCrypto::isEncryptedOrAncestor($folder)) {
                    $this->jsonOut(["error" => "Sharing is disabled inside encrypted folders."], 403);
                    return;
                }
            } catch (\Throwable $e) {
/* ignore */
            }

            // Ownership unless admin/folder-owner
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
                || ACL::isOwner($username, $userPermissions, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);

            if (!$ignoreOwnership) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                    $this->jsonOut(["error" => "Forbidden: you are not the owner of this file."], 403);
                    return;
                }
            }

            // Block share links for encrypted-at-rest files (even if folder marker is off).
            try {
                $info = FileModel::getDownloadInfo($folder, $file);
                if (is_array($info) && empty($info['error']) && !empty($info['filePath'])) {
                    if (CryptoAtRest::isEncryptedFile((string)$info['filePath'])) {
                        $this->jsonOut(["error" => "Sharing is disabled for encrypted files."], 403);
                        return;
                    }
                }
            } catch (\Throwable $e) {
/* ignore */
            }

            switch ($unit) {
                case 'seconds':
                    $expirationSeconds = $value;
                    break;
                case 'hours':
                    $expirationSeconds = $value * 3600;
                    break;
                case 'days':
                    $expirationSeconds = $value * 86400;
                    break;
                case 'minutes':
                default:
                    $expirationSeconds = $value * 60;
                    break;
            }

            $result = FileModel::createShareLink($folder, $file, $expirationSeconds, $password, (string)$username);
            if (isset($result['token'])) {
                AuditHook::log('share.link.create', [
                    'user'   => $username,
                    'folder' => $folder,
                    'path'   => ($folder === 'root') ? $file : ($folder . '/' . $file),
                    'meta'   => [
                        'token' => $result['token'],
                    ],
                ]);
                EventBus::emit('share.link.create', [
                    'user' => $username,
                    'shareType' => 'file',
                    'folder' => $folder,
                    'file' => $file,
                    'hasPassword' => ($password !== ''),
                    'expirationSeconds' => $expirationSeconds,
                ]);
            }
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::createShareLink error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while creating share link.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function getTrashItems()
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }
            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) {
                $this->jsonOut(['error' => 'Admin only'], 403);
                return;
            }
            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            if (session_status() === PHP_SESSION_ACTIVE) {
                @session_write_close();
            }

            $trashItems = FileModel::getTrashItems();
            $this->jsonOut($trashItems);
        } catch (Throwable $e) {
            error_log('FileController::getTrashItems error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal server error while fetching trash.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function restoreFiles()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }
            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) {
                $this->jsonOut(['error' => 'Admin only'], 403);
                return;
            }
            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            $data = $this->readJsonBody();
            if (!isset($data['files']) || !is_array($data['files'])) {
                $this->jsonOut(["error" => "No file or folder identifiers provided"], 400);
                return;
            }
            $result = FileModel::restoreFiles($data['files']);
            $this->jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::restoreFiles error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal server error while restoring files.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function deleteTrashFiles()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }
            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) {
                $this->jsonOut(['error' => 'Admin only'], 403);
                return;
            }

            $data = $this->readJsonBody();
            if (!$data) {
                $this->jsonOut(["error" => "Invalid input"], 400);
                return;
            }

            $filesToDelete = [];
            if (!empty($data['deleteAll'])) {
                $trashItems = FileModel::getTrashItems();
                if (is_array($trashItems)) {
                    foreach ($trashItems as $item) {
                        if (!empty($item['trashName'])) {
                            $filesToDelete[] = $item['trashName'];
                        }
                    }
                }
            } elseif (isset($data['files']) && is_array($data['files'])) {
                $filesToDelete = $data['files'];
            } else {
                $this->jsonOut(["error" => "No trash file identifiers provided"], 400);
                return;
            }

            $result = FileModel::deleteTrashFiles($filesToDelete);
            if (!empty($result['deleted'])) {
                $msg = "Trash item" . (count($result['deleted']) === 1 ? "" : "s") . " deleted: " . implode(", ", $result['deleted']);
                $this->jsonOut(["success" => $msg]);
            } elseif (!empty($result['error'])) {
                $this->jsonOut(["error" => $result['error']], 400);
            } else {
                $this->jsonOut(["success" => "No items to delete."]);
            }
        } catch (Throwable $e) {
            error_log('FileController::deleteTrashFiles error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal server error while deleting trash files.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function getFileTags(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        if (!$this->requireAuth()) {
            return;
        }
        $sourceId = '';
        $allowDisabled = false;
        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $rawSourceId = trim((string)($_GET['sourceId'] ?? ''));
            if ($rawSourceId !== '') {
                $sourceId = $this->normalizeSourceId($rawSourceId);
                if ($sourceId === '') {
                    http_response_code(400);
                    echo json_encode(["error" => "Invalid source id."]);
                    exit;
                }
                $info = SourceContext::getSourceById($sourceId);
                if (!$info) {
                    http_response_code(400);
                    echo json_encode(["error" => "Invalid source."]);
                    exit;
                }
                $username = $_SESSION['username'] ?? '';
                $perms = $username !== '' ? $this->loadPerms($username) : [];
                $allowDisabled = $this->isAdmin($perms);
                if (!$allowDisabled && empty($info['enabled'])) {
                    http_response_code(403);
                    echo json_encode(["error" => "Source is disabled."]);
                    exit;
                }
            }
        }

        $runner = function () {
            $tags = FileModel::getFileTags();
            echo json_encode($tags);
            exit;
        };

        if ($sourceId !== '') {
            $this->withSourceContext($sourceId, $runner, $allowDisabled);
            return;
        }

        $runner();
    }

    public function saveFileTag(): void
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $data = $this->readJsonBody();
            if (!$data) {
                $this->jsonOut(["error" => "No data received"], 400);
                return;
            }

            $file        = trim((string)($data['file'] ?? ''));
            $folder      = $this->normalizeFolder($data['folder'] ?? 'root');
            $tags        = $data['tags'] ?? [];
            $deleteGlobal = !empty($data['deleteGlobal']);
            $tagToDelete = isset($data['tagToDelete']) ? trim((string)$data['tagToDelete']) : null;

            if ($file === '' || !$this->validFile($file)) {
                $this->jsonOut(["error" => "Invalid file."], 400);
                return;
            }
            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            $sourceId = '';
            $allowDisabled = false;
            if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $rawSourceId = trim((string)($data['sourceId'] ?? ''));
                if ($rawSourceId !== '') {
                    $sourceId = $this->normalizeSourceId($rawSourceId);
                    if ($sourceId === '') {
                        $this->jsonOut(["error" => "Invalid source id."], 400);
                        return;
                    }
                    $info = SourceContext::getSourceById($sourceId);
                    if (!$info) {
                        $this->jsonOut(["error" => "Invalid source."], 400);
                        return;
                    }
                    $allowDisabled = $this->isAdmin($userPermissions);
                    if (!$allowDisabled && empty($info['enabled'])) {
                        $this->jsonOut(["error" => "Source is disabled."], 403);
                        return;
                    }
                }
            }

            $runner = function () use ($file, $folder, $tags, $deleteGlobal, $tagToDelete, $username, $userPermissions) {
                // Need write (or ancestor-owner)
                if (!(ACL::canWrite($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                    $this->jsonOut(["error" => "Forbidden: no full write access"], 403);
                    return;
                }

                // Folder scope: write
                $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'write');
                if ($dv) {
                    $this->jsonOut(["error" => $dv], 403);
                    return;
                }

                // Ownership unless admin/folder-owner
                $ignoreOwnership = $this->isAdmin($userPermissions)
                    || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
                    || ACL::isOwner($username, $userPermissions, $folder)
                    || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);
                if (!$ignoreOwnership) {
                    $meta = $this->loadFolderMetadata($folder);
                    if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                        $this->jsonOut(["error" => "Forbidden: you are not the owner of this file."], 403);
                        return;
                    }
                }

                $result = FileModel::saveFileTag($folder, $file, $tags, $deleteGlobal, $tagToDelete);
                $this->jsonOut($result);
            };

            if ($sourceId !== '') {
                $this->withSourceContext($sourceId, $runner, $allowDisabled);
                return;
            }

            $runner();
        } catch (Throwable $e) {
            error_log('FileController::saveFileTag error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while saving tags.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function getFileList(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        header('Content-Type: application/json; charset=utf-8');

        // convert warnings/notices to exceptions for cleaner error handling
        set_error_handler(function ($severity, $message, $file, $line) {
            if (!(error_reporting() & $severity)) {
                return;
            }
            throw new ErrorException($message, 0, $severity, $file, $line);
        });

        try {
            if (empty($_SESSION['username'])) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }

            $username = $_SESSION['username'] ?? '';
            $perms    = $this->loadPerms($username);

            $sourceId = '';
            $allowDisabled = false;
            if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $rawSourceId = trim((string)($_GET['sourceId'] ?? ''));
                if ($rawSourceId !== '') {
                    $sourceId = $this->normalizeSourceId($rawSourceId);
                    if ($sourceId === '') {
                        http_response_code(400);
                        echo json_encode(['error' => 'Invalid source id.']);
                        return;
                    }
                    $info = SourceContext::getSourceById($sourceId);
                    if (!$info) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Invalid source.']);
                        return;
                    }
                    $allowDisabled = $this->isAdmin($perms);
                    if (!$allowDisabled && empty($info['enabled'])) {
                        http_response_code(403);
                        echo json_encode(['error' => 'Source is disabled.']);
                        return;
                    }
                }
            }

            $runner = function () use ($username, $perms) {
                $metaRoot = class_exists('SourceContext')
                    ? SourceContext::metaRoot()
                    : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
                if (!is_dir($metaRoot)) {
                    @mkdir($metaRoot, 0775, true);
                }

                $storage = StorageRegistry::getAdapter();
                $uploadRoot = class_exists('SourceContext') ? SourceContext::uploadRoot() : (string)UPLOAD_DIR;
                if ($storage->isLocal() && !is_dir($uploadRoot)) {
                    http_response_code(500);
                    echo json_encode(['error' => 'Uploads directory not found.']);
                    return;
                }

                // --- inputs ---
                $folder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'root';

                // Validate folder path: allow "root" or nested segments that each match REGEX_FOLDER_NAME
                if ($folder !== 'root') {
                    $parts = array_filter(explode('/', trim($folder, "/\\ ")));
                    if (empty($parts)) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Invalid folder name.']);
                        return;
                    }
                    foreach ($parts as $seg) {
                        if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                            http_response_code(400);
                            echo json_encode(['error' => 'Invalid folder name.']);
                            return;
                        }
                    }
                    $folder = implode('/', $parts);
                }

                $includeContent = $this->truthy($_GET['includeContent'] ?? ($_GET['includeSnippets'] ?? false));
                $pageSize = isset($_GET['pageSize']) ? (int)$_GET['pageSize'] : 0;
                if ($pageSize < 0) {
                    $pageSize = 0;
                }
                $cursor = trim((string)($_GET['cursor'] ?? ''));
                $sortBy = trim((string)($_GET['sortBy'] ?? ''));
                $sortDir = trim((string)($_GET['sortDir'] ?? ''));
                $pagingRequested = ($pageSize > 0) || ($cursor !== '');
                if ($pagingRequested && $pageSize <= 0) {
                    $pageSize = 50;
                }

                // ---- Folder-level view checks (full vs own-only) ----
                // Full view if read OR ancestor owner
                $fullView     = ACL::canRead($username, $perms, $folder) || $this->ownsFolderOrAncestor($folder, $username, $perms);
                $ownOnlyGrant = ACL::hasGrant($username, $folder, 'read_own');

                // Special-case: keep Root visible but inert if user lacks any visibility there.
                if ($folder === 'root' && !$fullView && !$ownOnlyGrant) {
                    echo json_encode([
                        'success' => true,
                        'folder'  => 'root',
                        'files'   => [],
                        // Optional hint the UI can use to show a soft message / disable actions:
                        'uiHints' => [
                            'noAccessRoot' => true,
                            'message'      => "You don't have access to Root. Select a folder you have access to."
                        ],
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    return;
                }

                // Non-root: still enforce 403 if no visibility
                if ($folder !== 'root' && !$fullView && !$ownOnlyGrant) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Forbidden: no view access to this folder.']);
                    return;
                }

                // Fetch the list
                $listOptions = [
                    'includeContent' => $includeContent,
                ];
                if ($pagingRequested) {
                    $listOptions['pageSize'] = $pageSize;
                    if ($cursor !== '') {
                        $listOptions['cursor'] = $cursor;
                    }
                    if ($sortBy !== '') {
                        $listOptions['sortBy'] = $sortBy;
                    }
                    if ($sortDir !== '') {
                        $listOptions['sortDir'] = $sortDir;
                    }
                }

                $ownOnlyFilteredInModel = false;
                if ($pagingRequested && !$fullView && $ownOnlyGrant) {
                    $listOptions['uploaderExact'] = $username;
                    $ownOnlyFilteredInModel = true;
                }

                $result = FileModel::getFileList($folder, $listOptions);
                if ($result === false || $result === null) {
                    http_response_code(500);
                    echo json_encode(['error' => 'File model failed.']);
                    return;
                }
                if (!is_array($result)) {
                    throw new RuntimeException('FileModel::getFileList returned a non-array.');
                }
                if (isset($result['error'])) {
                    http_response_code(400);
                    echo json_encode($result);
                    return;
                }

                // ---- Apply own-only filter if user does NOT have full view ----
                if (!$ownOnlyFilteredInModel && !$fullView && $ownOnlyGrant && isset($result['files'])) {
                    $files = $result['files'];

                    // If files keyed by filename (assoc array)
                    if (is_array($files) && array_keys($files) !== range(0, count($files) - 1)) {
                        $filtered = [];
                        foreach ($files as $name => $meta) {
                            if (isset($meta['uploader']) && strcasecmp((string)$meta['uploader'], $username) === 0) {
                                $filtered[$name] = $meta;
                            }
                        }
                        $result['files'] = $filtered;
                    } elseif (is_array($files)) {
                        // If files is a numeric array of metadata items
                        $result['files'] = array_values(array_filter(
                            $files,
                            function ($f) use ($username) {
                                return isset($f['uploader']) && strcasecmp((string)$f['uploader'], $username) === 0;
                            }
                        ));
                    }
                }

                echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            };

            if ($sourceId !== '') {
                $this->withSourceContext($sourceId, $runner, $allowDisabled);
            } else {
                $runner();
            }
            return;
        } catch (Throwable $e) {
            error_log('FileController::getFileList error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            http_response_code(500);
            echo json_encode(['error' => 'Internal server error while listing files.']);
        } finally {
            restore_error_handler();
        }
    }

    public function getShareLinks()
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }

            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) {
                $this->jsonOut(['error' => 'Admin only'], 403);
                return;
            }

            $shareFile = FileModel::getAllShareLinks();
            $this->jsonOut($shareFile);
        } catch (Throwable $e) {
            error_log('FileController::getShareLinks error: ' . $e->getMessage());
            $this->jsonOut(['error' => 'Internal server error while fetching share links.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function getAllShareLinks(): void
    {
        header('Content-Type: application/json');
        $metaRoot = class_exists('SourceContext')
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $shareFile = rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'share_links.json';
        $links     = file_exists($shareFile)
            ? json_decode(file_get_contents($shareFile), true) ?? []
            : [];
        $now       = time();
        $cleaned   = [];

        foreach ($links as $token => $record) {
            if (!empty($record['expires']) && $record['expires'] < $now) {
                continue;
            }
            $cleaned[$token] = $record;
        }

        if (count($cleaned) !== count($links)) {
            file_put_contents($shareFile, json_encode($cleaned, JSON_PRETTY_PRINT));
        }

        echo json_encode($cleaned);
    }

    public function deleteShareLink()
    {
        $this->jsonStart();
        try {
            if (!$this->checkCsrf()) {
                return;
            }
            if (!$this->requireAuth()) {
                return;
            }

            $username = $_SESSION['username'] ?? '';
            $perms = $this->loadPerms($username);
            if (!$this->isAdmin($perms)) {
                $this->jsonOut(['success' => false, 'error' => 'Admin only'], 403);
                return;
            }

            $token = $_POST['token'] ?? '';
            if (!$token) {
                $this->jsonOut(['success' => false, 'error' => 'No token provided'], 400);
                return;
            }

            $deleted = null;
            $sourceId = $this->normalizeSourceId($_POST['sourceId'] ?? '');
            if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                $info = SourceContext::getSourceById($sourceId);
                if (!$info) {
                    $this->jsonOut(['success' => false, 'error' => 'Invalid source id'], 400);
                    return;
                }
                $deleted = $this->withSourceContext($sourceId, function () use ($token) {
                    return FileModel::deleteShareLink($token);
                }, true);
            }

            if ($deleted === null) {
                $deleted = FileModel::deleteShareLink($token);
            }

            if ($deleted) {
                AuditHook::log('share.link.delete', [
                    'user' => $username !== '' ? $username : 'Unknown',
                    'meta' => [
                        'token' => $token,
                    ],
                ]);
                EventBus::emit('share.link.delete', [
                    'user' => $username !== '' ? $username : 'Unknown',
                    'shareType' => 'file',
                ]);
            }

            $this->jsonOut($deleted ? ['success' => true] : ['success' => false, 'error' => 'Not found']);
        } catch (Throwable $e) {
            error_log('FileController::deleteShareLink error: ' . $e->getMessage());
            $this->jsonOut(['success' => false, 'error' => 'Internal server error while deleting share link.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }

    public function createFile(): void
    {
        $this->jsonStart();
        try {
            if (!$this->requireAuth()) {
                return;
            }

            $body = $this->readJsonBody();
            $folder   = $this->normalizeFolder($body['folder'] ?? 'root');
            $filename = basename(trim((string)($body['name'] ?? '')));

            if (!$this->validFolder($folder)) {
                $this->jsonOut(["error" => "Invalid folder name."], 400);
                return;
            }
            if (!$this->validFile($filename)) {
                $this->jsonOut(["error" => "Invalid file name."], 400);
                return;
            }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                $this->jsonOut(["error" => "Source is read-only."], 403);
                return;
            }

            // Need write (or ancestor-owner)
            if (!(ACL::canCreate($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->jsonOut(["error" => "Forbidden: no full write access"], 403);
                return;
            }

            // Folder scope: write
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'create');
            if ($dv) {
                $this->jsonOut(["error" => $dv], 403);
                return;
            }

            $result = FileModel::createFile($folder, $filename, $username);
            if (empty($result['success'])) {
                $this->jsonOut(['success' => false, 'error' => $result['error'] ?? 'Failed to create file'], $result['code'] ?? 400);
                return;
            }
            AuditHook::log('file.create', [
                'user'   => $username,
                'folder' => $folder,
                'path'   => ($folder === 'root') ? $filename : ($folder . '/' . $filename),
            ]);
            $this->jsonOut(['success' => true]);
        } catch (Throwable $e) {
            error_log('FileController::createFile error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->jsonOut(['error' => 'Internal server error while creating file.'], 500);
        } finally {
            $this->jsonEnd();
        }
    }
}
