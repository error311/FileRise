#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../src/lib/SourceContext.php';

use FileRise\Domain\FileModel;
use FileRise\Domain\FolderModel;
use FileRise\Domain\TransferJobManager;
use FileRise\Domain\UserModel as userModel;
use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageRegistry;
use FileRise\Support\ACL;
use FileRise\Support\AuditHook;

$jobId = strtolower((string)($argv[1] ?? ''));
$jobId = preg_replace('/[^a-f0-9]/', '', $jobId ?? '');
if (!is_string($jobId) || $jobId === '' || !TransferJobManager::isValidId($jobId)) {
    fwrite(STDERR, "Invalid job id\n");
    exit(1);
}

$job = TransferJobManager::load($jobId);
if (!is_array($job)) {
    fwrite(STDERR, "Job not found\n");
    exit(1);
}

TransferJobManager::cleanupOld();

$logFile = TransferJobManager::logPathFor($jobId);
@file_put_contents($logFile, '[' . date('c') . "] worker start id={$jobId}\n", FILE_APPEND);

$save = static function () use (&$job, $jobId): void {
    $job['updatedAt'] = time();
    TransferJobManager::save($jobId, $job);
};

$reload = static function () use (&$job, $jobId): void {
    $fresh = TransferJobManager::load($jobId);
    if (is_array($fresh)) {
        $job = $fresh;
    }
};

$checkCancelled = static function () use (&$job, $reload): bool {
    $reload();
    return !empty($job['cancelRequested']);
};

$toFolder = static function ($value): string {
    $folder = trim((string)$value);
    if ($folder === '' || strcasecmp($folder, 'root') === 0) {
        return 'root';
    }
    return trim(str_replace('\\', '/', $folder), '/');
};

$withSourceContext = static function (string $sourceId, callable $fn) {
    $sourceId = trim($sourceId);
    if ($sourceId === '' || !class_exists(SourceContext::class) || !SourceContext::sourcesEnabled()) {
        return $fn();
    }
    $prev = SourceContext::getActiveId();
    SourceContext::setActiveId($sourceId, false, true);
    try {
        return $fn();
    } finally {
        SourceContext::setActiveId($prev, false, true);
    }
};

$sourceFileSize = static function (string $sourceId, string $sourceFolder, string $fileName) use ($withSourceContext): int {
    return (int)$withSourceContext($sourceId, static function () use ($sourceFolder, $fileName): int {
        $storage = StorageRegistry::getAdapter();
        $root = class_exists(SourceContext::class) ? SourceContext::uploadRoot() : (string)UPLOAD_DIR;
        $base = rtrim((string)$root, '/\\');
        $folder = trim((string)$sourceFolder);
        $folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? '' : trim($folder, '/\\');
        $path = $base;
        if ($folder !== '') {
            $path .= DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
        }
        $path .= DIRECTORY_SEPARATOR . basename($fileName);
        $stat = $storage->stat($path);
        if (!is_array($stat) || ($stat['type'] ?? '') !== 'file') {
            return 0;
        }
        return (int)($stat['size'] ?? 0);
    });
};

$loadPerms = static function (string $username): array {
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
    } catch (\Throwable $e) {
        // fall through
    }
    return [];
};

$isAdminUser = static function (string $username, array $perms): bool {
    if (ACL::isAdmin($perms)) {
        return true;
    }
    try {
        if ($username !== '' && class_exists(userModel::class) && method_exists(userModel::class, 'getUserRole')) {
            return (string)userModel::getUserRole($username) === '1';
        }
    } catch (\Throwable $e) {
        // ignore
    }
    return false;
};

$isFolderOnly = static function (array $perms): bool {
    return !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
};

$ownsFolderOrAncestor = static function (string $folder, string $username, array $perms) use ($isAdminUser): bool {
    if ($isAdminUser($username, $perms)) {
        return true;
    }
    $f = ACL::normalizeFolder($folder);
    while ($f !== '' && strcasecmp($f, 'root') !== 0) {
        if (ACL::isOwner($username, $perms, $f)) {
            return true;
        }
        $pos = strrpos($f, '/');
        $f = ($pos === false) ? '' : substr($f, 0, $pos);
    }
    return false;
};

