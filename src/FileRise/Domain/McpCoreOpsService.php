<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageAdapterInterface;
use FileRise\Storage\StorageRegistry;
use FileRise\Support\ACL;
use RuntimeException;
use Throwable;

/**
 * Guarded Core seam for Pro MCP runtime file/folder operations.
 *
 * This service intentionally enforces ACL and bounded request caps before
 * delegating to Core models.
 */
final class McpCoreOpsService
{
    private const DEFAULT_FOLDER_LIMIT = 200;
    private const MAX_FOLDER_LIMIT = 500;
    private const DEFAULT_FILE_PAGE_SIZE = 100;
    private const MAX_FILE_PAGE_SIZE = 200;
    private const DEFAULT_FAST_SCAN_CAP = 5000;
    private const MAX_FAST_SCAN_CAP = 20000;
    private const FAST_LIST_CACHE_TTL_SECONDS = 20;
    private const DEFAULT_READ_FILE_PREVIEW_BYTES = 8192;
    private const MAX_READ_FILE_PREVIEW_BYTES = 65536;
    private const MAX_READ_FILE_SIZE_BYTES = 2097152;
    private const MAX_BULK_FILES = 200;
    private const MAX_TAGS_PER_FILE = 50;
    private const MAX_TAG_NAME_CHARS = 64;
    private const MAX_TAG_COLOR_CHARS = 32;

    /**
     * @return array<string,array<string,mixed>>
     */
    public static function describeOperations(): array
    {
        $ops = [];
        foreach (self::operationRegistry() as $name => $meta) {
            $ops[$name] = [
                'name' => $name,
                'title' => (string)($meta['title'] ?? $name),
                'description' => (string)($meta['description'] ?? ''),
                'mutating' => !empty($meta['mutating']),
                'bulk' => !empty($meta['bulk']),
                'scopeFields' => isset($meta['scopeFields']) && is_array($meta['scopeFields'])
                    ? array_values($meta['scopeFields'])
                    : [],
                'args' => isset($meta['args']) && is_array($meta['args'])
                    ? array_values($meta['args'])
                    : [],
                'examples' => isset($meta['examples']) && is_array($meta['examples'])
                    ? array_values($meta['examples'])
                    : [],
            ];
        }

        return $ops;
    }

