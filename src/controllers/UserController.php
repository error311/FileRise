<?php
// UserController.php located in src/controllers/

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';

class UserController
{
    /**
     * @OA\Get(
     *     path="/api/getUsers.php",
     *     summary="Retrieve a list of users",
     *     description="Returns a JSON array of users. Only available to authenticated admin users.",
     *     operationId="getUsers",
     *     tags={"Users"},
     *     @OA\Response(
     *         response=200,
     *         description="Successful response with an array of users",
     *         @OA\JsonContent(
     *             type="array",
     *             @OA\Items(
     *                 type="object",
     *                 @OA\Property(property="username", type="string", example="johndoe"),
     *                 @OA\Property(property="role", type="string", example="admin")
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized: the user is not authenticated or is not an admin"
     *     )
     * )
     */

    public function getUsers()
    {
        header('Content-Type: application/json');

        // Check authentication and admin privileges.
        if (
            !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
            !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true
        ) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Retrieve users using the model
        $users = userModel::getAllUsers();
        echo json_encode($users);
    }

    /**
     * @OA\Post(
     *     path="/api/addUser.php",
     *     summary="Add a new user",
     *     description="Adds a new user to the system. In setup mode, the new user is automatically made admin.",
     *     operationId="addUser",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"username", "password"},
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="password", type="string", example="securepassword"),
     *             @OA\Property(property="isAdmin", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User added successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User added successfully")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     )
     * )
     */

    public function addUser()
    {
        // 1) Ensure JSON output and session
        header('Content-Type: application/json');

        // 1a) Initialize CSRF token if missing
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        // 2) Determine setup mode (first-ever admin creation)
        $usersFile = USERS_DIR . USERS_FILE;
        $isSetup   = (isset($_GET['setup']) && $_GET['setup'] === '1');
        $setupMode = false;
        if (
            $isSetup && (! file_exists($usersFile)
                || filesize($usersFile) === 0
                || trim(file_get_contents($usersFile)) === ''
            )
        ) {
            $setupMode = true;
        } else {
            // 3) In non-setup, enforce CSRF + auth checks
            $headersArr    = array_change_key_case(getallheaders(), CASE_LOWER);
            $receivedToken = trim($headersArr['x-csrf-token'] ?? '');

            // 3a) Soft-fail CSRF: on mismatch, regenerate and return new token
            if ($receivedToken !== $_SESSION['csrf_token']) {
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
                header('X-CSRF-Token: ' . $_SESSION['csrf_token']);
                echo json_encode([
                    'csrf_expired' => true,
                    'csrf_token'   => $_SESSION['csrf_token']
                ]);
                exit;
            }

            // 3b) Must be logged in as admin
            if (
                empty($_SESSION['authenticated'])
                || $_SESSION['authenticated'] !== true
                || empty($_SESSION['isAdmin'])
                || $_SESSION['isAdmin'] !== true
            ) {
                echo json_encode(["error" => "Unauthorized"]);
                exit;
            }
        }

        // 4) Parse input
        $data        = json_decode(file_get_contents('php://input'), true) ?: [];
        $newUsername = trim($data['username'] ?? '');
        $newPassword = trim($data['password'] ?? '');

        // 5) Determine admin flag
        if ($setupMode) {
            $isAdmin = '1';
        } else {
            $isAdmin = !empty($data['isAdmin']) ? '1' : '0';
        }

        // 6) Validate fields
        if ($newUsername === '' || $newPassword === '') {
            echo json_encode(["error" => "Username and password required"]);
            exit;
        }
        if (!preg_match(REGEX_USER, $newUsername)) {
            echo json_encode([
                "error" => "Invalid username. Only letters, numbers, underscores, dashes, and spaces are allowed."
            ]);
            exit;
        }

        // 7) Delegate to model
        $result = userModel::addUser($newUsername, $newPassword, $isAdmin, $setupMode);

        // 8) Return model result
        echo json_encode($result);
        exit;
    }

