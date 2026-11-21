<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Storage\SourceContext;
use FileRise\Support\FolderShareStore;
use RuntimeException;

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

final class MetadataReadService
{
    private const ALLOWED = ['share_links.json', 'share_folder_links.json'];

    /**
     * @return array{ok:bool,status:int,error?:string,sourceId?:string,data?:array<string,mixed>}
     */
    public static function readAndPrune(string $file): array
    {
        $file = basename($file);
        if ($file === '') {
            return [
                'ok' => false,
                'status' => 400,
                'error' => 'Missing `file` parameter',
            ];
        }

        if (!in_array($file, self::ALLOWED, true)) {
            return [
                'ok' => false,
                'status' => 403,
                'error' => 'Invalid file requested',
            ];
        }

        $targets = self::resolveTargets();
        $out = [];
        $now = time();

        foreach ($targets as $target) {
            $metaRoot = rtrim((string)($target['metaRoot'] ?? ''), '/\\');
            if ($metaRoot === '') {
                continue;
            }

            $path = $metaRoot . DIRECTORY_SEPARATOR . $file;
            if (!file_exists($path)) {
                continue;
            }

            try {
                if ($file === 'share_folder_links.json') {
                    $data = FolderShareStore::prune($path);
                } else {
                    $data = json_decode((string)file_get_contents($path), true);
                    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
                        throw new RuntimeException('Corrupted JSON');
                    }
                }
            } catch (RuntimeException $e) {
                return [
                    'ok' => false,
                    'status' => 500,
                    'error' => 'Could not read share links.',
                    'sourceId' => (string)($target['id'] ?? ''),
                ];
            }

            $changed = false;
            $cleaned = [];
            foreach ($data as $token => $entry) {
                if (!empty($entry['expires']) && $entry['expires'] < $now) {
                    $changed = true;
                    continue;
                }

                $cleaned[$token] = $entry;
                if (is_array($entry)) {
                    $entry['token'] = $token;
                    $entry['sourceId'] = $target['id'];
                    $entry['sourceName'] = $target['name'];
                }

                $key = $token;
                if (isset($out[$key])) {
                    $key = (string)$target['id'] . ':' . $token;
                }
                $out[$key] = $entry;
            }

            if ($changed && $file !== 'share_folder_links.json') {
                file_put_contents($path, json_encode($cleaned, JSON_PRETTY_PRINT));
            }
        }

        return [
            'ok' => true,
            'status' => 200,
            'data' => $out,
        ];
    }

    /**
     * @return array<int,array{id:string,name:string,metaRoot:string}>
     */
    private static function resolveTargets(): array
    {
        $targets = [];

        if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $sources = SourceContext::listAllSources();
            foreach ($sources as $src) {
                if (!is_array($src)) {
                    continue;
                }
                $id = trim((string)($src['id'] ?? ''));
                if ($id === '') {
                    continue;
                }

                $name = trim((string)($src['name'] ?? ''));
                if ($name === '') {
                    $name = $id;
                }

                $targets[] = [
                    'id' => $id,
                    'name' => $name,
                    'metaRoot' => (string)SourceContext::metaRootForId($id),
                ];
            }
        }

        if (!$targets) {
            $targets[] = [
                'id' => 'local',
                'name' => 'Local',
                'metaRoot' => rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR,
            ];
        }

        return $targets;
    }
}