$enforceFolderScope = static function (string $folder, string $username, array $perms, string $need = 'read') use ($isAdminUser, $isFolderOnly, $ownsFolderOrAncestor): ?string {
    if ($isAdminUser($username, $perms)) {
        return null;
    }
    if (!$isFolderOnly($perms)) {
        return null;
    }
    $folder = ACL::normalizeFolder($folder);
    if ($ownsFolderOrAncestor($folder, $username, $perms)) {
        return null;
    }

    $ok = false;
    switch ($need) {
        case 'manage':
            $ok = ACL::canManage($username, $perms, $folder);
            break;
        case 'write':
            $ok = ACL::canWrite($username, $perms, $folder);
            break;
        case 'share':
            $ok = ACL::canShare($username, $perms, $folder);
            break;
        case 'read_own':
            $ok = ACL::canReadOwn($username, $perms, $folder);
            break;
        case 'create':
            $ok = ACL::canCreate($username, $perms, $folder);
            break;
        case 'upload':
            $ok = ACL::canUpload($username, $perms, $folder);
            break;
        case 'edit':
            $ok = ACL::canEdit($username, $perms, $folder);
            break;
        case 'rename':
            $ok = ACL::canRename($username, $perms, $folder);
            break;
        case 'copy':
            $ok = ACL::canCopy($username, $perms, $folder);
            break;
        case 'move':
            $ok = ACL::canMove($username, $perms, $folder);
            break;
        case 'delete':
            $ok = ACL::canDelete($username, $perms, $folder);
            break;
        case 'extract':
            $ok = ACL::canExtract($username, $perms, $folder);
            break;
        case 'shareFile':
        case 'share_file':
            $ok = ACL::canShareFile($username, $perms, $folder);
            break;
        case 'shareFolder':
        case 'share_folder':
            $ok = ACL::canShareFolder($username, $perms, $folder);
            break;
        default:
            $ok = ACL::canRead($username, $perms, $folder);
            break;
    }
    return $ok ? null : 'Forbidden: folder scope violation.';
};

$metadataPathForFolder = static function (string $folder): string {
    $f = trim((string)$folder);
    $metaRoot = class_exists(SourceContext::class)
        ? SourceContext::metaRoot()
        : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
    if ($f === '' || strcasecmp($f, 'root') === 0) {
        return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'root_metadata.json';
    }
    return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . str_replace(['/', '\\', ' '], '-', $f) . '_metadata.json';
};

$loadFolderMetadata = static function (string $folder, string $sourceId) use ($withSourceContext, $metadataPathForFolder): array {
    return (array)$withSourceContext($sourceId, static function () use ($folder, $metadataPathForFolder): array {
        $meta = $metadataPathForFolder($folder);
        if (!is_file($meta)) {
            return [];
        }
        $raw = @file_get_contents($meta);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($decoded) ? $decoded : [];
    });
};

$enforceScopeAndOwnership = static function (string $sourceFolder, array $files, string $username, array $perms, string $sourceId) use ($isAdminUser, $loadFolderMetadata): ?string {
    $ignoreOwnership = $isAdminUser($username, $perms)
        || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
    if ($ignoreOwnership) {
        return null;
    }

    if (ACL::canRead($username, $perms, $sourceFolder) || !ACL::hasGrant($username, $sourceFolder, 'read_own')) {
        return null;
    }

    $metadata = $loadFolderMetadata($sourceFolder, $sourceId);
    foreach ($files as $file) {
        $name = basename(trim((string)$file));
        if ($name === '') {
            continue;
        }
        if (!isset($metadata[$name]['uploader']) || strcasecmp((string)$metadata[$name]['uploader'], $username) !== 0) {
            return "Forbidden: you are not the owner of '{$name}'.";
        }
    }
    return null;
};

