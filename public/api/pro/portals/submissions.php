<?php
declare(strict_types=1);
/**
 * @OA\Get(
 *   path="/api/pro/portals/submissions.php",
 *   summary="List portal submissions",
 *   description="Returns submissions for a portal (admin only, Pro).",
 *   operationId="proPortalsSubmissions",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="slug", in="query", required=true, @OA\Schema(type="string"), example="client-portal"),
 *   @OA\Response(response=200, description="Submissions payload"),
 *   @OA\Response(response=400, description="Missing slug"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

function portalDownloadLogRoots(): array
{
    $roots = [];
    if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
        $sources = SourceContext::listAllSources();
        foreach ($sources as $src) {
            if (!is_array($src)) {
                continue;
            }
            $id = (string)($src['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $roots[] = SourceContext::metaRootForId($id);
        }
    }
    $roots[] = rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR;
    return array_values(array_unique($roots));
}

function loadPortalDownloads(string $slug, int $limit = 400): array
{
    $slug = trim($slug);
    if ($slug === '') {
        return [];
    }

    $events = [];
    foreach (portalDownloadLogRoots() as $root) {
        $path = rtrim((string)$root, "/\\") . DIRECTORY_SEPARATOR . 'portal_downloads.log';
        if (!is_file($path) || !is_readable($path)) {
            continue;
        }

        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines) || !$lines) {
            continue;
        }

        if (count($lines) > $limit) {
            $lines = array_slice($lines, -$limit);
        }

        foreach ($lines as $line) {
            $rec = json_decode($line, true);
            if (!is_array($rec)) {
                continue;
            }
            if (trim((string)($rec['slug'] ?? '')) !== $slug) {
                continue;
            }
            $ts = isset($rec['createdAt']) ? strtotime((string)$rec['createdAt']) : false;
            $rec['_ts'] = $ts !== false ? $ts : 0;
            $events[] = $rec;
        }
    }

    if (!$events) {
        return [];
    }

    usort($events, static function ($a, $b) {
        return ($b['_ts'] ?? 0) <=> ($a['_ts'] ?? 0);
    });

    if (count($events) > $limit) {
        $events = array_slice($events, 0, $limit);
    }

    foreach ($events as &$event) {
        unset($event['_ts']);
    }
    unset($event);

    return $events;
}

try {
    // --- Basic auth / admin check (keep it simple & consistent with your other admin APIs)
    @session_start();

    $username = (string)($_SESSION['username'] ?? '');
    $isAdmin  = !empty($_SESSION['isAdmin']) || (!empty($_SESSION['admin']) && $_SESSION['admin'] === '1');

    if ($username === '' || !$isAdmin) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error'   => 'Forbidden',
        ]);
        return;
    }

    // Snapshot done, release lock for concurrency
    @session_write_close();

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
        throw new RuntimeException('FileRise Pro is not active.');
    }

    $slug = isset($_GET['slug']) ? trim((string)$_GET['slug']) : '';
    if ($slug === '') {
        throw new InvalidArgumentException('Missing slug.');
    }

    // Use your ProPortalSubmissions helper from the bundle
    $proSubmissionsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProPortalSubmissions.php';
    if (!is_file($proSubmissionsPath)) {
        throw new RuntimeException('ProPortalSubmissions.php not found in Pro bundle.');
    }
    require_once $proSubmissionsPath;

    $store       = new ProPortalSubmissions((string)FR_PRO_BUNDLE_DIR);
    $submissions = $store->listBySlug($slug, 200);

    $downloads = loadPortalDownloads($slug, 400);
    if ($downloads && is_array($submissions)) {
        $downloadsByRef = [];
        foreach ($downloads as $dl) {
            $ref = trim((string)($dl['submissionRef'] ?? ''));
            if ($ref === '') {
                continue;
            }
            if (!isset($downloadsByRef[$ref])) {
                $downloadsByRef[$ref] = [];
            }
            $downloadsByRef[$ref][] = $dl;
        }

        foreach ($submissions as $idx => $row) {
            if (!is_array($row)) {
                continue;
            }
            $raw = isset($row['raw']) && is_array($row['raw']) ? $row['raw'] : [];
            $ref = trim((string)($row['submissionRef'] ?? ($raw['submissionRef'] ?? '')));
            if ($ref !== '' && isset($downloadsByRef[$ref])) {
                $row['downloads'] = $downloadsByRef[$ref];
            }
            if ($ref !== '' && !isset($row['submissionRef'])) {
                $row['submissionRef'] = $ref;
            }
            $submissions[$idx] = $row;
        }
    }

    echo json_encode([
        'success'     => true,
        'slug'        => $slug,
        'submissions' => $submissions,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Server error: ' . $e->getMessage(),
    ]);
}
