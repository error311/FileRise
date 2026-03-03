<?php

declare(strict_types=1);

namespace FileRise\Domain;

use Throwable;

final class ProDiskUsageApiService
{
    /**
     * @param array<string,mixed> $payload
     * @return array{status:int,payload:array<string,mixed>}
     */
    private static function response(int $status, array $payload): array
    {
        return [
            'status' => $status,
            'payload' => $payload,
        ];
    }

    /**
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function children(array $query): array
    {
        $folderKey = isset($query['folder']) ? (string)$query['folder'] : 'root';
        $sourceId = isset($query['sourceId']) ? trim((string)$query['sourceId']) : '';

        $result = \ProDiskUsage::getChildren($folderKey, $sourceId);
        if (!empty($result['ok'])) {
            return self::response(200, $result);
        }

        $error = (string)($result['error'] ?? '');
        if ($error === 'no_snapshot') {
            return self::response(200, $result);
        }
        if ($error === 'invalid_source' || $error === 'unsupported_source') {
            return self::response(400, $result);
        }

        return self::response(404, $result);
    }

    /**
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function topFiles(array $query): array
    {
        $limit = isset($query['limit']) ? max(1, (int)$query['limit']) : 100;
        $sourceId = isset($query['sourceId']) ? trim((string)$query['sourceId']) : '';

        $result = \ProDiskUsage::getTopFiles($limit, $sourceId);
        if (!empty($result['ok'])) {
            return self::response(200, $result);
        }

        $error = (string)($result['error'] ?? '');
        if ($error === 'invalid_source' || $error === 'unsupported_source') {
            return self::response(400, $result);
        }

        return self::response(404, $result);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function deleteFile(array $body): array
    {
        if (!isset($body['name']) || trim((string)$body['name']) === '') {
            return self::response(400, ['ok' => false, 'error' => 'Invalid input']);
        }

        $folder = isset($body['folder']) ? (string)$body['folder'] : 'root';
        $folder = $folder === '' ? 'root' : trim($folder, "/\\ ");
        $name = (string)$body['name'];
        $sourceId = isset($body['sourceId']) ? trim((string)$body['sourceId']) : '';

        if ($sourceId !== '') {
            $result = SourceAccessService::withLocalExplorerSource(
                $sourceId,
                static function () use ($folder, $name): array {
                    return FileModel::deleteFilesPermanent($folder, [$name]);
                }
            );
        } else {
            $result = FileModel::deleteFilesPermanent($folder, [$name]);
        }

        if (!empty($result['error'])) {
            return self::response(200, [
                'ok' => false,
                'error' => (string)$result['error'],
            ]);
        }

        return self::response(200, [
            'ok' => true,
            'success' => $result['success'] ?? 'File deleted.',
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function deleteFolder(array $body): array
    {
        if (!array_key_exists('folder', $body)) {
            return self::response(400, ['ok' => false, 'error' => 'Invalid input']);
        }

        $folder = (string)$body['folder'];
        $folder = $folder === '' ? 'root' : trim($folder, "/\\ ");
        if (strtolower($folder) === 'root') {
            return self::response(400, [
                'ok' => false,
                'error' => 'Cannot deep delete root folder.',
            ]);
        }

        $sourceId = isset($body['sourceId']) ? trim((string)$body['sourceId']) : '';
        if ($sourceId !== '') {
            $result = SourceAccessService::withLocalExplorerSource(
                $sourceId,
                static function () use ($folder): array {
                    return FolderModel::deleteFolderRecursiveAdmin($folder);
                }
            );
        } else {
            $result = FolderModel::deleteFolderRecursiveAdmin($folder);
        }

        if (!empty($result['error'])) {
            return self::response(200, [
                'ok' => false,
                'error' => (string)$result['error'],
            ]);
        }

        return self::response(200, [
            'ok' => true,
            'success' => $result['success'] ?? 'Folder deleted.',
        ]);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function fromThrowable(Throwable $e, string $fallbackError): array
    {
        $code = (int)$e->getCode();
        if ($code >= 400 && $code <= 599) {
            return self::response($code, [
                'ok' => false,
                'error' => $e->getMessage(),
            ]);
        }

        return self::response(500, [
            'ok' => false,
            'error' => $fallbackError,
        ]);
    }
}
