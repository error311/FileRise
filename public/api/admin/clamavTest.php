<?php
// public/api/admin/clamavTest.php
/**
 * @OA\Post(
 *   path="/api/admin/clamavTest.php",
 *   summary="Run ClamAV connectivity test",
 *   description="Runs a test scan of a temporary file and returns engine info.",
 *   operationId="adminClamavTest",
 *   tags={"Admin"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Response(
 *     response=200,
 *     description="Test result",
 *     @OA\JsonContent(
 *       type="object",
 *       @OA\Property(property="success", type="boolean"),
 *       @OA\Property(property="command", type="string"),
 *       @OA\Property(property="engine", type="string", nullable=true),
 *       @OA\Property(property="details", type="string"),
 *       @OA\Property(property="error", type="string")
 *     )
 *   ),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

AdminController::clamavTest();
