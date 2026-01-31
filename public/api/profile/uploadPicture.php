<?php
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';


/**
 * @OA\Post(
 *   path="/api/profile/uploadPicture.php",
 *   summary="Upload or replace the current user's profile picture",
 *   description="Accepts a single image file (JPEG, PNG, or GIF) up to 2&nbsp;MB. Requires a valid session cookie and CSRF token.",
 *   operationId="uploadProfilePicture",
 *   tags={"Users"},
 *   security={{"cookieAuth": {}}},
 *
 *   @OA\Parameter(
 *     name="X-CSRF-Token",
 *     in="header",
 *     required=true,
 *     description="Anti-CSRF token associated with the current session.",
 *     @OA\Schema(type="string")
 *   ),
 *
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\MediaType(
 *       mediaType="multipart/form-data",
 *       @OA\Schema(
 *         required={"profile_picture"},
 *         @OA\Property(
 *           property="profile_picture",
 *           type="string",
 *           format="binary",
 *           description="JPEG, PNG, or GIF image. Max size: 2 MB."
 *         )
 *       )
 *     )
 *   ),
 *
 *   @OA\Response(
 *     response=200,
 *     description="Profile picture updated.",
 *     @OA\JsonContent(
 *       type="object",
 *       required={"success","url"},
 *       @OA\Property(property="success", type="boolean", example=true),
 *       @OA\Property(property="url", type="string", example="/api/public/profilePic.php?file=alice_9f3c2e1a8bcd.png")
 *     )
 *   ),
 *   @OA\Response(response=400, description="No file uploaded, invalid file type, or file too large."),
 *   @OA\Response(response=401, ref="#/components/responses/Unauthorized"),
 *   @OA\Response(response=403, ref="#/components/responses/Forbidden"),
 *   @OA\Response(response=500, description="Server error while saving the picture.")
 * )
 */

// Always JSON, even on PHP notices
header('Content-Type: application/json');

try {
    $userController = new UserController();
    $userController->uploadPicture();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
      'success' => false,
      'error'   => 'Exception: ' . $e->getMessage()
    ]);
}
