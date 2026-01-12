<?php
// public/api/admin/acl/getGrants.php
/**
 * @OA\Get(
 *   path="/api/admin/acl/getGrants.php",
 *   summary="Get ACL grants for a user",
 *   description="Returns explicit and inherited folder grants for a user.",
 *   operationId="adminGetAclGrants",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="user", in="query", required=true, @OA\Schema(type="string"), example="johndoe"),
 *   @OA\Parameter(name="sourceId", in="query", required=false, @OA\Schema(type="string"), example="local"),
 *   @OA\Response(
 *     response=200,
 *     description="Grants map",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="grants", type="object")
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid user"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AclAdminController.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json');

if (empty($_SESSION['authenticated']) || empty($_SESSION['isAdmin'])) {
  http_response_code(401);
  echo json_encode(['error' => 'Unauthorized']);
  exit;
}

$sourceId = trim((string)($_GET['sourceId'] ?? ''));
if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
  if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid source id.']);
    exit;
  }
  $info = SourceContext::getSourceById($sourceId);
  if (!$info) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid source.']);
    exit;
  }
  SourceContext::setActiveId($sourceId, false, true);
}

$user = trim((string)($_GET['user'] ?? ''));
try {
  $ctrl   = new AclAdminController();
  $grants = $ctrl->getUserGrants($user);
  echo json_encode(['grants' => $grants], JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
  http_response_code(400);
  echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Failed to load grants', 'detail' => $e->getMessage()]);
}
