<?php

// public/api/pro/portals/submitForm.php
/**
 * @OA@Post(
 *   path="/api/pro/portals/submitForm.php",
 *   summary="Submit portal form",
 *   description="Submits a portal form payload (requires auth, Pro).",
 *   operationId="proPortalsSubmitForm",
 *   tags={"Pro"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"slug","form"},
 *       @OA\Property(property="slug", type="string", example="client-portal"),
 *       @OA\Property(
 *         property="form",
 *         type="object",
 *         @OA\Property(property="name", type="string", example="Jane Doe"),
 *         @OA\Property(property="email", type="string", example="jane@example.com"),
 *         @OA\Property(property="reference", type="string", example="PO-123"),
 *         @OA\Property(property="notes", type="string", example="Please review")
 *       )
 *     )
 *   ),
 *   @OA\Response(response=200, description="Submission saved"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden or Pro required"),
 *   @OA\Response(response=405, description="Method not allowed"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    fr_pro_guard_method('POST');
    fr_pro_guard_auth(false, true);

    $submittedBy = (string)($_SESSION['username'] ?? '');
    fr_pro_emit_result(
        \FileRise\Domain\ProPortalsApiService::submitForm(
            fr_pro_read_json(),
            $submittedBy,
            $_SERVER
        )
    );
} catch (Throwable $e) {
    $status = $e instanceof InvalidArgumentException ? 400 : 500;
    $code = (int)$e->getCode();
    if ($code >= 400 && $code <= 599) {
        $status = $code;
    }

    fr_pro_json($status, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
