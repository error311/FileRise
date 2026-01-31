<?php


/**
 * @OA\Get(
 *   path="/api/profile/getCurrentUser.php",
 *   operationId="getCurrentUser",
 *   tags={"Users"},
 *   security={{"cookieAuth":{}}},
 *   @OA\Response(
 *     response=200,
 *     description="Current user",
 *     @OA\JsonContent(
 *       type="object",
 *       required={"username","isAdmin","totp_enabled","profile_picture"},
 *       @OA\Property(property="username", type="string", example="ryan"),
 *       @OA\Property(property="isAdmin", type="boolean"),
 *       @OA\Property(property="totp_enabled", type="boolean"),
 *       @OA\Property(property="profile_picture", type="string", example="/api/public/profilePic.php?file=ryan.png")
 *     )
 *   ),
 *   @OA\Response(response=401, ref="#/components/responses/Unauthorized")
 * )
 */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';

header('Content-Type: application/json');

if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['error'=>'Unauthorized']);
    exit;
}

$user = $_SESSION['username'];
$data = UserModel::getUser($user);
echo json_encode($data);