$validateSourceStates = static function (
    string $sourceId,
    string $destSourceId,
    bool $isAdmin,
    bool $isMoveOp
): ?string {
    if (!class_exists(SourceContext::class) || !SourceContext::sourcesEnabled()) {
        return null;
    }
    $sid = trim($sourceId);
    $did = trim($destSourceId);
    if ($sid === '' || $did === '') {
        return null;
    }

    $sourceInfo = SourceContext::getSourceById($sid);
    $destInfo = SourceContext::getSourceById($did);
    if (!$sourceInfo || !$destInfo) {
        return 'Invalid source.';
    }
    if (!$isAdmin && (empty($sourceInfo['enabled']) || empty($destInfo['enabled']))) {
        return 'Source is disabled.';
    }
    if ($isMoveOp && !empty($sourceInfo['readOnly'])) {
        return 'Source is read-only.';
    }
    if (!empty($destInfo['readOnly'])) {
        return 'Destination source is read-only.';
    }
    return null;
};

$setRunning = static function () use (&$job, $save): void {
    $job['status'] = 'running';
    $job['phase'] = 'running';
    $job['startedAt'] = $job['startedAt'] ?? time();
    if (!isset($job['filesDone']) || !is_numeric($job['filesDone'])) {
        $job['filesDone'] = 0;
    }
    if (!isset($job['bytesDone']) || !is_numeric($job['bytesDone'])) {
        $job['bytesDone'] = 0;
    }
    if (!isset($job['errors']) || !is_array($job['errors'])) {
        $job['errors'] = [];
    }
    $save();
};

$markCancelled = static function () use (&$job, $save): void {
    $job['status'] = 'cancelled';
    $job['phase'] = 'cancelled';
    $job['endedAt'] = time();
    $save();
};

$updatePct = static function () use (&$job): void {
    $pct = null;
    $selectedBytes = (int)($job['selectedBytes'] ?? 0);
    $selectedFiles = (int)($job['selectedFiles'] ?? 0);
    $bytesDone = (int)($job['bytesDone'] ?? 0);
    $filesDone = (int)($job['filesDone'] ?? 0);

    if ($selectedBytes > 0) {
        $pct = (int)round(($bytesDone / max(1, $selectedBytes)) * 100);
    } elseif ($selectedFiles > 0) {
        $pct = (int)round(($filesDone / max(1, $selectedFiles)) * 100);
    }

    if ($pct === null) {
        $job['pct'] = 0;
        return;
    }
    $job['pct'] = max(0, min(100, $pct));
};

$kind = strtolower((string)($job['kind'] ?? ''));
if (!in_array($kind, ['file_copy', 'file_move', 'folder_copy', 'folder_move'], true)) {
    $job['status'] = 'error';
    $job['phase'] = 'error';
    $job['error'] = 'Unsupported transfer job type.';
    $job['endedAt'] = time();
    $save();
    exit(0);
}

if (!empty($job['cancelRequested'])) {
    $markCancelled();
    exit(0);
}

$jobUser = trim((string)($job['user'] ?? ''));
if ($jobUser === '') {
    $job['status'] = 'error';
    $job['phase'] = 'error';
    $job['error'] = 'Missing transfer job user.';
    $job['endedAt'] = time();
    $save();
    exit(0);
}

if (!isset($_SESSION) || !is_array($_SESSION)) {
    $_SESSION = [];
}
$_SESSION['username'] = $jobUser;

$perms = $loadPerms($jobUser);
$isAdmin = $isAdminUser($jobUser, $perms);
if ($isAdmin) {
    // Keep ACL::isAdmin() behavior consistent in CLI workers (no session context here).
    $perms['admin'] = 1;
    $perms['isAdmin'] = 1;
    if (!isset($perms['role']) || (string)$perms['role'] === '') {
        $perms['role'] = '1';
    }
}

if (!$isAdmin && !empty($perms['readOnly'])) {
    $job['status'] = 'error';
    $job['phase'] = 'error';
    $job['error'] = 'Account is read-only.';
    $job['endedAt'] = time();
    $save();
    exit(0);
}
if (
    !$isAdmin
    && !empty($perms['disableUpload'])
    && in_array($kind, ['file_copy', 'file_move', 'folder_copy', 'folder_move'], true)
) {
    $job['status'] = 'error';
    $job['phase'] = 'error';
    $job['error'] = 'Uploads are disabled for your account.';
    $job['endedAt'] = time();
    $save();
    exit(0);
}

