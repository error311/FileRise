<?php

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

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    fr_pro_guard_method('GET');
    fr_pro_start_session();

    $ctx = fr_pro_current_user_context();
    @session_write_close();

    fr_pro_emit_result(
        \FileRise\Domain\ProPortalsApiService::submissions(
            $_GET,
            $ctx['username'],
            $ctx['isAdmin']
        )
    );
} catch (Throwable $e) {
    $code = (int)$e->getCode();
    if ($code >= 400 && $code <= 499) {
        fr_pro_json($code, [
            'success' => false,
            'error' => $e->getMessage(),
        ]);
    }

    fr_pro_json(500, [
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage(),
    ]);
}
