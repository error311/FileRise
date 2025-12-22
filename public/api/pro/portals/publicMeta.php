<?php
// public/api/pro/portals/publicMeta.php
/**
 * @OA\Get(
 *   path="/api/pro/portals/publicMeta.php",
 *   summary="Get public portal metadata",
 *   description="Returns the public metadata needed for the portal login page.",
 *   operationId="proPortalsPublicMeta",
 *   tags={"Pro"},
 *   @OA\Parameter(name="slug", in="query", required=true, @OA\Schema(type="string"), example="client-portal"),
 *   @OA\Response(response=200, description="Public portal payload"),
 *   @OA\Response(response=400, description="Missing slug"),
 *   @OA\Response(response=404, description="Portal not found or Pro inactive"),
 *   @OA\Response(response=410, description="Portal expired"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';

// --- Basic Pro checks ---
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error'   => 'FileRise Pro is not active.',
    ]);
    exit;
}

$slug = isset($_GET['slug']) ? trim((string)$_GET['slug']) : '';
if ($slug === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => 'Missing portal slug.',
    ]);
    exit;
}

// --- Locate portals.json written by saveProPortals() ---
$bundleDir = defined('FR_PRO_BUNDLE_DIR') ? (string)FR_PRO_BUNDLE_DIR : '';
if ($bundleDir === '' || !is_dir($bundleDir)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Pro bundle directory not found.',
    ]);
    exit;
}

$jsonPath = rtrim($bundleDir, "/\\") . '/portals.json';
if (!is_file($jsonPath)) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error'   => 'No portals defined.',
    ]);
    exit;
}

$raw = @file_get_contents($jsonPath);
if ($raw === false) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Could not read portals store.',
    ]);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Invalid portals store.',
    ]);
    exit;
}

$portals = $data['portals'] ?? [];
if (!is_array($portals) || !isset($portals[$slug]) || !is_array($portals[$slug])) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error'   => 'Portal not found.',
    ]);
    exit;
}

$portal = $portals[$slug];

// Optional: handle expiry if you’re using expiresAt as ISO date string
if (!empty($portal['expiresAt'])) {
    $ts = strtotime((string)$portal['expiresAt']);
    if ($ts !== false && $ts < time()) {
        http_response_code(410); // Gone
        echo json_encode([
            'success' => false,
            'error'   => 'This portal has expired.',
        ]);
        exit;
    }
}

// Only expose the bits the login page needs (no folder, email, etc.)
$public = [
    'slug'       => $slug,
    'label'      => (string)($portal['label'] ?? ''),
    'title'      => (string)($portal['title'] ?? ''),
    'introText'  => (string)($portal['introText'] ?? ''),
    'brandColor' => (string)($portal['brandColor'] ?? ''),
    'footerText' => (string)($portal['footerText'] ?? ''),
    'logoFile'   => (string)($portal['logoFile']    ?? ''),
];

echo json_encode([
    'success' => true,
    'portal'  => $public,
]);
