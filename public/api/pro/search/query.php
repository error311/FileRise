<?php
declare(strict_types=1);
// Pro Search Everywhere query endpoint
/**
 * @OA\Get(
 *   path="/api/pro/search/query.php",
 *   summary="Search files (Pro)",
 *   description="Searches across folders using the Pro search index.",
 *   operationId="proSearchQuery",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="q", in="query", required=false, @OA\Schema(type="string"), description="Search query"),
 *   @OA\Parameter(name="limit", in="query", required=false, @OA\Schema(type="integer", minimum=1), example=50),
 *   @OA\Parameter(name="force", in="query", required=false, @OA\Schema(type="boolean"), description="Admins only: force refresh"),
 *   @OA\Response(response=200, description="Search results"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=503, description="Search disabled")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../../config/config.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$username = (string)($_SESSION['username'] ?? '');
$perms = [
    'role'        => $_SESSION['role']        ?? null,
    'admin'       => $_SESSION['admin']       ?? null,
    'isAdmin'     => $_SESSION['isAdmin']     ?? null,
    'folderOnly'  => $_SESSION['folderOnly']  ?? null,
    'readOnly'    => $_SESSION['readOnly']    ?? null,
];
@session_write_close();

// Pro-only gate
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProSearch')) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'FileRise Pro is not active.']);
    exit;
}

$qRaw   = isset($_GET['q']) ? (string)$_GET['q'] : '';
$limit  = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
$force  = (!empty($_GET['force']) && ACL::isAdmin($perms));

$result = ProSearch::query($qRaw, $limit, $username, $perms, $force);

if (empty($result['ok'])) {
    $code = 400;
    if (($result['error'] ?? '') === 'disabled') $code = 503;
    http_response_code($code);
}

echo json_encode($result, JSON_UNESCAPED_SLASHES);