    /**
     * @OA\Delete(
     *     path="/api/removeUser.php",
     *     summary="Remove a user",
     *     description="Removes the specified user from the system. Cannot remove the currently logged-in user.",
     *     operationId="removeUser",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"username"},
     *             @OA\Property(property="username", type="string", example="johndoe")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User removed successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User removed successfully")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     )
     * )
     */

    public function removeUser()
    {
        header('Content-Type: application/json');

        // CSRF token check.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Authentication and admin check.
        if (
            !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
            !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true
        ) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Retrieve JSON data.
        $data = json_decode(file_get_contents("php://input"), true);
        $usernameToRemove = trim($data["username"] ?? "");

        if (!$usernameToRemove) {
            echo json_encode(["error" => "Username is required"]);
            exit;
        }

        // Validate the username format.
        if (!preg_match(REGEX_USER, $usernameToRemove)) {
            echo json_encode(["error" => "Invalid username format"]);
            exit;
        }

        // Prevent removal of the currently logged-in user.
        if (isset($_SESSION['username']) && $_SESSION['username'] === $usernameToRemove) {
            echo json_encode(["error" => "Cannot remove yourself"]);
            exit;
        }

        // Delegate the removal logic to the model.
        $result = userModel::removeUser($usernameToRemove);
        echo json_encode($result);
    }

    /**
     * @OA\Get(
     *     path="/api/getUserPermissions.php",
     *     summary="Retrieve user permissions",
     *     description="Returns the permissions for the current user, or all permissions if the user is an admin.",
     *     operationId="getUserPermissions",
     *     tags={"Users"},
     *     @OA\Response(
     *         response=200,
     *         description="Successful response with user permissions",
     *         @OA\JsonContent(type="object")
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     )
     * )
     */

    public function getUserPermissions()
    {
        header('Content-Type: application/json');

        // Check if the user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Delegate to the model.
        $permissions = userModel::getUserPermissions();
        echo json_encode($permissions);
    }

    /**
     * @OA\Put(
     *     path="/api/updateUserPermissions.php",
     *     summary="Update user permissions",
     *     description="Updates permissions for users. Only available to authenticated admin users.",
     *     operationId="updateUserPermissions",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"permissions"},
     *             @OA\Property(
     *                 property="permissions",
     *                 type="array",
     *                 @OA\Items(
     *                     type="object",
     *                     @OA\Property(property="username", type="string", example="johndoe"),
     *                     @OA\Property(property="folderOnly", type="boolean", example=true),
     *                     @OA\Property(property="readOnly", type="boolean", example=false),
     *                     @OA\Property(property="disableUpload", type="boolean", example=false)
     *                 )
     *             )
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User permissions updated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User permissions updated successfully.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     )
     * )
     */

    public function updateUserPermissions()
    {
        header('Content-Type: application/json');

        // Only admins can update permissions.
        if (
            !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
            !isset($_SESSION['isAdmin']) || $_SESSION['isAdmin'] !== true
        ) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Verify CSRF token from headers.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $csrfToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Get POST input.
        $input = json_decode(file_get_contents("php://input"), true);
        if (!isset($input['permissions']) || !is_array($input['permissions'])) {
            echo json_encode(["error" => "Invalid input"]);
            exit;
        }

        $permissions = $input['permissions'];

        // Delegate to the model.
        $result = userModel::updateUserPermissions($permissions);
        echo json_encode($result);
    }

    /**
     * @OA\Post(
     *     path="/api/changePassword.php",
     *     summary="Change user password",
     *     description="Allows an authenticated user to change their password by verifying the old password and updating to a new one.",
     *     operationId="changePassword",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"oldPassword", "newPassword", "confirmPassword"},
     *             @OA\Property(property="oldPassword", type="string", example="oldpass123"),
     *             @OA\Property(property="newPassword", type="string", example="newpass456"),
     *             @OA\Property(property="confirmPassword", type="string", example="newpass456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Password updated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="Password updated successfully.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     )
     * )
     */

    public function changePassword()
    {
        header('Content-Type: application/json');

        // Ensure user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        if (!$username) {
            echo json_encode(["error" => "No username in session"]);
            exit;
        }