    /**
     * Dispatch one guarded operation.
     *
     * @param array<string,mixed> $payload
     * @param array<string,mixed> $authContext
     * @return array<string,mixed>
     */
    public static function dispatch(string $operation, array $payload = [], array $authContext = []): array
    {
        try {
            self::ensureBootstrap();
            $ctx = McpOpsContext::fromAuthPayload($authContext);
            $op = self::normalizeOperation($operation);

            switch ($op) {
                case 'list_folders':
                case 'list_children':
                    return self::opListFolders($ctx, $payload);
                case 'list_files':
                    return self::opListFiles($ctx, $payload);
                case 'read_file':
                    return self::opReadFile($ctx, $payload);
                case 'create_file':
                    return self::opCreateFile($ctx, $payload);
                case 'create_folder':
                    return self::opCreateFolder($ctx, $payload);
                case 'copy_files':
                    return self::opCopyFiles($ctx, $payload);
                case 'move_files':
                    return self::opMoveFiles($ctx, $payload);
                case 'rename_file':
                    return self::opRenameFile($ctx, $payload);
                case 'move_folder':
                case 'move_folders':
                    return self::opMoveFolder($ctx, $payload);
                case 'delete_files':
                    return self::opDeleteFiles($ctx, $payload);
                case 'delete_folder':
                    return self::opDeleteFolder($ctx, $payload);
                case 'save_file_tag':
                    return self::opSaveFileTag($ctx, $payload);
                case 'get_file_tags':
                    return self::opGetFileTags($ctx, $payload);
                default:
                    throw new RuntimeException(
                        'Unsupported MCP core operation. raw=' . trim($operation) . ' normalized=' . $op,
                        400
                    );
            }
        } catch (RuntimeException $e) {
            $status = (int)$e->getCode();
            if ($status < 400 || $status > 599) {
                $status = 400;
            }
            return [
                'ok' => false,
                'error' => $e->getMessage(),
                'status' => $status,
            ];
        } catch (Throwable $e) {
            error_log('McpCoreOpsService::dispatch error: ' . $e->getMessage());
            return [
                'ok' => false,
                'error' => 'Internal error',
                'status' => 500,
            ];
        }
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opListFolders(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, false, function () use ($ctx, $payload): array {
            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $username = $ctx->username();
            $perms = $ctx->permissions();

            if ($folder !== 'root' && !self::canViewFolder($ctx, $folder)) {
                throw new RuntimeException('Forbidden: no view access to this folder.', 403);
            }

            $needScope = ACL::canRead($username, $perms, $folder) ? 'read' : 'read_own';
            self::assertFolderScope($ctx, $folder, $needScope);

            $limit = self::boundedInt(
                $payload['limit'] ?? self::DEFAULT_FOLDER_LIMIT,
                1,
                self::MAX_FOLDER_LIMIT,
                self::DEFAULT_FOLDER_LIMIT
            );
            $cursorRaw = trim((string)($payload['cursor'] ?? ''));
            $cursor = ($cursorRaw === '') ? null : $cursorRaw;
            $probe = self::truthy($payload['probe'] ?? false);

            $result = FolderModel::listChildren($folder, $username, $perms, $cursor, $limit, $probe);

            return [
                'ok' => true,
                'folder' => $folder,
                'limit' => $limit,
                'items' => isset($result['items']) && is_array($result['items']) ? array_values($result['items']) : [],
                'nextCursor' => isset($result['nextCursor']) && $result['nextCursor'] !== null
                    ? (string)$result['nextCursor']
                    : null,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opListFiles(McpOpsContext $ctx, array $payload): array
    {
        $mode = strtolower(trim((string)($payload['mode'] ?? 'fast')));
        if ($mode === 'full') {
            return self::opListFilesFull($ctx, $payload);
        }
        return self::opListFilesFast($ctx, $payload);
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opListFilesFull(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, false, function () use ($ctx, $payload): array {
            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $username = $ctx->username();
            $perms = $ctx->permissions();

            $fullView = ACL::canRead($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            $ownOnlyGrant = ACL::hasGrant($username, $folder, 'read_own');

            if ($folder !== 'root' && !$fullView && !$ownOnlyGrant) {
                throw new RuntimeException('Forbidden: no view access to this folder.', 403);
            }

            if ($folder === 'root' && !$fullView && !$ownOnlyGrant) {
                return [
                    'ok' => true,
                    'folder' => 'root',
                    'files' => [],
                    'globalTags' => [],
                    'paging' => null,
                    'uiHints' => [
                        'noAccessRoot' => true,
                    ],
                ];
            }

            self::assertFolderScope($ctx, $folder, $fullView ? 'read' : 'read_own');

            $pageSize = self::boundedInt(
                $payload['pageSize'] ?? ($payload['limit'] ?? self::DEFAULT_FILE_PAGE_SIZE),
                1,
                self::MAX_FILE_PAGE_SIZE,
                self::DEFAULT_FILE_PAGE_SIZE
            );
            $cursor = trim((string)($payload['cursor'] ?? ''));

            $sortBy = strtolower(trim((string)($payload['sortBy'] ?? '')));
            if (!in_array($sortBy, ['name', 'modified', 'uploaded', 'size', 'uploader'], true)) {
                $sortBy = 'modified';
            }
            $sortDir = strtolower(trim((string)($payload['sortDir'] ?? '')));
            if ($sortDir !== 'asc' && $sortDir !== 'desc') {
                $sortDir = ($sortBy === 'name' || $sortBy === 'uploader') ? 'asc' : 'desc';
            }

            $options = [
                'includeContent' => false,
                'pageSize' => $pageSize,
                'sortBy' => $sortBy,
                'sortDir' => $sortDir,
            ];
            if ($cursor !== '') {
                $options['cursor'] = $cursor;
            }
            if (!$fullView && $ownOnlyGrant) {
                $options['uploaderExact'] = $username;
            }

            $result = FileModel::getFileList($folder, $options);
            if (!is_array($result)) {
                throw new RuntimeException('File listing failed.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'files' => isset($result['files']) && is_array($result['files'])
                    ? array_values($result['files'])
                    : [],
                'globalTags' => isset($result['globalTags']) && is_array($result['globalTags'])
                    ? array_values($result['globalTags'])
                    : [],
                'paging' => is_array($result['paging'] ?? null) ? $result['paging'] : null,
                'sourceId' => (string)($result['sourceId'] ?? ''),
                'mode' => 'full',
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opListFilesFast(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, false, function () use ($ctx, $payload): array {
            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $username = $ctx->username();
            $perms = $ctx->permissions();

            $fullView = ACL::canRead($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            $ownOnlyGrant = ACL::hasGrant($username, $folder, 'read_own');

            if ($folder !== 'root' && !$fullView && !$ownOnlyGrant) {
                throw new RuntimeException('Forbidden: no view access to this folder.', 403);
            }

            if ($folder === 'root' && !$fullView && !$ownOnlyGrant) {
                return [
                    'ok' => true,
                    'folder' => 'root',
                    'files' => [],
                    'globalTags' => [],
                    'paging' => null,
                    'mode' => 'fast',
                    'uiHints' => [
                        'noAccessRoot' => true,
                    ],
                ];
            }

            self::assertFolderScope($ctx, $folder, $fullView ? 'read' : 'read_own');

            $sortBy = strtolower(trim((string)($payload['sortBy'] ?? 'name')));
            if (!in_array($sortBy, ['name', 'modified', 'uploaded', 'size', 'uploader'], true)) {
                $sortBy = 'name';
            }
            $sortDir = strtolower(trim((string)($payload['sortDir'] ?? 'asc')));
            if ($sortDir !== 'asc' && $sortDir !== 'desc') {
                $sortDir = ($sortBy === 'name' || $sortBy === 'uploader') ? 'asc' : 'desc';
            }
            $scanCap = self::boundedInt(
                $payload['scanCap'] ?? self::DEFAULT_FAST_SCAN_CAP,
                self::MAX_FILE_PAGE_SIZE,
                self::MAX_FAST_SCAN_CAP,
                self::DEFAULT_FAST_SCAN_CAP
            );

            $pageSize = self::boundedInt(
                $payload['pageSize'] ?? ($payload['limit'] ?? self::DEFAULT_FILE_PAGE_SIZE),
                1,
                self::MAX_FILE_PAGE_SIZE,
                self::DEFAULT_FILE_PAGE_SIZE
            );
            $cursorRaw = trim((string)($payload['cursor'] ?? ''));
            $offset = ctype_digit($cursorRaw) ? (int)$cursorRaw : 0;
            if ($offset < 0) {
                $offset = 0;
            }

            $storage = StorageRegistry::getAdapter();
            $baseDir = rtrim(SourceContext::uploadRoot(), '/\\');
            $dir = ($folder === 'root')
                ? $baseDir
                : $baseDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);

            $dirStat = $storage->stat($dir);
            if ($dirStat === null || ($dirStat['type'] ?? '') !== 'dir') {
                throw new RuntimeException('Directory not found.', 400);
            }

            $all = [];
            $ownOnly = (!$fullView && $ownOnlyGrant);
            $dirMtime = (int)($dirStat['mtime'] ?? 0);
            $cachedFast = ['hit' => false, 'names' => []];
            if ($sortBy === 'name') {
                $cachedFast = self::loadFastListNameCache(
                    $folder,
                    $username,
                    $ownOnly,
                    $sortDir,
                    $scanCap,
                    $dirMtime
                );
            }
            if ($sortBy !== 'name' || empty($cachedFast['hit'])) {
                $entryProbe = self::listDirectoryEntriesBounded($storage, $dir, $scanCap);
                if (!empty($entryProbe['truncated'])) {
                    throw new RuntimeException(
                        'Folder exceeds MCP fast-list scan cap; narrow scope or raise scanCap'
                        . ' (max ' . self::MAX_FAST_SCAN_CAP . ').',
                        413
                    );
                }
                $all = $entryProbe['entries'];
            }

            $meta = self::loadFolderMetadata($folder);
            $parseUploadedTs = static function (string $value): int {
                $value = trim($value);
                if ($value === '' || strcasecmp($value, 'Unknown') === 0) {
                    return 0;
                }
                $ts = @strtotime($value);
                return ($ts === false) ? 0 : (int)$ts;
            };

            // Fast-path for name-sorted paging: avoid full per-file enrichment across
            // the entire folder and only hydrate the requested page.
            if ($sortBy === 'name') {
                $nameRows = [];
                if (!empty($cachedFast['hit']) && is_array($cachedFast['names'] ?? null)) {
                    $nameRows = array_values($cachedFast['names']);
                } else {
                    foreach ($all as $entry) {
                        $name = trim((string)$entry);
                        if ($name === '' || $name === '.' || $name === '..' || $name[0] === '.') {
                            continue;
                        }
                        if (!preg_match((string)REGEX_FILE_NAME, $name)) {
                            continue;
                        }

                        $uploader = isset($meta[$name]['uploader']) ? (string)$meta[$name]['uploader'] : 'Unknown';
                        if ($ownOnly && strcasecmp($uploader, $username) !== 0) {
                            continue;
                        }

                        $filePath = $dir . DIRECTORY_SEPARATOR . $name;
                        $isFile = false;
                        if ($storage->isLocal()) {
                            $isFile = @is_file($filePath);
                        } else {
                            $probeStat = $storage->stat($filePath);
                            $isFile = ($probeStat !== null && ($probeStat['type'] ?? '') === 'file');
                        }
                        if (!$isFile) {
                            continue;
                        }

                        $nameRows[] = $name;
                    }

                    if (!empty($nameRows)) {
                        $dirFactor = ($sortDir === 'asc') ? 1 : -1;
                        usort(
                            $nameRows,
                            static function (string $a, string $b) use ($dirFactor): int {
                                $an = strtolower($a);
                                $bn = strtolower($b);
                                $cmp = strnatcasecmp($an, $bn);
                                if ($cmp === 0) {
                                    $cmp = strcmp($an, $bn);
                                }
                                return $cmp * $dirFactor;
                            }
                        );
                    }

                    self::saveFastListNameCache($folder, $username, $ownOnly, $sortDir, $scanCap, $dirMtime, $nameRows);
                }

                $totalFiles = count($nameRows);
                if ($offset > $totalFiles) {
                    if ($totalFiles > 0) {
                        $offset = (int)(floor(($totalFiles - 1) / $pageSize) * $pageSize);
                    } else {
                        $offset = 0;
                    }
                }

                $files = [];
                $scanIndex = $offset;
                while ($scanIndex < $totalFiles && count($files) < $pageSize) {
                    $name = (string)$nameRows[$scanIndex];
                    $scanIndex++;

                    if ($name === '') {
                        continue;
                    }
                    $filePath = $dir . DIRECTORY_SEPARATOR . $name;
                    $stat = $storage->stat($filePath);
                    if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                        continue;
                    }

                    $mtime = (int)($stat['mtime'] ?? 0);
                    $uploaded = isset($meta[$name]['uploaded']) ? (string)$meta[$name]['uploaded'] : '';
                    $modified = $mtime > 0 ? date((string)DATE_TIME_FORMAT, $mtime) : '';
                    if ($uploaded === '' && $modified !== '') {
                        $uploaded = $modified;
                    }
                    if ($uploaded === '') {
                        $uploaded = 'Unknown';
                    }
                    if ($modified === '') {
                        $modified = 'Unknown';
                    }

                    $tags = [];
                    if (isset($meta[$name]['tags']) && is_array($meta[$name]['tags'])) {
                        $tags = self::normalizeTags($meta[$name]['tags']);
                    }

                    $sizeBytes = (int)($stat['size'] ?? 0);
                    $uploader = isset($meta[$name]['uploader']) ? (string)$meta[$name]['uploader'] : 'Unknown';
                    $files[] = [
                        'name' => $name,
                        'modified' => $modified,
                        'uploaded' => $uploaded,
                        'size' => self::formatBytes($sizeBytes),
                        'sizeBytes' => $sizeBytes,
                        'uploader' => $uploader,
                        'tags' => $tags,
                        'sourceId' => SourceContext::getActiveId(),
                    ];
                }

                $nextOffset = null;
                if ($scanIndex < $totalFiles) {
                    $nextOffset = $scanIndex;
                }
                $prevOffset = $offset > 0 ? max(0, $offset - $pageSize) : null;
                $totalPages = max(1, (int)ceil($totalFiles / $pageSize));
                $currentPage = (int)floor($offset / $pageSize) + 1;
                if ($currentPage > $totalPages) {
                    $currentPage = $totalPages;
                }

                return [
                    'ok' => true,
                    'folder' => $folder,
                    'files' => $files,
                    'globalTags' => FileModel::getFileTags(),
                    'sourceId' => SourceContext::getActiveId(),
                    'mode' => 'fast',
                    'paging' => [
                        'mode' => 'cursor',
                        'cursor' => (string)$offset,
                        'nextCursor' => ($nextOffset === null) ? null : (string)$nextOffset,
                        'prevCursor' => ($prevOffset === null) ? null : (string)$prevOffset,
                        'hasMore' => $nextOffset !== null,
                        'limit' => $pageSize,
                        'total' => $totalFiles,
                        'page' => $currentPage,
                        'totalPages' => $totalPages,
                        'sortBy' => $sortBy,
                        'sortDir' => $sortDir,
                        'scanCap' => $scanCap,
                    ],
                ];
            }

            $items = [];
            foreach ($all as $entry) {
                $name = trim((string)$entry);
                if ($name === '' || $name === '.' || $name === '..' || $name[0] === '.') {
                    continue;
                }
                if (!preg_match((string)REGEX_FILE_NAME, $name)) {
                    continue;
                }

                $filePath = $dir . DIRECTORY_SEPARATOR . $name;
                $stat = $storage->stat($filePath);
                if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                    continue;
                }

                $mtime = (int)($stat['mtime'] ?? 0);
                $uploaded = isset($meta[$name]['uploaded']) ? (string)$meta[$name]['uploaded'] : '';
                $modified = $mtime > 0 ? date((string)DATE_TIME_FORMAT, $mtime) : '';
                if ($uploaded === '' && $modified !== '') {
                    $uploaded = $modified;
                }
                if ($uploaded === '') {
                    $uploaded = 'Unknown';
                }
                if ($modified === '') {
                    $modified = 'Unknown';
                }

                $uploader = isset($meta[$name]['uploader']) ? (string)$meta[$name]['uploader'] : 'Unknown';
                if (!$fullView && $ownOnlyGrant && strcasecmp($uploader, $username) !== 0) {
                    continue;
                }

                $tags = [];
                if (isset($meta[$name]['tags']) && is_array($meta[$name]['tags'])) {
                    $tags = self::normalizeTags($meta[$name]['tags']);
                }

                $sizeBytes = (int)($stat['size'] ?? 0);
                $items[] = [
                    'name' => $name,
                    'modified' => $modified,
                    'uploaded' => $uploaded,
                    'size' => self::formatBytes($sizeBytes),
                    'sizeBytes' => $sizeBytes,
                    'uploader' => $uploader,
                    'tags' => $tags,
                    'sourceId' => SourceContext::getActiveId(),
                    '_sort_name' => strtolower($name),
                    '_sort_size' => $sizeBytes,
                    '_sort_uploader' => strtolower($uploader),
                    '_sort_modified' => $mtime,
                    '_sort_uploaded' => $parseUploadedTs($uploaded),
                ];
            }

            if (!empty($items)) {
                $dirFactor = ($sortDir === 'asc') ? 1 : -1;
                usort(
                    $items,
                    static function (array $a, array $b) use ($sortBy, $dirFactor): int {
                        $cmp = 0;
                        switch ($sortBy) {
                            case 'uploader':
                                $cmp = strnatcasecmp(
                                    (string)($a['_sort_uploader'] ?? ''),
                                    (string)($b['_sort_uploader'] ?? '')
                                );
                                break;
                            case 'size':
                                $cmp = ((int)($a['_sort_size'] ?? 0)) <=> ((int)($b['_sort_size'] ?? 0));
                                break;
                            case 'uploaded':
                                $cmp = ((int)($a['_sort_uploaded'] ?? 0)) <=> ((int)($b['_sort_uploaded'] ?? 0));
                                break;
                            case 'modified':
                                $cmp = ((int)($a['_sort_modified'] ?? 0)) <=> ((int)($b['_sort_modified'] ?? 0));
                                break;
                            case 'name':
                            default:
                                $cmp = strnatcasecmp(
                                    (string)($a['_sort_name'] ?? ''),
                                    (string)($b['_sort_name'] ?? '')
                                );
                                break;
                        }
                        if ($cmp === 0) {
                            $cmp = strnatcasecmp((string)($a['_sort_name'] ?? ''), (string)($b['_sort_name'] ?? ''));
                        }
                        return $cmp * $dirFactor;
                    }
                );
            }

            $totalFiles = count($items);
            if ($offset > $totalFiles) {
                if ($totalFiles > 0) {
                    $offset = (int)(floor(($totalFiles - 1) / $pageSize) * $pageSize);
                } else {
                    $offset = 0;
                }
            }

            $files = array_slice($items, $offset, $pageSize);
            foreach ($files as &$entry) {
                unset(
                    $entry['_sort_name'],
                    $entry['_sort_size'],
                    $entry['_sort_uploader'],
                    $entry['_sort_modified'],
                    $entry['_sort_uploaded']
                );
            }
            unset($entry);

            $nextOffset = null;
            if ($offset + count($files) < $totalFiles) {
                $nextOffset = $offset + count($files);
            }
            $prevOffset = $offset > 0 ? max(0, $offset - $pageSize) : null;
            $totalPages = max(1, (int)ceil($totalFiles / $pageSize));
            $currentPage = (int)floor($offset / $pageSize) + 1;
            if ($currentPage > $totalPages) {
                $currentPage = $totalPages;
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'files' => $files,
                'globalTags' => FileModel::getFileTags(),
                'sourceId' => SourceContext::getActiveId(),
                'mode' => 'fast',
                'paging' => [
                    'mode' => 'cursor',
                    'cursor' => (string)$offset,
                    'nextCursor' => ($nextOffset === null) ? null : (string)$nextOffset,
                    'prevCursor' => ($prevOffset === null) ? null : (string)$prevOffset,
                    'hasMore' => $nextOffset !== null,
                    'limit' => $pageSize,
                    'total' => $totalFiles,
                    'page' => $currentPage,
                    'totalPages' => $totalPages,
                    'sortBy' => $sortBy,
                    'sortDir' => $sortDir,
                    'scanCap' => $scanCap,
                ],
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opReadFile(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, false, function () use ($ctx, $payload): array {
            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $file = self::normalizeFileName((string)($payload['file'] ?? ($payload['filename'] ?? '')));
            $maxBytes = self::boundedInt(
                $payload['maxBytes'] ?? self::DEFAULT_READ_FILE_PREVIEW_BYTES,
                256,
                self::MAX_READ_FILE_PREVIEW_BYTES,
                self::DEFAULT_READ_FILE_PREVIEW_BYTES
            );

            $username = $ctx->username();
            $perms = $ctx->permissions();

            $fullView = ACL::canRead($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            $ownOnlyGrant = ACL::hasGrant($username, $folder, 'read_own');
            if (!$fullView && !$ownOnlyGrant) {
                throw new RuntimeException('Forbidden: no view access to this folder.', 403);
            }

            self::assertFolderScope($ctx, $folder, $fullView ? 'read' : 'read_own');

            if (
                !$ctx->canBypassOwnership()
                && !$fullView
                && $ownOnlyGrant
            ) {
                self::assertFilesOwnedByUser($folder, [$file], $username);
            }

            $storage = StorageRegistry::getAdapter();
            $baseDir = rtrim(SourceContext::uploadRoot(), '/\\');
            $dir = ($folder === 'root')
                ? $baseDir
                : $baseDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
            $path = $dir . DIRECTORY_SEPARATOR . $file;

            $stat = $storage->stat($path);
            if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                throw new RuntimeException('File not found.', 404);
            }

            $size = max(0, (int)($stat['size'] ?? 0));
            if ($size > self::MAX_READ_FILE_SIZE_BYTES) {
                throw new RuntimeException('File is too large for AI text preview.', 413);
            }

            $raw = $storage->read($path, $maxBytes, 0);
            if (!is_string($raw)) {
                throw new RuntimeException('Failed to read file.', 500);
            }
            if ($raw !== '' && strpos($raw, "\0") !== false) {
                throw new RuntimeException('File appears to be binary; text preview is unavailable.', 415);
            }

            $content = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $raw);
            if (!is_string($content)) {
                $content = $raw;
            }
            $truncated = ($size > strlen($raw));

            return [
                'ok' => true,
                'folder' => $folder,
                'file' => $file,
                'content' => $content,
                'size' => $size,
                'maxBytes' => $maxBytes,
                'truncated' => $truncated,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opCreateFile(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, true, function () use ($ctx, $payload): array {
            self::assertWritableAccount($ctx, false);

            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $fileName = self::normalizeFileName(
                (string)($payload['name'] ?? ($payload['file'] ?? ($payload['filename'] ?? '')))
            );

            $username = $ctx->username();
            $perms = $ctx->permissions();

            $canCreate = ACL::canCreate($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            if (!$canCreate) {
                throw new RuntimeException('Forbidden: no create permission.', 403);
            }

            self::assertFolderScope($ctx, $folder, 'create');

            $result = FileModel::createFile($folder, $fileName, $username);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to create file.', 500);
            }
            if (empty($result['success'])) {
                $status = (int)($result['code'] ?? 400);
                if ($status < 400 || $status > 599) {
                    $status = 400;
                }
                throw new RuntimeException((string)($result['error'] ?? 'Failed to create file.'), $status);
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'file' => $fileName,
                'result' => $result,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opCreateFolder(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, true, function () use ($ctx, $payload): array {
            self::assertWritableAccount($ctx, false);

            $parent = self::normalizeFolder((string)($payload['parent'] ?? 'root'));
            $folderName = trim((string)($payload['folderName'] ?? ($payload['name'] ?? '')));
            if ($folderName === '' || !preg_match((string)REGEX_FOLDER_NAME, $folderName)) {
                throw new RuntimeException('Invalid folder name.', 400);
            }

            $username = $ctx->username();
            $perms = $ctx->permissions();

            $canCreate = ACL::canCreateFolder($username, $perms, $parent)
                || ACL::ownsFolderOrAncestor($username, $perms, $parent);
            if (!$canCreate) {
                throw new RuntimeException('Forbidden: manager/owner required on parent.', 403);
            }

            self::assertFolderScope($ctx, $parent, 'manage');

            $result = FolderModel::createFolder($folderName, $parent, $username);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to create folder.', 500);
            }
            if (empty($result['success'])) {
                throw new RuntimeException((string)($result['error'] ?? 'Failed to create folder.'), 400);
            }

            $newFolder = ($parent === 'root') ? $folderName : ($parent . '/' . $folderName);

            return [
                'ok' => true,
                'parent' => $parent,
                'folder' => $newFolder,
                'name' => $folderName,
                'result' => $result,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opCopyFiles(McpOpsContext $ctx, array $payload): array
    {
        self::assertWritableAccount($ctx, true);

        $sourceFolder = self::normalizeFolder((string)($payload['source'] ?? 'root'));
        $destinationFolder = self::normalizeFolder((string)($payload['destination'] ?? 'root'));
        $files = self::normalizeFileList($payload['files'] ?? []);

        $sourcePair = self::resolveSourcePair($payload);
        $sourceId = $sourcePair['sourceId'];
        $destSourceId = $sourcePair['destSourceId'];
        $crossSource = $sourcePair['crossSource'];

        if ($crossSource && (!class_exists(SourceContext::class) || !SourceContext::sourcesEnabled())) {
            throw new RuntimeException('Cross-source operations require sources to be enabled.', 400);
        }

        if ($crossSource) {
            if ($sourceId === '' || $destSourceId === '') {
                throw new RuntimeException('Cross-source copy requires both source ids.', 400);
            }

            $username = $ctx->username();
            $perms = $ctx->permissions();

            self::withSourceContext(
                $ctx,
                ['sourceId' => $sourceId],
                true,
                function () use ($ctx, $sourceFolder, $files, $username, $perms): array {
                    $hasSourceView = ACL::canReadOwn($username, $perms, $sourceFolder)
                        || ACL::ownsFolderOrAncestor($username, $perms, $sourceFolder);
                    if (!$hasSourceView) {
                        throw new RuntimeException('Forbidden: no read access to source.', 403);
                    }

                    $needScope = ACL::canRead($username, $perms, $sourceFolder) ? 'read' : 'read_own';
                    self::assertFolderScope($ctx, $sourceFolder, $needScope);

                    if (
                        !$ctx->canBypassOwnership()
                        && !ACL::canRead($username, $perms, $sourceFolder)
                        && ACL::hasGrant($username, $sourceFolder, 'read_own')
                    ) {
                        self::assertFilesOwnedByUser($sourceFolder, $files, $username);
                    }

                    return ['ok' => true];
                }
            );

            self::withSourceContext(
                $ctx,
                ['sourceId' => $destSourceId],
                true,
                function () use ($ctx, $destinationFolder, $username, $perms): array {
                    $hasDestCopy = ACL::canCopy($username, $perms, $destinationFolder)
                        || ACL::ownsFolderOrAncestor($username, $perms, $destinationFolder);
                    if (!$hasDestCopy) {
                        throw new RuntimeException('Forbidden: no copy permission on destination.', 403);
                    }

                    self::assertFolderScope($ctx, $destinationFolder, 'copy');
                    return ['ok' => true];
                }
            );

            $encErr = self::crossSourceEncryptedError(
                $ctx,
                $sourceId,
                $sourceFolder,
                $destSourceId,
                $destinationFolder
            );
            if ($encErr !== null) {
                throw new RuntimeException($encErr, 400);
            }

            $result = FileModel::copyFilesAcrossSources(
                $sourceId,
                $destSourceId,
                $sourceFolder,
                $destinationFolder,
                $files
            );
            if (!is_array($result)) {
                throw new RuntimeException('Failed to copy files across sources.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            return [
                'ok' => true,
                'source' => $sourceFolder,
                'destination' => $destinationFolder,
                'files' => $files,
                'sourceId' => $sourceId,
                'destSourceId' => $destSourceId,
                'crossSource' => true,
                'result' => $result,
            ];
        }

        $singlePayload = $payload;
        if ($sourceId !== '') {
            $singlePayload['sourceId'] = $sourceId;
        }

        return self::withSourceContext(
            $ctx,
            $singlePayload,
            true,
            function () use ($ctx, $sourceFolder, $destinationFolder, $files): array {
                $username = $ctx->username();
                $perms = $ctx->permissions();

                $hasSourceView = ACL::canReadOwn($username, $perms, $sourceFolder)
                    || ACL::ownsFolderOrAncestor($username, $perms, $sourceFolder);
                if (!$hasSourceView) {
                    throw new RuntimeException('Forbidden: no read access to source.', 403);
                }

                $hasDestCopy = ACL::canCopy($username, $perms, $destinationFolder)
                    || ACL::ownsFolderOrAncestor($username, $perms, $destinationFolder);
                if (!$hasDestCopy) {
                    throw new RuntimeException('Forbidden: no copy permission on destination.', 403);
                }

                $needScope = ACL::canRead($username, $perms, $sourceFolder) ? 'read' : 'read_own';
                self::assertFolderScope($ctx, $sourceFolder, $needScope);
                self::assertFolderScope($ctx, $destinationFolder, 'copy');

                if (
                    !$ctx->canBypassOwnership()
                    && !ACL::canRead($username, $perms, $sourceFolder)
                    && ACL::hasGrant($username, $sourceFolder, 'read_own')
                ) {
                    self::assertFilesOwnedByUser($sourceFolder, $files, $username);
                }

                $result = FileModel::copyFiles($sourceFolder, $destinationFolder, $files);
                if (!is_array($result)) {
                    throw new RuntimeException('Failed to copy files.', 500);
                }
                if (isset($result['error'])) {
                    throw new RuntimeException((string)$result['error'], 400);
                }

                return [
                    'ok' => true,
                    'source' => $sourceFolder,
                    'destination' => $destinationFolder,
                    'files' => $files,
                    'result' => $result,
                ];
            }
        );
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opMoveFiles(McpOpsContext $ctx, array $payload): array
    {
        self::assertWritableAccount($ctx, true);

        $sourceFolder = self::normalizeFolder((string)($payload['source'] ?? 'root'));
        $destinationFolder = self::normalizeFolder((string)($payload['destination'] ?? 'root'));
        $files = self::normalizeFileList($payload['files'] ?? []);

        $sourcePair = self::resolveSourcePair($payload);
        $sourceId = $sourcePair['sourceId'];
        $destSourceId = $sourcePair['destSourceId'];
        $crossSource = $sourcePair['crossSource'];

        if ($crossSource && (!class_exists(SourceContext::class) || !SourceContext::sourcesEnabled())) {
            throw new RuntimeException('Cross-source operations require sources to be enabled.', 400);
        }

        if ($crossSource) {
            return self::opMoveFilesCrossSource(
                $ctx,
                $sourceFolder,
                $destinationFolder,
                $files,
                $sourceId,
                $destSourceId
            );
        }

        $singlePayload = $payload;
        if ($sourceId !== '') {
            $singlePayload['sourceId'] = $sourceId;
        }

        return self::withSourceContext(
            $ctx,
            $singlePayload,
            true,
            function () use ($ctx, $sourceFolder, $destinationFolder, $files): array {
                $username = $ctx->username();
                $perms = $ctx->permissions();

                $hasSourceView = ACL::canReadOwn($username, $perms, $sourceFolder)
                || ACL::ownsFolderOrAncestor($username, $perms, $sourceFolder);
                if (!$hasSourceView) {
                    throw new RuntimeException('Forbidden: no read access to source.', 403);
                }

                $hasSourceDelete = ACL::canDelete($username, $perms, $sourceFolder)
                || ACL::ownsFolderOrAncestor($username, $perms, $sourceFolder);
                if (!$hasSourceDelete) {
                    throw new RuntimeException('Forbidden: no delete permission on source.', 403);
                }

                $hasDestMove = ACL::canMove($username, $perms, $destinationFolder)
                || ACL::ownsFolderOrAncestor($username, $perms, $destinationFolder);
                if (!$hasDestMove) {
                    throw new RuntimeException('Forbidden: no move permission on destination.', 403);
                }

                self::assertFolderScope($ctx, $sourceFolder, 'delete');
                self::assertFolderScope($ctx, $destinationFolder, 'move');

                if (
                    !$ctx->canBypassOwnership()
                    && !ACL::canRead($username, $perms, $sourceFolder)
                    && ACL::hasGrant($username, $sourceFolder, 'read_own')
                ) {
                    self::assertFilesOwnedByUser($sourceFolder, $files, $username);
                }

                $result = FileModel::moveFiles($sourceFolder, $destinationFolder, $files);
                if (!is_array($result)) {
                    throw new RuntimeException('Failed to move files.', 500);
                }
                if (isset($result['error'])) {
                    throw new RuntimeException((string)$result['error'], 400);
                }

                return [
                    'ok' => true,
                    'source' => $sourceFolder,
                    'destination' => $destinationFolder,
                    'files' => $files,
                    'result' => $result,
                ];
            }
        );
    }

    /**
     * @param array<int,string> $files
     * @return array<string,mixed>
     */
    private static function opMoveFilesCrossSource(
        McpOpsContext $ctx,
        string $sourceFolder,
        string $destinationFolder,
        array $files,
        string $sourceId,
        string $destSourceId
    ): array {
        if ($sourceId === '' || $destSourceId === '') {
            throw new RuntimeException('Cross-source move requires both source ids.', 400);
        }

        $username = $ctx->username();
        $perms = $ctx->permissions();

        self::withSourceContext(
            $ctx,
            ['sourceId' => $sourceId],
            true,
            function () use ($ctx, $sourceFolder, $files, $username, $perms): array {
                $hasSourceView = ACL::canReadOwn($username, $perms, $sourceFolder)
                || ACL::ownsFolderOrAncestor($username, $perms, $sourceFolder);
                if (!$hasSourceView) {
                    throw new RuntimeException('Forbidden: no read access to source.', 403);
                }

                $hasSourceDelete = ACL::canDelete($username, $perms, $sourceFolder)
                || ACL::ownsFolderOrAncestor($username, $perms, $sourceFolder);
                if (!$hasSourceDelete) {
                    throw new RuntimeException('Forbidden: no delete permission on source.', 403);
                }

                self::assertFolderScope($ctx, $sourceFolder, 'delete');

                if (
                    !$ctx->canBypassOwnership()
                    && !ACL::canRead($username, $perms, $sourceFolder)
                    && ACL::hasGrant($username, $sourceFolder, 'read_own')
                ) {
                    self::assertFilesOwnedByUser($sourceFolder, $files, $username);
                }

                return ['ok' => true];
            }
        );

        self::withSourceContext(
            $ctx,
            ['sourceId' => $destSourceId],
            true,
            function () use ($ctx, $destinationFolder, $username, $perms): array {
                $hasDestMove = ACL::canMove($username, $perms, $destinationFolder)
                || ACL::ownsFolderOrAncestor($username, $perms, $destinationFolder);
                if (!$hasDestMove) {
                    throw new RuntimeException('Forbidden: no move permission on destination.', 403);
                }

                self::assertFolderScope($ctx, $destinationFolder, 'move');
                return ['ok' => true];
            }
        );

        $encErr = self::crossSourceEncryptedError(
            $ctx,
            $sourceId,
            $sourceFolder,
            $destSourceId,
            $destinationFolder
        );
        if ($encErr !== null) {
            throw new RuntimeException($encErr, 400);
        }

        $result = FileModel::moveFilesAcrossSources(
            $sourceId,
            $destSourceId,
            $sourceFolder,
            $destinationFolder,
            $files
        );
        if (!is_array($result)) {
            throw new RuntimeException('Failed to move files across sources.', 500);
        }
        if (isset($result['error'])) {
            throw new RuntimeException((string)$result['error'], 400);
        }

        return [
            'ok' => true,
            'source' => $sourceFolder,
            'destination' => $destinationFolder,
            'files' => $files,
            'sourceId' => $sourceId,
            'destSourceId' => $destSourceId,
            'crossSource' => true,
            'result' => $result,
        ];
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opRenameFile(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, true, function () use ($ctx, $payload): array {
            self::assertWritableAccount($ctx, false);

            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $oldName = self::normalizeFileName((string)($payload['oldName'] ?? ($payload['old_name'] ?? '')));
            $newName = self::normalizeFileName((string)($payload['newName'] ?? ($payload['new_name'] ?? '')));
            if (strcasecmp($oldName, $newName) === 0) {
                throw new RuntimeException('Old and new file names are the same.', 400);
            }

            $username = $ctx->username();
            $perms = $ctx->permissions();

            $hasRename = ACL::canRename($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            if (!$hasRename) {
                throw new RuntimeException('Forbidden: no rename permission.', 403);
            }

            self::assertFolderScope($ctx, $folder, 'rename');

            if (
                !$ctx->canBypassOwnership()
                && !ACL::canRead($username, $perms, $folder)
                && ACL::hasGrant($username, $folder, 'read_own')
            ) {
                self::assertFilesOwnedByUser($folder, [$oldName], $username);
            }

            $result = FileModel::renameFile($folder, $oldName, $newName);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to rename file.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            $resolvedNewName = trim((string)($result['newName'] ?? $newName));
            if ($resolvedNewName === '') {
                $resolvedNewName = $newName;
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'oldName' => $oldName,
                'newName' => $resolvedNewName,
                'result' => $result,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opMoveFolder(McpOpsContext $ctx, array $payload): array
    {
        self::assertWritableAccount($ctx, false);

        $source = self::normalizeFolder((string)($payload['source'] ?? ''));
        if ($source === '' || $source === 'root') {
            throw new RuntimeException('Invalid source folder.', 400);
        }

        $destinationRaw = trim((string)($payload['destination'] ?? 'root'));
        $destination = self::normalizeFolder($destinationRaw === '' ? 'root' : $destinationRaw);

        $mode = strtolower(trim((string)($payload['mode'] ?? 'move')));
        if ($mode !== '' && $mode !== 'move') {
            throw new RuntimeException('Unsupported mode for MCP folder move.', 400);
        }

        $sourcePair = self::resolveSourcePair($payload);
        $sourceId = $sourcePair['sourceId'];
        $destSourceId = $sourcePair['destSourceId'];
        $crossSource = $sourcePair['crossSource'];

        if ($crossSource && (!class_exists(SourceContext::class) || !SourceContext::sourcesEnabled())) {
            throw new RuntimeException('Cross-source operations require sources to be enabled.', 400);
        }

        $srcNorm = trim($source, "/\\ ");
        $dstNorm = $destination === 'root' ? '' : trim($destination, "/\\ ");
        if (
            !$crossSource
            && $dstNorm !== ''
            && (strcasecmp($dstNorm, $srcNorm) === 0 || strpos($dstNorm . '/', $srcNorm . '/') === 0)
        ) {
            throw new RuntimeException('Destination cannot be the source or its descendant.', 400);
        }

        $baseName = basename(str_replace('\\', '/', $srcNorm));
        if ($baseName === '' || !preg_match((string)REGEX_FOLDER_NAME, $baseName)) {
            throw new RuntimeException('Invalid source folder.', 400);
        }
        $target = $destination === 'root' ? $baseName : rtrim($destination, "/\\ ") . '/' . $baseName;
        $target = self::normalizeFolder($target);

        $username = $ctx->username();
        $perms = $ctx->permissions();

        if ($crossSource) {
            self::assertWritableAccount($ctx, true);
            if ($sourceId === '' || $destSourceId === '') {
                throw new RuntimeException('Cross-source move requires both source ids.', 400);
            }

            self::withSourceContext(
                $ctx,
                ['sourceId' => $sourceId],
                true,
                function () use ($ctx, $source, $username, $perms): array {
                    $canManageSource = ACL::canManage($username, $perms, $source)
                        || ACL::isOwner($username, $perms, $source);
                    if (!$canManageSource) {
                        throw new RuntimeException('Forbidden: manage rights required on source.', 403);
                    }
                    self::assertFolderScope($ctx, $source, 'manage');
                    return ['ok' => true];
                }
            );

            self::withSourceContext(
                $ctx,
                ['sourceId' => $destSourceId],
                true,
                function () use ($ctx, $destination, $username, $perms): array {
                    $canCreate = ACL::canCreate($username, $perms, $destination)
                    || ACL::ownsFolderOrAncestor($username, $perms, $destination);
                    if (!$canCreate) {
                        throw new RuntimeException('Forbidden: no write access to destination.', 403);
                    }
                    self::assertFolderScope($ctx, $destination, 'create');
                    return ['ok' => true];
                }
            );

            $encErr = self::crossSourceEncryptedError($ctx, $sourceId, $source, $destSourceId, $destination);
            if ($encErr !== null) {
                throw new RuntimeException($encErr, 400);
            }

            $result = FolderModel::moveFolderAcrossSources($sourceId, $destSourceId, $source, $target);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to move folder across sources.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            return [
                'ok' => true,
                'source' => $source,
                'destination' => $destination,
                'target' => $target,
                'sourceId' => $sourceId,
                'destSourceId' => $destSourceId,
                'crossSource' => true,
                'result' => $result,
            ];
        }

        $singlePayload = $payload;
        if ($sourceId !== '') {
            $singlePayload['sourceId'] = $sourceId;
        }

        return self::withSourceContext(
            $ctx,
            $singlePayload,
            true,
            function () use ($ctx, $source, $destination, $target, $sourceId, $username, $perms): array {
                self::assertFolderScope($ctx, $source, 'manage');
                self::assertFolderScope($ctx, $destination, 'write');

                $canManageSource = ACL::canManage($username, $perms, $source)
                    || ACL::isOwner($username, $perms, $source);
                if (!$canManageSource) {
                    throw new RuntimeException('Forbidden: manage rights required on source.', 403);
                }

                $canMoveIntoDest = ACL::canMove($username, $perms, $destination)
                    || ($destination === 'root'
                        ? $ctx->isAdmin()
                        : ACL::isOwner($username, $perms, $destination));
                if (!$canMoveIntoDest) {
                    throw new RuntimeException('Forbidden: move rights required on destination.', 403);
                }

                if (!$ctx->isAdmin()) {
                    try {
                        $ownerSrc = FolderModel::getOwnerFor($source) ?? '';
                        $ownerDst = $destination === 'root' ? '' : (FolderModel::getOwnerFor($destination) ?? '');
                        if ($ownerSrc !== $ownerDst) {
                            throw new RuntimeException('Source and destination must have the same owner.', 403);
                        }
                    } catch (RuntimeException $e) {
                        throw $e;
                    } catch (Throwable $e) {
                        // Keep controller parity: owner lookup failure does not block move.
                    }
                }

                $result = FolderModel::renameFolder($source, $target);
                if (!is_array($result)) {
                    throw new RuntimeException('Failed to move folder.', 500);
                }
                if (isset($result['error'])) {
                    throw new RuntimeException((string)$result['error'], 400);
                }

                $moveSucceeded = !isset($result['success']) || !empty($result['success']);
                $aclStats = ['changed' => false, 'moved' => 0];
                $colorStats = ['changed' => false, 'moved' => 0];

                if ($moveSucceeded) {
                    try {
                        $stats = ACL::migrateSubtree($source, $target);
                        if (is_array($stats)) {
                            $aclStats = $stats + $aclStats;
                        }
                    } catch (Throwable $e) {
                        error_log('McpCoreOpsService::opMoveFolder ACL migration warning: ' . $e->getMessage());
                    }

                    try {
                        $stats = FolderMeta::migrateSubtree($source, $target);
                        if (is_array($stats)) {
                            $colorStats = $stats + $colorStats;
                        }
                    } catch (Throwable $e) {
                        error_log('McpCoreOpsService::opMoveFolder color migration warning: ' . $e->getMessage());
                    }
                }

                $result['aclMigration'] = $aclStats + ['changed' => false, 'moved' => 0];
                $result['colorMigration'] = $colorStats + ['changed' => false, 'moved' => 0];

                return [
                    'ok' => true,
                    'source' => $source,
                    'destination' => $destination,
                    'target' => $target,
                    'sourceId' => $sourceId,
                    'crossSource' => false,
                    'result' => $result,
                ];
            }
        );
    }

    /**
     * @return array{hit:bool,names:array<int,string>}
     */
    private static function loadFastListNameCache(
        string $folder,
        string $username,
        bool $ownOnly,
        string $sortDir,
        int $scanCap,
        int $dirMtime
    ): array {
        $path = self::fastListCachePath($folder, $username, $ownOnly, $sortDir);
        if ($path === '' || !is_file($path)) {
            return ['hit' => false, 'names' => []];
        }

        $raw = @file_get_contents($path);
        if (!is_string($raw) || trim($raw) === '') {
            @unlink($path);
            return ['hit' => false, 'names' => []];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            @unlink($path);
            return ['hit' => false, 'names' => []];
        }

        $createdAt = (int)($decoded['createdAt'] ?? 0);
        if ($createdAt <= 0 || (time() - $createdAt) > self::FAST_LIST_CACHE_TTL_SECONDS) {
            @unlink($path);
            return ['hit' => false, 'names' => []];
        }

        $activeSourceId = class_exists(SourceContext::class) ? (string)SourceContext::getActiveId() : '';
        if ((string)($decoded['sourceId'] ?? '') !== $activeSourceId) {
            return ['hit' => false, 'names' => []];
        }
        if ((string)($decoded['folder'] ?? '') !== $folder) {
            return ['hit' => false, 'names' => []];
        }
        if (strcasecmp((string)($decoded['username'] ?? ''), $username) !== 0) {
            return ['hit' => false, 'names' => []];
        }
        if (!empty($decoded['ownOnly']) !== $ownOnly) {
            return ['hit' => false, 'names' => []];
        }
        if (strtolower((string)($decoded['sortDir'] ?? '')) !== strtolower($sortDir)) {
            return ['hit' => false, 'names' => []];
        }

        $cachedDirMtime = (int)($decoded['dirMtime'] ?? 0);
        if ($dirMtime > 0 && $cachedDirMtime > 0 && $cachedDirMtime !== $dirMtime) {
            @unlink($path);
            return ['hit' => false, 'names' => []];
        }

        $rawNames = $decoded['names'] ?? [];
        if (!is_array($rawNames)) {
            return ['hit' => false, 'names' => []];
        }
        $names = [];
        foreach ($rawNames as $rawName) {
            $name = trim((string)$rawName);
            if ($name === '' || !preg_match((string)REGEX_FILE_NAME, $name)) {
                continue;
            }
            $names[$name] = $name;
            if (count($names) > self::MAX_FAST_SCAN_CAP) {
                break;
            }
        }
        $names = array_values($names);

        if (count($names) > $scanCap) {
            throw new RuntimeException(
                'Folder exceeds MCP fast-list scan cap; narrow scope or raise scanCap'
                . ' (max ' . self::MAX_FAST_SCAN_CAP . ').',
                413
            );
        }

        return ['hit' => true, 'names' => $names];
    }

    /**
     * @param array<int,string> $names
     */
    private static function saveFastListNameCache(
        string $folder,
        string $username,
        bool $ownOnly,
        string $sortDir,
        int $scanCap,
        int $dirMtime,
        array $names
    ): void {
        if (count($names) > self::MAX_FAST_SCAN_CAP) {
            return;
        }

        $cacheDir = self::fastListCacheDir();
        if ($cacheDir === '') {
            return;
        }
        if (!is_dir($cacheDir) && !@mkdir($cacheDir, 0700, true) && !is_dir($cacheDir)) {
            return;
        }

        $path = self::fastListCachePath($folder, $username, $ownOnly, $sortDir);
        if ($path === '') {
            return;
        }

        $payload = [
            'createdAt' => time(),
            'sourceId' => class_exists(SourceContext::class) ? (string)SourceContext::getActiveId() : '',
            'folder' => $folder,
            'username' => $username,
            'ownOnly' => $ownOnly,
            'sortDir' => $sortDir,
            'scanCap' => $scanCap,
            'dirMtime' => $dirMtime,
            'names' => array_values($names),
        ];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($json) || $json === '') {
            return;
        }

        $tmp = $path . '.tmp';
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
            @unlink($tmp);
            return;
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return;
        }
        @chmod($path, 0600);
    }

    private static function fastListCachePath(string $folder, string $username, bool $ownOnly, string $sortDir): string
    {
        $cacheDir = self::fastListCacheDir();
        if ($cacheDir === '') {
            return '';
        }
        $sourceId = class_exists(SourceContext::class) ? (string)SourceContext::getActiveId() : '';
        $key = hash(
            'sha256',
            implode('|', [
                'mcp-fast-list',
                (string)(defined('PROJECT_ROOT') ? PROJECT_ROOT : ''),
                $sourceId,
                $folder,
                strtolower($username),
                $ownOnly ? '1' : '0',
                strtolower($sortDir),
            ])
        );
        return $cacheDir . DIRECTORY_SEPARATOR . $key . '.json';
    }

    private static function fastListCacheDir(): string
    {
        $metaRoot = class_exists(SourceContext::class)
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $base = rtrim((string)$metaRoot, "/\\");
        if ($base === '') {
            return '';
        }
        return $base . DIRECTORY_SEPARATOR . '.mcp_fastlist_cache';
    }

    /**
     * @return array{entries:array<int,string>,truncated:bool}
     */
    private static function listDirectoryEntriesBounded(
        StorageAdapterInterface $storage,
        string $dir,
        int $scanCap
    ): array {
        $cap = max(1, $scanCap);

        if ($storage->isLocal()) {
            $entries = [];
            try {
                $it = new \FilesystemIterator($dir, \FilesystemIterator::SKIP_DOTS);
                foreach ($it as $node) {
                    $entries[] = (string)$node->getFilename();
                    if (count($entries) > $cap) {
                        return [
                            'entries' => array_slice($entries, 0, $cap),
                            'truncated' => true,
                        ];
                    }
                }
                return [
                    'entries' => $entries,
                    'truncated' => false,
                ];
            } catch (Throwable $e) {
                // Fall through to adapter list() fallback.
            }
        }

        $all = $storage->list($dir);
        if (!is_array($all)) {
            $all = [];
        }
        $truncated = count($all) > $cap;
        if ($truncated) {
            $all = array_slice($all, 0, $cap);
        }
        return [
            'entries' => array_values($all),
            'truncated' => $truncated,
        ];
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opDeleteFiles(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, true, function () use ($ctx, $payload): array {
            self::assertWritableAccount($ctx, false);

            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $files = self::normalizeFileList($payload['files'] ?? []);

            $username = $ctx->username();
            $perms = $ctx->permissions();

            $hasDelete = ACL::canDelete($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            if (!$hasDelete) {
                throw new RuntimeException('Forbidden: no delete permission.', 403);
            }

            self::assertFolderScope($ctx, $folder, 'delete');

            if (
                !$ctx->canBypassOwnership()
                && !ACL::canRead($username, $perms, $folder)
                && ACL::hasGrant($username, $folder, 'read_own')
            ) {
                self::assertFilesOwnedByUser($folder, $files, $username);
            }

            $result = FileModel::deleteFiles($folder, $files);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to delete files.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'files' => $files,
                'result' => $result,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opDeleteFolder(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, true, function () use ($ctx, $payload): array {
            self::assertWritableAccount($ctx, false);

            $folder = self::normalizeFolder((string)($payload['folder'] ?? ''));
            if ($folder === 'root') {
                throw new RuntimeException('Cannot delete root folder.', 400);
            }

            $username = $ctx->username();
            $perms = $ctx->permissions();

            self::assertFolderScope($ctx, $folder, 'manage');

            $canManage = ACL::canManage($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            if (!$canManage) {
                throw new RuntimeException('Forbidden: you lack manage rights for this folder.', 403);
            }

            if (!$ctx->canBypassOwnership() && !ACL::ownsFolderOrAncestor($username, $perms, $folder)) {
                throw new RuntimeException('Forbidden: you are not the folder owner.', 403);
            }

            $result = FolderModel::deleteFolder($folder);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to delete folder.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'result' => $result,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opSaveFileTag(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, true, function () use ($ctx, $payload): array {
            self::assertWritableAccount($ctx, false);

            $folder = self::normalizeFolder((string)($payload['folder'] ?? 'root'));
            $file = self::normalizeFileName((string)($payload['file'] ?? ''));
            $tags = self::normalizeTags($payload['tags'] ?? []);
            $deleteGlobal = self::truthy($payload['deleteGlobal'] ?? false);
            $tagToDeleteRaw = trim((string)($payload['tagToDelete'] ?? ''));
            $tagToDelete = $tagToDeleteRaw !== ''
                ? self::truncateUtf8($tagToDeleteRaw, self::MAX_TAG_NAME_CHARS)
                : null;

            $username = $ctx->username();
            $perms = $ctx->permissions();

            $canWrite = ACL::canWrite($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            if (!$canWrite) {
                throw new RuntimeException('Forbidden: no full write access.', 403);
            }

            self::assertFolderScope($ctx, $folder, 'write');

            $ignoreOwnership = $ctx->canBypassOwnership()
                || ACL::isOwner($username, $perms, $folder)
                || ACL::ownsFolderOrAncestor($username, $perms, $folder);
            if (!$ignoreOwnership) {
                self::assertFilesOwnedByUser($folder, [$file], $username);
            }

            $result = FileModel::saveFileTag($folder, $file, $tags, $deleteGlobal, $tagToDelete);
            if (!is_array($result)) {
                throw new RuntimeException('Failed to save file tags.', 500);
            }
            if (isset($result['error'])) {
                throw new RuntimeException((string)$result['error'], 400);
            }

            return [
                'ok' => true,
                'folder' => $folder,
                'file' => $file,
                'result' => $result,
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function opGetFileTags(McpOpsContext $ctx, array $payload): array
    {
        return self::withSourceContext($ctx, $payload, false, function (): array {
            return [
                'ok' => true,
                'tags' => FileModel::getFileTags(),
            ];
        });
    }

    /**
     * @param array<string,mixed> $payload
     * @return array{sourceId:string,destSourceId:string,crossSource:bool}
     */
    private static function resolveSourcePair(array $payload): array
    {
        $sourceId = trim((string)($payload['sourceId'] ?? ''));
        $destSourceId = trim((string)($payload['destSourceId'] ?? ''));

        if ($sourceId === '' && $destSourceId !== '') {
            $sourceId = $destSourceId;
        }
        if ($destSourceId === '' && $sourceId !== '') {
            $destSourceId = $sourceId;
        }

        return [
            'sourceId' => $sourceId,
            'destSourceId' => $destSourceId,
            'crossSource' => ($sourceId !== '' && $destSourceId !== '' && strcasecmp($sourceId, $destSourceId) !== 0),
        ];
    }

    /**
     * @param array<string,mixed> $payload
     * @param callable():array<string,mixed> $fn
     * @return array<string,mixed>
     */
    private static function withSourceContext(McpOpsContext $ctx, array $payload, bool $mutating, callable $fn): array
    {
        $sourceId = trim((string)($payload['sourceId'] ?? ''));

        if (!class_exists(SourceContext::class) || !SourceContext::sourcesEnabled() || $sourceId === '') {
            if ($mutating && class_exists(SourceContext::class) && SourceContext::isReadOnly()) {
                throw new RuntimeException('Source is read-only.', 403);
            }
            return $fn();
        }

        if (!SourceAccessService::isValidSourceId($sourceId)) {
            throw new RuntimeException('Invalid source id.', 400);
        }

        $source = SourceContext::getSourceById($sourceId);
        if (!$source) {
            throw new RuntimeException('Invalid source.', 400);
        }

        if (!$ctx->isAdmin() && empty($source['enabled'])) {
            throw new RuntimeException('Source is disabled.', 403);
        }

        if (
            !SourceAccessService::userCanAccessSourceRoot($sourceId, $ctx->username(), $ctx->permissions())
        ) {
            throw new RuntimeException('Forbidden: no access to selected source.', 403);
        }

        if ($mutating && !empty($source['readOnly'])) {
            throw new RuntimeException('Source is read-only.', 403);
        }

        $prevSourceId = SourceContext::getActiveId();
        SourceContext::setActiveId($sourceId, false, $ctx->isAdmin());

        try {
            if ($mutating && SourceContext::isReadOnly()) {
                throw new RuntimeException('Source is read-only.', 403);
            }
            return $fn();
        } finally {
            SourceContext::setActiveId($prevSourceId, false, $ctx->isAdmin());
        }
    }

    private static function canViewFolder(McpOpsContext $ctx, string $folder): bool
    {
        $username = $ctx->username();
        $perms = $ctx->permissions();
        return ACL::canReadOwn($username, $perms, $folder)
            || ACL::ownsFolderOrAncestor($username, $perms, $folder);
    }

    private static function assertWritableAccount(McpOpsContext $ctx, bool $enforceUploadFlag): void
    {
        $perms = $ctx->permissions();
        if (!empty($perms['readOnly'])) {
            throw new RuntimeException('Account is read-only.', 403);
        }
        if ($enforceUploadFlag && !empty($perms['disableUpload'])) {
            throw new RuntimeException('Uploads are disabled for this account.', 403);
        }
    }

    private static function assertFolderScope(McpOpsContext $ctx, string $folder, string $need): void
    {
        if ($ctx->isAdmin()) {
            return;
        }

        $perms = $ctx->permissions();
        $folderOnly = !empty($perms['folderOnly'])
            || !empty($perms['userFolderOnly'])
            || !empty($perms['UserFolderOnly']);
        if (!$folderOnly) {
            return;
        }

        $folder = ACL::normalizeFolder($folder);
        if (ACL::ownsFolderOrAncestor($ctx->username(), $perms, $folder)) {
            return;
        }

        $ok = false;
        switch ($need) {
            case 'manage':
                $ok = ACL::canManage($ctx->username(), $perms, $folder);
                break;
            case 'write':
                $ok = ACL::canWrite($ctx->username(), $perms, $folder);
                break;
            case 'share':
                $ok = ACL::canShare($ctx->username(), $perms, $folder);
                break;
            case 'read_own':
                $ok = ACL::canReadOwn($ctx->username(), $perms, $folder);
                break;
            case 'create':
                $ok = ACL::canCreate($ctx->username(), $perms, $folder);
                break;
            case 'upload':
                $ok = ACL::canUpload($ctx->username(), $perms, $folder);
                break;
            case 'edit':
                $ok = ACL::canEdit($ctx->username(), $perms, $folder);
                break;
            case 'rename':
                $ok = ACL::canRename($ctx->username(), $perms, $folder);
                break;
            case 'copy':
                $ok = ACL::canCopy($ctx->username(), $perms, $folder);
                break;
            case 'move':
                $ok = ACL::canMove($ctx->username(), $perms, $folder);
                break;
            case 'delete':
                $ok = ACL::canDelete($ctx->username(), $perms, $folder);
                break;
            case 'extract':
                $ok = ACL::canExtract($ctx->username(), $perms, $folder);
                break;
            case 'share_file':
            case 'shareFile':
                $ok = ACL::canShareFile($ctx->username(), $perms, $folder);
                break;
            case 'share_folder':
            case 'shareFolder':
                $ok = ACL::canShareFolder($ctx->username(), $perms, $folder);
                break;
            case 'read':
            default:
                $ok = ACL::canRead($ctx->username(), $perms, $folder);
                break;
        }

        if (!$ok) {
            throw new RuntimeException('Forbidden: folder scope violation.', 403);
        }
    }

    /**
     * @param array<int,string> $files
     */
    private static function assertFilesOwnedByUser(string $folder, array $files, string $username): void
    {
        $metadata = self::loadFolderMetadata($folder);
        foreach ($files as $file) {
            if (
                !isset($metadata[$file]['uploader'])
                || strcasecmp((string)$metadata[$file]['uploader'], $username) !== 0
            ) {
                throw new RuntimeException("Forbidden: you are not the owner of '{$file}'.", 403);
            }
        }
    }

    /**
     * @return array<string,mixed>
     */
    private static function loadFolderMetadata(string $folder): array
    {
        $metaPath = self::folderMetadataPath($folder);
        if (!is_file($metaPath)) {
            return [];
        }
        $data = json_decode((string)file_get_contents($metaPath), true);
        return is_array($data) ? $data : [];
    }

    private static function folderMetadataPath(string $folder): string
    {
        $metaRoot = class_exists(SourceContext::class)
            ? SourceContext::metaRoot()
            : rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;

        $folder = ACL::normalizeFolder($folder);
        if ($folder === 'root') {
            return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR . 'root_metadata.json';
        }

        return rtrim($metaRoot, '/\\') . DIRECTORY_SEPARATOR
            . str_replace(['/', '\\', ' '], '-', $folder)
            . '_metadata.json';
    }

    private static function normalizeFolder(string $folder): string
    {
        $normalized = ACL::normalizeFolder($folder);
        if ($normalized !== 'root' && !preg_match((string)REGEX_FOLDER_NAME, $normalized)) {
            throw new RuntimeException('Invalid folder name.', 400);
        }
        return $normalized;
    }

    private static function normalizeFileName(string $name): string
    {
        $normalized = basename(trim($name));
        if ($normalized === '' || !preg_match((string)REGEX_FILE_NAME, $normalized)) {
            throw new RuntimeException('Invalid file name.', 400);
        }
        return $normalized;
    }

    /**
     * @param mixed $rawFiles
     * @return array<int,string>
     */
    private static function normalizeFileList($rawFiles): array
    {
        if (!is_array($rawFiles)) {
            throw new RuntimeException('No file names provided.', 400);
        }
        if (count($rawFiles) > self::MAX_BULK_FILES) {
            throw new RuntimeException('Too many files in one operation.', 400);
        }

        $files = [];
        foreach ($rawFiles as $entry) {
            $name = basename(trim((string)$entry));
            if ($name === '') {
                continue;
            }
            if (!preg_match((string)REGEX_FILE_NAME, $name)) {
                throw new RuntimeException('Invalid file name.', 400);
            }
            $files[$name] = $name;
        }

        if (!$files) {
            throw new RuntimeException('No file names provided.', 400);
        }

        return array_values($files);
    }

    /**
     * @param mixed $raw
     * @return array<int,array{name:string,color:string}>
     */
    private static function normalizeTags($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }

        $tags = [];
        foreach ($raw as $entry) {
            if (count($tags) >= self::MAX_TAGS_PER_FILE) {
                break;
            }

            if (is_string($entry)) {
                $nameOnly = self::truncateUtf8(trim($entry), self::MAX_TAG_NAME_CHARS);
                if ($nameOnly === '') {
                    continue;
                }
                $tags[] = ['name' => $nameOnly, 'color' => ''];
                continue;
            }

            if (!is_array($entry)) {
                continue;
            }

            $name = self::truncateUtf8(trim((string)($entry['name'] ?? '')), self::MAX_TAG_NAME_CHARS);
            if ($name === '') {
                continue;
            }
            $color = self::truncateUtf8(trim((string)($entry['color'] ?? '')), self::MAX_TAG_COLOR_CHARS);

            $tags[] = [
                'name' => $name,
                'color' => $color,
            ];
        }

        return $tags;
    }

    /**
     * @param mixed $value
     */
    private static function truthy($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return ((int)$value) !== 0;
        }
        $raw = strtolower(trim((string)$value));
        return in_array($raw, ['1', 'true', 'yes', 'on'], true);
    }

    /**
     * @param mixed $value
     */
    private static function boundedInt($value, int $min, int $max, int $fallback): int
    {
        if (!is_int($value) && !is_float($value) && !is_string($value)) {
            return $fallback;
        }
        $n = (int)$value;
        if ($n < $min) {
            return $min;
        }
        if ($n > $max) {
            return $max;
        }
        return $n;
    }

    private static function crossSourceEncryptedError(
        McpOpsContext $ctx,
        string $sourceId,
        string $sourceFolder,
        string $destSourceId,
        string $destFolder
    ): ?string {
        if (!class_exists(SourceContext::class) || !class_exists(FolderCrypto::class)) {
            return null;
        }

        $srcEncrypted = (bool)self::withSourceContext(
            $ctx,
            ['sourceId' => $sourceId],
            false,
            function () use ($sourceFolder): array {
                try {
                    return ['encrypted' => FolderCrypto::isEncryptedOrAncestor($sourceFolder)];
                } catch (Throwable $e) {
                    return ['encrypted' => false];
                }
            }
        )['encrypted'];

        $dstEncrypted = (bool)self::withSourceContext(
            $ctx,
            ['sourceId' => $destSourceId],
            false,
            function () use ($destFolder): array {
                try {
                    return ['encrypted' => FolderCrypto::isEncryptedOrAncestor($destFolder)];
                } catch (Throwable $e) {
                    return ['encrypted' => false];
                }
            }
        )['encrypted'];

        if ($srcEncrypted || $dstEncrypted) {
            return 'Encrypted folders are not supported for cross-source operations.';
        }
        return null;
    }

    private static function formatBytes(int $bytes): string
    {
        if ($bytes >= 1073741824) {
            return sprintf('%.1f GB', $bytes / 1073741824);
        }
        if ($bytes >= 1048576) {
            return sprintf('%.1f MB', $bytes / 1048576);
        }
        if ($bytes >= 1024) {
            return sprintf('%.1f KB', $bytes / 1024);
        }
        return sprintf('%s bytes', number_format($bytes));
    }

    private static function truncateUtf8(string $value, int $maxChars): string
    {
        if ($maxChars <= 0 || $value === '') {
            return '';
        }
        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($value, 'UTF-8') <= $maxChars) {
                return $value;
            }
            return (string)mb_substr($value, 0, $maxChars, 'UTF-8');
        }
        return (strlen($value) <= $maxChars) ? $value : substr($value, 0, $maxChars);
    }

    private static function normalizeOperation(string $operation): string
    {
        $op = trim($operation);
        if ($op === '') {
            return '';
        }

        $op = preg_replace('/([a-z0-9])([A-Z])/', '$1_$2', $op) ?? $op;
        $op = strtolower($op);
        $op = str_replace(['.', '-', ' '], '_', $op);
        $op = preg_replace('/_+/', '_', $op) ?? $op;

        $aliases = [
            'listfolders' => 'list_folders',
            'listchildren' => 'list_children',
            'listfiles' => 'list_files',
            'readfile' => 'read_file',
            'createfile' => 'create_file',
            'createfolder' => 'create_folder',
            'copyfiles' => 'copy_files',
            'movefiles' => 'move_files',
            'renamefile' => 'rename_file',
            'movefolder' => 'move_folder',
            'movefolders' => 'move_folders',
            'deletefiles' => 'delete_files',
            'deletefolder' => 'delete_folder',
            'savefiletag' => 'save_file_tag',
            'getfiletags' => 'get_file_tags',
        ];

        return $aliases[$op] ?? $op;
    }

    /**
     * @return array<string,array<string,mixed>>
     */
    private static function operationRegistry(): array
    {
        return [
            'list_files' => [
                'title' => 'List Files',
                'description' => 'List files in a folder within the active scope.',
                'mutating' => false,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'limit', 'pageSize', 'cursor', 'sortBy', 'sortDir', 'scanCap'],
                'examples' => [
                    '/op list_files {"folder":"root"}',
                ],
            ],
            'list_folders' => [
                'title' => 'List Folders',
                'description' => 'List child folders in a folder within the active scope.',
                'mutating' => false,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'limit', 'cursor'],
                'examples' => [
                    '/op list_folders {"folder":"root"}',
                ],
            ],
            'list_children' => [
                'title' => 'List Children',
                'description' => 'List child folders in a folder within the active scope.',
                'mutating' => false,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'limit', 'cursor'],
                'examples' => [
                    '/op list_children {"folder":"root"}',
                ],
            ],
            'read_file' => [
                'title' => 'Read File',
                'description' => 'Read a text preview from one file.',
                'mutating' => false,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'file', 'maxBytes'],
                'examples' => [
                    '/op read_file {"folder":"root","file":"notes.txt"}',
                ],
            ],
            'create_file' => [
                'title' => 'Create File',
                'description' => 'Create an empty file in a folder.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'name'],
                'examples' => [
                    '/op create_file {"folder":"root","name":"notes.txt"}',
                ],
            ],
            'create_folder' => [
                'title' => 'Create Folder',
                'description' => 'Create one folder under a parent folder.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['parent'],
                'args' => ['parent', 'folderName'],
                'examples' => [
                    '/op create_folder {"parent":"root","folderName":"invoices"}',
                ],
            ],
            'copy_files' => [
                'title' => 'Copy Files',
                'description' => 'Copy one or more files from a source folder to a destination folder.',
                'mutating' => true,
                'bulk' => true,
                'scopeFields' => ['source', 'destination'],
                'args' => ['source', 'destination', 'files'],
                'examples' => [
                    '/op copy_files {"source":"root","destination":"archive","files":["notes.txt"]}',
                ],
            ],
            'move_files' => [
                'title' => 'Move Files',
                'description' => 'Move one or more files from a source folder to a destination folder.',
                'mutating' => true,
                'bulk' => true,
                'scopeFields' => ['source', 'destination'],
                'args' => ['source', 'destination', 'files'],
                'examples' => [
                    '/op move_files {"source":"root","destination":"archive","files":["notes.txt"]}',
                ],
            ],
            'move_folder' => [
                'title' => 'Move Folder',
                'description' => 'Move one folder into another destination folder.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['source', 'destination'],
                'args' => ['source', 'destination'],
                'examples' => [
                    '/op move_folder {"source":"invoices/2025","destination":"archive"}',
                ],
            ],
            'move_folders' => [
                'title' => 'Move Folder',
                'description' => 'Alias of move_folder for compatibility.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['source', 'destination'],
                'args' => ['source', 'destination'],
                'examples' => [
                    '/op move_folders {"source":"invoices/2025","destination":"archive"}',
                ],
            ],
            'rename_file' => [
                'title' => 'Rename File',
                'description' => 'Rename one file inside a folder.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'oldName', 'newName'],
                'examples' => [
                    '/op rename_file {"folder":"root","oldName":"a.txt","newName":"b.txt"}',
                ],
            ],
            'delete_files' => [
                'title' => 'Delete Files',
                'description' => 'Delete one or more files from a folder.',
                'mutating' => true,
                'bulk' => true,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'files'],
                'examples' => [
                    '/op delete_files {"folder":"root","files":["notes.txt"]}',
                ],
            ],
            'delete_folder' => [
                'title' => 'Delete Folder',
                'description' => 'Delete one folder.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder'],
                'examples' => [
                    '/op delete_folder {"folder":"invoices/2024"}',
                ],
            ],
            'save_file_tag' => [
                'title' => 'Update File Tags',
                'description' => 'Add, replace, or remove tags on one file.',
                'mutating' => true,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder', 'file', 'tags', 'tagToDelete'],
                'examples' => [
                    '/op save_file_tag {"folder":"root","file":"notes.txt","tags":[{"name":"important","color":""}]}',
                ],
            ],
            'get_file_tags' => [
                'title' => 'List Tags',
                'description' => 'List available file tags.',
                'mutating' => false,
                'bulk' => false,
                'scopeFields' => ['folder'],
                'args' => ['folder'],
                'examples' => [
                    '/op get_file_tags {"folder":"root"}',
                ],
            ],
        ];
    }

    private static function ensureBootstrap(): void
    {
        if (!defined('PROJECT_ROOT')) {
            $projectRoot = dirname(__DIR__, 3);
            require_once $projectRoot . '/config/config.php';
        }
    }
}
