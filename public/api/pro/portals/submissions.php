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