        // CSRF token check.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if ($receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Get POST data.
        $data = json_decode(file_get_contents("php://input"), true);
        $oldPassword = trim($data["oldPassword"] ?? "");
        $newPassword = trim($data["newPassword"] ?? "");
        $confirmPassword = trim($data["confirmPassword"] ?? "");

        // Validate input.
        if (!$oldPassword || !$newPassword || !$confirmPassword) {
            echo json_encode(["error" => "All fields are required."]);
            exit;
        }
        if ($newPassword !== $confirmPassword) {
            echo json_encode(["error" => "New passwords do not match."]);
            exit;
        }

        // Delegate password change logic to the model.
        $result = userModel::changePassword($username, $oldPassword, $newPassword);
        echo json_encode($result);
    }

    /**
     * @OA\Put(
     *     path="/api/updateUserPanel.php",
     *     summary="Update user panel settings",
     *     description="Updates user panel settings by disabling TOTP when not enabled. Accessible to authenticated users.",
     *     operationId="updateUserPanel",
     *     tags={"Users"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"totp_enabled"},
     *             @OA\Property(property="totp_enabled", type="boolean", example=false)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="User panel updated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="string", example="User panel updated: TOTP disabled")
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     )
     * )
     */

    public function updateUserPanel()
    {
        header('Content-Type: application/json');

        // Check if the user is authenticated.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(403);
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        // Verify the CSRF token.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $csrfToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Get the POST input.
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input"]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        if (!$username) {
            http_response_code(400);
            echo json_encode(["error" => "No username in session"]);
            exit;
        }

        // Extract totp_enabled, converting it to boolean.
        $totp_enabled = isset($data['totp_enabled']) ? filter_var($data['totp_enabled'], FILTER_VALIDATE_BOOLEAN) : false;

        // Delegate to the model.
        $result = userModel::updateUserPanel($username, $totp_enabled);
        echo json_encode($result);
    }

    /**
     * @OA\Put(
     *     path="/api/totp_disable.php",
     *     summary="Disable TOTP for the authenticated user",
     *     description="Clears the TOTP secret from the users file for the current user.",
     *     operationId="disableTOTP",
     *     tags={"TOTP"},
     *     @OA\Response(
     *         response=200,
     *         description="TOTP disabled successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean", example=true),
     *             @OA\Property(property="message", type="string", example="TOTP disabled successfully.")
     *         )
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Not authenticated or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Failed to disable TOTP"
     *     )
     * )
     */

    public function disableTOTP()
    {
        header('Content-Type: application/json');

        // Authentication check.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(403);
            echo json_encode(["error" => "Not authenticated"]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        if (empty($username)) {
            http_response_code(400);
            echo json_encode(["error" => "Username not found in session"]);
            exit;
        }

        // CSRF token check.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfHeader = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        // Delegate the TOTP disabling logic to the model.
        $result = userModel::disableTOTPSecret($username);

        if ($result) {
            echo json_encode(["success" => true, "message" => "TOTP disabled successfully."]);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to disable TOTP."]);
        }
    }

    /**
     * @OA\Post(
     *     path="/api/totp_recover.php",
     *     summary="Recover TOTP",
     *     description="Verifies a recovery code to disable TOTP and finalize login.",
     *     operationId="recoverTOTP",
     *     tags={"TOTP"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"recovery_code"},
     *             @OA\Property(property="recovery_code", type="string", example="ABC123DEF456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Recovery successful",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Invalid input or recovery code"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=405,
     *         description="Method not allowed"
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many attempts"
     *     )
     * )
     */

    public function recoverTOTP()
    {
        header('Content-Type: application/json');

        // 1) Only allow POST.
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            exit(json_encode(['status' => 'error', 'message' => 'Method not allowed']));
        }

        // 2) CSRF check.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfHeader = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
            http_response_code(403);
            exit(json_encode(['status' => 'error', 'message' => 'Invalid CSRF token']));
        }

        // 3) Identify the user.
        $userId = $_SESSION['username'] ?? $_SESSION['pending_login_user'] ?? null;
        if (!$userId) {
            http_response_code(401);
            exit(json_encode(['status' => 'error', 'message' => 'Unauthorized']));
        }

        // 4) Validate userId format.
        if (!preg_match(REGEX_USER, $userId)) {
            http_response_code(400);
            exit(json_encode(['status' => 'error', 'message' => 'Invalid user identifier']));
        }

        // 5) Get the recovery code from input.
        $inputData = json_decode(file_get_contents("php://input"), true);
        $recoveryCode = $inputData['recovery_code'] ?? '';

        // 6) Delegate to the model.
        $result = userModel::recoverTOTP($userId, $recoveryCode);

        if ($result['status'] === 'ok') {
            // 7) Finalize login.
            session_regenerate_id(true);
            $_SESSION['authenticated'] = true;
            $_SESSION['username'] = $userId;
            unset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret']);
            echo json_encode(['status' => 'ok']);
        } else {
            // Set appropriate HTTP code for errors.
            if ($result['message'] === 'Too many attempts. Try again later.') {
                http_response_code(429);
            } else {
                http_response_code(400);
            }
            echo json_encode($result);
        }
    }

    /**
     * @OA\Post(
     *     path="/api/totp_saveCode.php",
     *     summary="Generate and save a new TOTP recovery code",
     *     description="Generates a new TOTP recovery code for the authenticated user, stores its hash, and returns the plain text recovery code.",
     *     operationId="totpSaveCode",
     *     tags={"TOTP"},
     *     @OA\Response(
     *         response=200,
     *         description="Recovery code generated successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok"),
     *             @OA\Property(property="recoveryCode", type="string", example="ABC123DEF456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Invalid CSRF token or unauthorized"
     *     ),
     *     @OA\Response(
     *         response=405,
     *         description="Method not allowed"
     *     )
     * )
     */

    public function saveTOTPRecoveryCode()
    {
        header('Content-Type: application/json');

        // 1) Only allow POST requests.
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            error_log("totp_saveCode: invalid method {$_SERVER['REQUEST_METHOD']}");
            exit(json_encode(['status' => 'error', 'message' => 'Method not allowed']));
        }

        // 2) CSRF token check.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfHeader = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
            http_response_code(403);
            exit(json_encode(['status' => 'error', 'message' => 'Invalid CSRF token']));
        }

        // 3) Ensure the user is authenticated.
        if (empty($_SESSION['username'])) {
            http_response_code(401);
            error_log("totp_saveCode: unauthorized attempt from IP {$_SERVER['REMOTE_ADDR']}");
            exit(json_encode(['status' => 'error', 'message' => 'Unauthorized']));
        }

        // 4) Validate the username format.
        $userId = $_SESSION['username'];
        if (!preg_match(REGEX_USER, $userId)) {
            http_response_code(400);
            error_log("totp_saveCode: invalid username format: {$userId}");
            exit(json_encode(['status' => 'error', 'message' => 'Invalid user identifier']));
        }

        // 5) Delegate to the model.
        $result = userModel::saveTOTPRecoveryCode($userId);
        if ($result['status'] === 'ok') {
            echo json_encode($result);
        } else {
            http_response_code(500);
            echo json_encode($result);
        }
    }

    /**
     * @OA\Get(
     *     path="/api/totp_setup.php",
     *     summary="Set up TOTP and generate a QR code",
     *     description="Generates (or retrieves) the TOTP secret for the user and builds a QR code image for scanning.",
     *     operationId="setupTOTP",
     *     tags={"TOTP"},
     *     @OA\Response(
     *         response=200,
     *         description="QR code image for TOTP setup",
     *         @OA\MediaType(
     *             mediaType="image/png"
     *         )
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Unauthorized or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=500,
     *         description="Server error"
     *     )
     * )
     */

    public function setupTOTP()
    {
        // Allow access if the user is authenticated or pending TOTP.
        if (!((isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) || isset($_SESSION['pending_login_user']))) {
            http_response_code(403);
            exit(json_encode(["error" => "Not authorized to access TOTP setup"]));
        }

        // Verify CSRF token from headers.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(["error" => "Invalid CSRF token"]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        if (!$username) {
            http_response_code(400);
            exit;
        }

        // Set header for PNG output.
        header("Content-Type: image/png");

        // Delegate the TOTP setup work to the model.
        $result = userModel::setupTOTP($username);
        if (isset($result['error'])) {
            http_response_code(500);
            echo json_encode(["error" => $result['error']]);
            exit;
        }

        // Output the QR code image.
        echo $result['imageData'];
    }

    /**
     * @OA\Post(
     *     path="/api/totp_verify.php",
     *     summary="Verify TOTP code",
     *     description="Verifies a TOTP code and completes login for pending users or validates TOTP for setup verification.",
     *     operationId="verifyTOTP",
     *     tags={"TOTP"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"totp_code"},
     *             @OA\Property(property="totp_code", type="string", example="123456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="TOTP successfully verified",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok"),
     *             @OA\Property(property="message", type="string", example="Login successful")
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., invalid input)"
     *     ),
     *     @OA\Response(
     *         response=403,
     *         description="Not authenticated or invalid CSRF token"
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many attempts. Try again later."
     *     )
     * )
     */

    public function verifyTOTP()
    {
        header('Content-Type: application/json');
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';");

        // Rate-limit
        if (!isset($_SESSION['totp_failures'])) {
            $_SESSION['totp_failures'] = 0;
        }
        if ($_SESSION['totp_failures'] >= 5) {
            http_response_code(429);
            echo json_encode(['status' => 'error', 'message' => 'Too many TOTP attempts. Please try again later.']);
            exit;
        }

        // Must be authenticated OR pending login
        if (empty($_SESSION['authenticated']) && !isset($_SESSION['pending_login_user'])) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Not authenticated']);
            exit;
        }

        // CSRF check
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $csrfHeader = $headersArr['x-csrf-token'] ?? '';
        if (empty($_SESSION['csrf_token']) || $csrfHeader !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Invalid CSRF token']);
            exit;
        }

        // Parse & validate input
        $inputData = json_decode(file_get_contents("php://input"), true);
        $code = trim($inputData['totp_code'] ?? '');
        if (!preg_match('/^\d{6}$/', $code)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'A valid 6-digit TOTP code is required']);
            exit;
        }

        // TFA helper
        $tfa = new \RobThree\Auth\TwoFactorAuth(
            new \RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider(),
            'FileRise',
            6,
            30,
            \RobThree\Auth\Algorithm::Sha1
        );

        // === Pending-login flow (we just came from auth and need to finish login) ===
        if (isset($_SESSION['pending_login_user'])) {
            $username    = $_SESSION['pending_login_user'];
            $pendingSecret = $_SESSION['pending_login_secret'] ?? null;
            $rememberMe  = $_SESSION['pending_login_remember_me'] ?? false;

            if (!$pendingSecret || !$tfa->verifyCode($pendingSecret, $code)) {
                $_SESSION['totp_failures']++;
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Invalid TOTP code']);
                exit;
            }

            // Issue “remember me” token if requested
            if ($rememberMe) {
                $tokFile = USERS_DIR . 'persistent_tokens.json';
                $token = bin2hex(random_bytes(32));
                $expiry = time() + 30 * 24 * 60 * 60;
                $all = [];
                if (file_exists($tokFile)) {
                    $dec = decryptData(file_get_contents($tokFile), $GLOBALS['encryptionKey']);
                    $all = json_decode($dec, true) ?: [];
                }
                $all[$token] = [
                    'username'     => $username,
                    'expiry'       => $expiry,
                    'isAdmin'      => ((int)userModel::getUserRole($username) === 1),
                    'folderOnly'   => loadUserPermissions($username)['folderOnly']   ?? false,
                    'readOnly'     => loadUserPermissions($username)['readOnly']     ?? false,
                    'disableUpload' => loadUserPermissions($username)['disableUpload'] ?? false
                ];
                file_put_contents(
                    $tokFile,
                    encryptData(json_encode($all, JSON_PRETTY_PRINT), $GLOBALS['encryptionKey']),
                    LOCK_EX
                );
                $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
                setcookie('remember_me_token', $token, $expiry, '/', '', $secure, true);
                setcookie(session_name(), session_id(), $expiry, '/', '', $secure, true);
            }

            // === Finalize login into session exactly as finalizeLogin() would ===
            session_regenerate_id(true);
            $_SESSION['authenticated']   = true;
            $_SESSION['username']        = $username;
            $_SESSION['isAdmin']         = ((int)userModel::getUserRole($username) === 1);
            $perms = loadUserPermissions($username);
            $_SESSION['folderOnly']      = $perms['folderOnly']    ?? false;
            $_SESSION['readOnly']        = $perms['readOnly']      ?? false;
            $_SESSION['disableUpload']   = $perms['disableUpload'] ?? false;

            // Clean up pending markers
            unset(
                $_SESSION['pending_login_user'],
                $_SESSION['pending_login_secret'],
                $_SESSION['pending_login_remember_me'],
                $_SESSION['totp_failures']
            );

            // Send back full login payload
            echo json_encode([
                'status'        => 'ok',
                'success'       => 'Login successful',
                'isAdmin'       => $_SESSION['isAdmin'],
                'folderOnly'    => $_SESSION['folderOnly'],
                'readOnly'      => $_SESSION['readOnly'],
                'disableUpload' => $_SESSION['disableUpload'],
                'username'      => $_SESSION['username']
            ]);
            exit;
        }

        // Setup/verification flow (not pending)
        $username = $_SESSION['username'] ?? '';
        if (!$username) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Username not found in session']);
            exit;
        }

        $totpSecret = userModel::getTOTPSecret($username);
        if (!$totpSecret) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'TOTP secret not found. Please set up TOTP again.']);
            exit;
        }

        if (!$tfa->verifyCode($totpSecret, $code)) {
            $_SESSION['totp_failures']++;
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid TOTP code']);
            exit;
        }

        // Successful setup/verification
        unset($_SESSION['totp_failures']);
        echo json_encode(['status' => 'ok', 'message' => 'TOTP successfully verified']);
    }

    public function uploadPicture()
    {
        header('Content-Type: application/json');

        // 1) Auth check
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Unauthorized']);
            exit;
        }

        // 2) CSRF check
        $headers = function_exists('getallheaders')
            ? array_change_key_case(getallheaders(), CASE_LOWER)
            : [];
        $csrf = $headers['x-csrf-token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (empty($_SESSION['csrf_token']) || $csrf !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Invalid CSRF token']);
            exit;
        }

        // 3) File presence
        if (empty($_FILES['profile_picture']) || $_FILES['profile_picture']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No file uploaded or error']);
            exit;
        }
        $file = $_FILES['profile_picture'];

        // 4) Validate MIME & size
        $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif'];
        $finfo   = finfo_open(FILEINFO_MIME_TYPE);
        $mime    = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        if (!isset($allowed[$mime])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid file type']);
            exit;
        }
        if ($file['size'] > 2 * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'File too large']);
            exit;
        }

        // 5) Destination under public/uploads/profile_pics
        $uploadDir = UPLOAD_DIR . '/profile_pics';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Cannot create upload folder']);
            exit;
        }

        // 6) Move file
        $ext      = $allowed[$mime];
        $user     = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_SESSION['username']);
        $filename = $user . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $dest     = "$uploadDir/$filename";
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to save file']);
            exit;
        }

        // 7) Build public URL
        $url = '/uploads/profile_pics/' . $filename;

        // ─── THIS IS WHERE WE PERSIST INTO users.txt ───
        $result = UserModel::setProfilePicture($_SESSION['username'], $url);
        if (!$result['success']) {
            // on failure, remove the file we just wrote
            @unlink($dest);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Failed to save profile picture setting'
            ]);
            exit;
        }
        // ─────────────────────────────────────────────────

        // 8) Return success
        echo json_encode(['success' => true, 'url' => $url]);
        exit;
    }
}
