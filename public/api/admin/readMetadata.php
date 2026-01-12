<?php
// public/api/admin/readMetadata.php

/**
 * @OA\Get(
 *   path="/api/admin/readMetadata.php",
 *   summary="Read share metadata JSON",
 *   description="Admin-only: returns the cleaned metadata for file or folder share links.",
 *   tags={"Admin"},
 *   operationId="readMetadata",
 *   security={{"cookieAuth":{}}},
 *   @OA\Parameter(
 *     name="file",
 *     in="query",
 *     required=true,
 *     description="Which metadata file to read",
 *     @OA\Schema(type="string", enum={"share_links.json","share_folder_links.json"})
 *   ),
 *   @OA\Response(
 *     response=200,
 *     description="OK",
 *     @OA\JsonContent(oneOf={
 *       @OA\Schema(ref="#/components/schemas/ShareLinksMap"),
 *       @OA\Schema(ref="#/components/schemas/ShareFolderLinksMap")
 *     })
 *   ),
 *   @OA\Response(response=400, description="Missing or invalid file param"),
 *   @OA\Response(response=403, description="Forbidden (admin only)"),
 *   @OA\Response(response=500, description="Corrupted JSON")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

// Only admins may read these
if (empty($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

// Must supply ?file=share_links.json or share_folder_links.json
if (empty($_GET['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing `file` parameter']);
    exit;
}

$file = basename($_GET['file']);
$allowed = ['share_links.json', 'share_folder_links.json'];
if (!in_array($file, $allowed, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid file requested']);
    exit;
}

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
            'metaRoot' => SourceContext::metaRootForId($id),
        ];
    }
}
if (empty($targets)) {
    $targets[] = [
        'id' => 'local',
        'name' => 'Local',
        'metaRoot' => rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR,
    ];
}

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

    $jsonData = file_get_contents($path);
    $data = json_decode($jsonData, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        http_response_code(500);
        echo json_encode(['error' => 'Corrupted JSON', 'sourceId' => $target['id']]);
        exit;
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
            $key = $target['id'] . ':' . $token;
        }
        $out[$key] = $entry;
    }
    if ($changed) {
        file_put_contents($path, json_encode($cleaned, JSON_PRETTY_PRINT));
    }
}

http_response_code(200);
header('Content-Type: application/json');
echo json_encode($out);
exit;