$setRunning();

try {
    if ($kind === 'file_copy' || $kind === 'file_move') {
        $sourceFolder = $toFolder($job['sourceFolder'] ?? 'root');
        $destinationFolder = $toFolder($job['destinationFolder'] ?? 'root');
        $sourceId = (string)($job['sourceId'] ?? '');
        $destSourceId = (string)($job['destSourceId'] ?? $sourceId);
        $crossSource = !empty($job['crossSource']);
        $isMoveOp = ($kind === 'file_move');

        if ($crossSource && (trim($sourceId) === '' || trim($destSourceId) === '')) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = 'Invalid source.';
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        $sourceStateErr = $validateSourceStates($sourceId, $destSourceId, $isAdmin, $isMoveOp);
        if (is_string($sourceStateErr) && $sourceStateErr !== '') {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = $sourceStateErr;
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        $rawFiles = is_array($job['files'] ?? null) ? $job['files'] : [];
        $files = [];
        foreach ($rawFiles as $name) {
            $bn = basename(trim((string)$name));
            if ($bn !== '') {
                $files[] = $bn;
            }
        }
        $files = array_values(array_unique($files));
        if (!$files) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = 'No files selected.';
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        $validateFileTransferAccess = static function (
            array $filesToCheck,
            array $activePerms
        ) use (
            $withSourceContext,
            $isMoveOp,
            $jobUser,
            $sourceFolder,
            $destinationFolder,
            $enforceFolderScope,
            $ownsFolderOrAncestor,
            $enforceScopeAndOwnership,
            $sourceId,
            $destSourceId
        ): ?string {
            $srcErr = $withSourceContext($sourceId, static function () use (
                $isMoveOp,
                $jobUser,
                $activePerms,
                $sourceFolder,
                $enforceFolderScope,
                $ownsFolderOrAncestor
            ): ?string {
                $hasSourceView = ACL::canReadOwn($jobUser, $activePerms, $sourceFolder)
                    || $ownsFolderOrAncestor($sourceFolder, $jobUser, $activePerms);
                if (!$hasSourceView) {
                    return 'Forbidden: no read access to source';
                }

                if ($isMoveOp) {
                    $hasSourceDelete = ACL::canDelete($jobUser, $activePerms, $sourceFolder)
                        || $ownsFolderOrAncestor($sourceFolder, $jobUser, $activePerms);
                    if (!$hasSourceDelete) {
                        return 'Forbidden: no delete permission on source';
                    }
                    $sv = $enforceFolderScope($sourceFolder, $jobUser, $activePerms, 'delete');
                    if ($sv) {
                        return $sv;
                    }
                } else {
                    $needSrcScope = ACL::canRead($jobUser, $activePerms, $sourceFolder) ? 'read' : 'read_own';
                    $sv = $enforceFolderScope($sourceFolder, $jobUser, $activePerms, $needSrcScope);
                    if ($sv) {
                        return $sv;
                    }
                }

                return null;
            });
            if ($srcErr) {
                return (string)$srcErr;
            }

            $dstErr = $withSourceContext($destSourceId, static function () use (
                $isMoveOp,
                $jobUser,
                $activePerms,
                $destinationFolder,
                $enforceFolderScope,
                $ownsFolderOrAncestor
            ): ?string {
                if ($isMoveOp) {
                    $hasDestMove = ACL::canMove($jobUser, $activePerms, $destinationFolder)
                        || $ownsFolderOrAncestor($destinationFolder, $jobUser, $activePerms);
                    if (!$hasDestMove) {
                        return 'Forbidden: no move permission on destination';
                    }
                    $dv = $enforceFolderScope($destinationFolder, $jobUser, $activePerms, 'move');
                    if ($dv) {
                        return $dv;
                    }
                } else {
                    $hasDestCreate = ACL::canCreate($jobUser, $activePerms, $destinationFolder)
                        || $ownsFolderOrAncestor($destinationFolder, $jobUser, $activePerms);
                    if (!$hasDestCreate) {
                        return 'Forbidden: no write access to destination';
                    }
                    $dv = $enforceFolderScope($destinationFolder, $jobUser, $activePerms, 'create');
                    if ($dv) {
                        return $dv;
                    }
                }
                return null;
            });
            if ($dstErr) {
                return (string)$dstErr;
            }

            return $enforceScopeAndOwnership($sourceFolder, $filesToCheck, $jobUser, $activePerms, $sourceId);
        };

        $preflightErr = $validateFileTransferAccess($files, $perms);
        if ($preflightErr) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = (string)$preflightErr;
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        $job['selectedFiles'] = max((int)($job['selectedFiles'] ?? 0), count($files));
        if (!isset($job['selectedBytes']) || !is_numeric($job['selectedBytes'])) {
            $job['selectedBytes'] = 0;
        }
        $save();

        foreach ($files as $idx => $name) {
            if ($checkCancelled()) {
                $markCancelled();
                exit(0);
            }

            // Re-check account and ACL each item so mid-job permission changes fail closed.
            $iterPerms = $loadPerms($jobUser);
            $iterIsAdmin = $isAdminUser($jobUser, $iterPerms);
            if (!$iterIsAdmin && !empty($iterPerms['readOnly'])) {
                $job['status'] = 'error';
                $job['phase'] = 'error';
                $job['error'] = 'Account is read-only.';
                $job['endedAt'] = time();
                $save();
                exit(0);
            }
            if (!$iterIsAdmin && !empty($iterPerms['disableUpload'])) {
                $job['status'] = 'error';
                $job['phase'] = 'error';
                $job['error'] = 'Uploads are disabled for your account.';
                $job['endedAt'] = time();
                $save();
                exit(0);
            }
            $iterSourceStateErr = $validateSourceStates($sourceId, $destSourceId, $iterIsAdmin, $isMoveOp);
            if (is_string($iterSourceStateErr) && $iterSourceStateErr !== '') {
                $job['status'] = 'error';
                $job['phase'] = 'error';
                $job['error'] = $iterSourceStateErr;
                $job['endedAt'] = time();
                $save();
                exit(0);
            }
            $iterAclErr = $validateFileTransferAccess([$name], $iterPerms);
            if ($iterAclErr) {
                $job['status'] = 'error';
                $job['phase'] = 'error';
                $job['error'] = (string)$iterAclErr;
                $job['endedAt'] = time();
                $save();
                exit(0);
            }

            $job['phase'] = 'running';
            $job['current'] = ($sourceFolder === 'root' ? $name : ($sourceFolder . '/' . $name));

            $size = $sourceFileSize($sourceId, $sourceFolder, $name);

            if ($kind === 'file_copy') {
                if ($crossSource) {
                    $result = FileModel::copyFilesAcrossSources($sourceId, $destSourceId, $sourceFolder, $destinationFolder, [$name]);
                } else {
                    $result = $withSourceContext($sourceId, static function () use ($sourceFolder, $destinationFolder, $name): array {
                        return FileModel::copyFiles($sourceFolder, $destinationFolder, [$name]);
                    });
                }
            } else {
                if ($crossSource) {
                    $result = FileModel::moveFilesAcrossSources($sourceId, $destSourceId, $sourceFolder, $destinationFolder, [$name]);
                } else {
                    $result = $withSourceContext($sourceId, static function () use ($sourceFolder, $destinationFolder, $name): array {
                        return FileModel::moveFiles($sourceFolder, $destinationFolder, [$name]);
                    });
                }
            }

            if (is_array($result) && isset($result['error'])) {
                $job['errors'][] = (string)$result['error'];
            } else {
                $job['filesDone'] = (int)($job['filesDone'] ?? 0) + 1;
                if ($size > 0) {
                    $job['bytesDone'] = (int)($job['bytesDone'] ?? 0) + $size;
                }
                $from = ($sourceFolder === 'root') ? $name : ($sourceFolder . '/' . $name);
                $to = ($destinationFolder === 'root') ? $name : ($destinationFolder . '/' . $name);
                AuditHook::log($kind === 'file_copy' ? 'file.copy' : 'file.move', [
                    'user' => (string)($job['user'] ?? ''),
                    'folder' => $destinationFolder,
                    'from' => $from,
                    'to' => $to,
                ]);
            }

            $updatePct();
            $job['currentIndex'] = $idx + 1;
            $save();
        }

        if ($checkCancelled()) {
            $markCancelled();
            exit(0);
        }

        if (!empty($job['errors'])) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = implode('; ', array_slice($job['errors'], 0, 10));
        } else {
            $job['status'] = 'done';
            $job['phase'] = 'done';
            $job['error'] = null;
            $job['pct'] = 100;
        }
        $job['current'] = null;
        $job['endedAt'] = time();
        $save();
        exit(0);
    }

    // folder_copy / folder_move
    $sourceFolder = $toFolder($job['sourceFolder'] ?? 'root');
    $targetFolder = $toFolder($job['targetFolder'] ?? 'root');
    $destinationFolder = $toFolder($job['destinationFolder'] ?? dirname($targetFolder));
    $sourceId = (string)($job['sourceId'] ?? '');
    $destSourceId = (string)($job['destSourceId'] ?? $sourceId);
    $crossSource = !empty($job['crossSource']);
    $isMoveOp = ($kind === 'folder_move');

    if ($crossSource && (trim($sourceId) === '' || trim($destSourceId) === '')) {
        $job['status'] = 'error';
        $job['phase'] = 'error';
        $job['error'] = 'Invalid source.';
        $job['endedAt'] = time();
        $save();
        exit(0);
    }

    $sourceStateErr = $validateSourceStates($sourceId, $destSourceId, $isAdmin, $isMoveOp);
    if (is_string($sourceStateErr) && $sourceStateErr !== '') {
        $job['status'] = 'error';
        $job['phase'] = 'error';
        $job['error'] = $sourceStateErr;
        $job['endedAt'] = time();
        $save();
        exit(0);
    }

    if ($kind === 'folder_copy' || $crossSource) {
        $srcErr = $withSourceContext($sourceId, static function () use ($jobUser, $perms, $sourceFolder, $enforceFolderScope): ?string {
            $canManageSource = ACL::canManage($jobUser, $perms, $sourceFolder) || ACL::isOwner($jobUser, $perms, $sourceFolder);
            if (!$canManageSource) {
                return 'Forbidden: manage rights required on source';
            }
            $sv = $enforceFolderScope($sourceFolder, $jobUser, $perms, 'manage');
            return $sv ?: null;
        });
        if ($srcErr) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = (string)$srcErr;
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        $dstErr = $withSourceContext($destSourceId, static function () use ($jobUser, $perms, $destinationFolder, $enforceFolderScope, $ownsFolderOrAncestor): ?string {
            $canCreate = ACL::canCreate($jobUser, $perms, $destinationFolder)
                || $ownsFolderOrAncestor($destinationFolder, $jobUser, $perms);
            if (!$canCreate) {
                return 'Forbidden: no write access to destination';
            }
            $dv = $enforceFolderScope($destinationFolder, $jobUser, $perms, 'create');
            return $dv ?: null;
        });
        if ($dstErr) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = (string)$dstErr;
            $job['endedAt'] = time();
            $save();
            exit(0);
        }
    } else {
        $srcErr = $withSourceContext($sourceId, static function () use ($jobUser, $perms, $sourceFolder, $enforceFolderScope): ?string {
            $canManageSource = ACL::canManage($jobUser, $perms, $sourceFolder) || ACL::isOwner($jobUser, $perms, $sourceFolder);
            if (!$canManageSource) {
                return 'Forbidden: manage rights required on source';
            }
            $sv = $enforceFolderScope($sourceFolder, $jobUser, $perms, 'manage');
            return $sv ?: null;
        });
        if ($srcErr) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = (string)$srcErr;
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        $dstErr = $withSourceContext($destSourceId, static function () use ($jobUser, $perms, $destinationFolder, $enforceFolderScope, $isAdmin): ?string {
            $canMoveIntoDest = ACL::canMove($jobUser, $perms, $destinationFolder)
                || ($destinationFolder === 'root' ? $isAdmin : ACL::isOwner($jobUser, $perms, $destinationFolder));
            if (!$canMoveIntoDest) {
                return 'Forbidden: move rights required on destination';
            }
            $dv = $enforceFolderScope($destinationFolder, $jobUser, $perms, 'write');
            return $dv ?: null;
        });
        if ($dstErr) {
            $job['status'] = 'error';
            $job['phase'] = 'error';
            $job['error'] = (string)$dstErr;
            $job['endedAt'] = time();
            $save();
            exit(0);
        }

        if (!$isAdmin) {
            $sameOwnerErr = $withSourceContext($sourceId, static function () use ($jobUser, $perms, $sourceFolder, $destinationFolder): ?string {
                try {
                    $ownerSrc = FolderModel::getOwnerFor($sourceFolder) ?? '';
                    $ownerDst = $destinationFolder === 'root' ? '' : (FolderModel::getOwnerFor($destinationFolder) ?? '');
                    if ((string)$ownerSrc !== (string)$ownerDst) {
                        return 'Source and destination must have the same owner';
                    }
                } catch (\Throwable $e) {
                    return null;
                }
                return null;
            });
            if ($sameOwnerErr) {
                $job['status'] = 'error';
                $job['phase'] = 'error';
                $job['error'] = (string)$sameOwnerErr;
                $job['endedAt'] = time();
                $save();
                exit(0);
            }
        }
    }

    $job['current'] = $sourceFolder;
    $job['phase'] = 'running';
    $save();

    if ($checkCancelled()) {
        $markCancelled();
        exit(0);
    }

    if ($kind === 'folder_copy') {
        if ($crossSource) {
            $result = FolderModel::copyFolderAcrossSources($sourceId, $destSourceId, $sourceFolder, $targetFolder);
        } else {
            $result = $withSourceContext($sourceId, static function () use ($sourceFolder, $targetFolder): array {
                return FolderModel::copyFolderSameSource($sourceFolder, $targetFolder);
            });
        }
    } else {
        if ($crossSource) {
            $result = FolderModel::moveFolderAcrossSources($sourceId, $destSourceId, $sourceFolder, $targetFolder);
        } else {
            $result = $withSourceContext($sourceId, static function () use ($sourceFolder, $targetFolder): array {
                return FolderModel::renameFolder($sourceFolder, $targetFolder);
            });
        }
    }

    if ($checkCancelled()) {
        $markCancelled();
        exit(0);
    }

    if (is_array($result) && isset($result['error'])) {
        $job['status'] = 'error';
        $job['phase'] = 'error';
        $job['errors'][] = (string)$result['error'];
        $job['error'] = (string)$result['error'];
    } else {
        $job['status'] = 'done';
        $job['phase'] = 'done';
        $job['error'] = null;
        $job['filesDone'] = (int)max((int)($job['filesDone'] ?? 0), (int)($job['selectedFiles'] ?? 1));
        $job['bytesDone'] = (int)max((int)($job['bytesDone'] ?? 0), (int)($job['selectedBytes'] ?? 0));
        $job['pct'] = 100;
        AuditHook::log($kind === 'folder_copy' ? 'folder.copy' : 'folder.move', [
            'user' => (string)($job['user'] ?? ''),
            'folder' => $targetFolder,
            'from' => $sourceFolder,
            'to' => $targetFolder,
        ]);
    }

    $job['current'] = null;
    $job['endedAt'] = time();
    $save();
    exit(0);
} catch (\Throwable $e) {
    $job['status'] = 'error';
    $job['phase'] = 'error';
    $job['error'] = $e->getMessage();
    $job['errors'][] = $e->getMessage();
    $job['current'] = null;
    $job['endedAt'] = time();
    $save();
    @file_put_contents($logFile, '[' . date('c') . '] error: ' . $e->getMessage() . "\n", FILE_APPEND);
    exit(0);
}
