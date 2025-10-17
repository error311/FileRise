<?php
// src/controllers/UserController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';

/**
 * UserController
 * - Hardened CSRF/auth checks (works even when getallheaders() is unavailable)
 * - Consistent method checks without breaking existing clients (accepts POST as fallback for some endpoints)
 * - Stricter validation & safer defaults
 * - Fixed TOTP setup bug for pending-login users
 * - Standardized calls to UserModel (proper case)
 */
class UserController
{
    /* ---------- Small internal helpers to reduce repetition ---------- */

    /** Get headers in lowercase, robust across SAPIs. */
    private static function headersLower(): array
    {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $out = [];
        foreach ($headers as $k => $v) {
            $out[strtolower($k)] = $v;
        }
        // Fallbacks from $_SERVER if needed
        foreach ($_SERVER as $k => $v) {
            if (strpos($k, 'HTTP_') === 0) {
                $h = strtolower(str_replace('_', '-', substr($k, 5)));
                if (!isset($out[$h])) $out[$h] = $v;
            }
        }
        return $out;
    }

    /** Enforce allowed HTTP method(s); default to 405 if not allowed. */
    private static function requireMethod(array $allowed): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (!in_array($method, $allowed, true)) {
            http_response_code(405);
            header('Allow: ' . implode(', ', $allowed));
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Method not allowed']);
            exit;
        }
    }

    /** Enforce authentication (401). */
    private static function requireAuth(): void
    {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }

    /** Enforce admin (401). */
    private static function requireAdmin(): void
{
    self::requireAuth();

    // Prefer the session flag
    $isAdmin = (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true);

    // Fallback: check the user’s role in storage (e.g., users.txt/DB)
    if (!$isAdmin) {
        $u = $_SESSION['username'] ?? '';
        if ($u) {
            try {
                // UserModel::getUserRole($u) should return '1' for admins
                $isAdmin = (UserModel::getUserRole($u) === '1');
                if ($isAdmin) {
                    // Normalize session so downstream ACL checks see admin
                    $_SESSION['isAdmin'] = true;
                }
            } catch (\Throwable $e) {
                // ignore and continue to deny
            }
        }
    }

    if (!$isAdmin) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Admin privileges required.']);
        exit;
    }
}

    /** Enforce CSRF using X-CSRF-Token header (or csrfToken param as fallback). */
    private static function requireCsrf(): void
    {
        $h = self::headersLower();
        $token = trim($h['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));
        if (empty($_SESSION['csrf_token']) || $token !== $_SESSION['csrf_token']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid CSRF token']);
            exit;
        }
    }

    /** Read JSON body (empty array if not valid). */
    private static function readJson(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    /** Convenience: set JSON content type + no-store. */
    private static function jsonHeaders(): void
    {
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
    }

    /* ------------------------- End helpers -------------------------- */

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
        self::jsonHeaders();
        self::requireAdmin();

        // Retrieve users using the model
        $users = UserModel::getAllUsers();
        echo json_encode($users);
        exit;
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
        self::jsonHeaders();
        self::requireMethod(['POST']);

        // Initialize CSRF token if missing (useful for initial page load)
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        // Setup mode detection (first-run bootstrap)
        $usersFile = USERS_DIR . USERS_FILE;
        $isSetup   = (isset($_GET['setup']) && $_GET['setup'] === '1');
        $setupMode = false;
        if (
            $isSetup && (!file_exists($usersFile)
                || filesize($usersFile) === 0
                || trim(@file_get_contents($usersFile)) === ''
            )
        ) {
            $setupMode = true;
        } else {
            // Not setup: enforce CSRF + admin auth
            $h = self::headersLower();
            $receivedToken = trim($h['x-csrf-token'] ?? '');

            // Soft-fail CSRF: on mismatch, regenerate and return new token (preserve your current UX)
            if ($receivedToken !== $_SESSION['csrf_token']) {
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
                header('X-CSRF-Token: ' . $_SESSION['csrf_token']);
                echo json_encode([
                    'csrf_expired' => true,
                    'csrf_token'   => $_SESSION['csrf_token']
                ]);
                exit;
            }

            self::requireAdmin();
        }

        $data        = self::readJson();
        $newUsername = trim($data['username'] ?? '');
        $newPassword = trim($data['password'] ?? '');

        $isAdmin = $setupMode ? '1' : (!empty($data['isAdmin']) ? '1' : '0');

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
        // Keep password rules lenient to avoid breaking existing flows; enforce at least 6 chars
        if (strlen($newPassword) < 6) {
            echo json_encode(["error" => "Password must be at least 6 characters."]);
            exit;
        }

        $result = UserModel::addUser($newUsername, $newPassword, $isAdmin, $setupMode);
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
        self::jsonHeaders();
        // Accept DELETE or POST for broader compatibility
        self::requireMethod(['DELETE', 'POST']);
        self::requireAdmin();
        self::requireCsrf();

        $data = self::readJson();
        $usernameToRemove = trim($data['username'] ?? '');

        if ($usernameToRemove === '') {
            echo json_encode(["error" => "Username is required"]);
            exit;
        }
        if (!preg_match(REGEX_USER, $usernameToRemove)) {
            echo json_encode(["error" => "Invalid username format"]);
            exit;
        }
        if (!empty($_SESSION['username']) && $_SESSION['username'] === $usernameToRemove) {
            echo json_encode(["error" => "Cannot remove yourself"]);
            exit;
        }

        $result = UserModel::removeUser($usernameToRemove);
        echo json_encode($result);
        exit;
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
        self::jsonHeaders();
        self::requireAuth();

        $permissions = UserModel::getUserPermissions();
        echo json_encode($permissions);
        exit;
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
        self::jsonHeaders();
        // Accept PUT or POST for compatibility with clients that can't send PUT
        self::requireMethod(['PUT', 'POST']);
        self::requireAdmin();
        self::requireCsrf();

        $input = self::readJson();
        if (!isset($input['permissions']) || !is_array($input['permissions'])) {
            echo json_encode(["error" => "Invalid input"]);
            exit;
        }
        $permissions = $input['permissions'];

        $result = UserModel::updateUserPermissions($permissions);
        echo json_encode($result);
        exit;
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
        self::jsonHeaders();
        self::requireMethod(['POST']);
        self::requireAuth();
        self::requireCsrf();

        $username = $_SESSION['username'] ?? '';
        if ($username === '') {
            echo json_encode(["error" => "No username in session"]);
            exit;
        }

        $data = self::readJson();
        $oldPassword     = trim($data["oldPassword"] ?? "");
        $newPassword     = trim($data["newPassword"] ?? "");
        $confirmPassword = trim($data["confirmPassword"] ?? "");

        if ($oldPassword === '' || $newPassword === '' || $confirmPassword === '') {
            echo json_encode(["error" => "All fields are required."]);
            exit;
        }
        if ($newPassword !== $confirmPassword) {
            echo json_encode(["error" => "New passwords do not match."]);
            exit;
        }
        if (strlen($newPassword) < 6) {
            echo json_encode(["error" => "Password must be at least 6 characters."]);
            exit;
        }

        $result = UserModel::changePassword($username, $oldPassword, $newPassword);
        echo json_encode($result);
        exit;
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
        self::jsonHeaders();
        // Accept PUT or POST for compatibility
        self::requireMethod(['PUT', 'POST']);
        self::requireAuth();
        self::requireCsrf();

        $data = self::readJson();
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid input"]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        if ($username === '') {
            http_response_code(400);
            echo json_encode(["error" => "No username in session"]);
            exit;
        }

        $totp_enabled = isset($data['totp_enabled']) ? filter_var($data['totp_enabled'], FILTER_VALIDATE_BOOLEAN) : false;
        $result = UserModel::updateUserPanel($username, $totp_enabled);
        echo json_encode($result);
        exit;
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
        self::jsonHeaders();
        // Accept PUT or POST
        self::requireMethod(['PUT', 'POST']);
        self::requireAuth();
        self::requireCsrf();

        $username = $_SESSION['username'] ?? '';
        if ($username === '') {
            http_response_code(400);
            echo json_encode(["error" => "Username not found in session"]);
            exit;
        }

        $result = UserModel::disableTOTPSecret($username);
        if ($result) {
            echo json_encode(["success" => true, "message" => "TOTP disabled successfully."]);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to disable TOTP."]);
        }
        exit;
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
        self::jsonHeaders();
        self::requireMethod(['POST']);
        self::requireCsrf();

        $userId = $_SESSION['username'] ?? ($_SESSION['pending_login_user'] ?? null);
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
            exit;
        }
        if (!preg_match(REGEX_USER, $userId)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid user identifier']);
            exit;
        }

        $inputData = self::readJson();
        $recoveryCode = $inputData['recovery_code'] ?? '';

        $result = UserModel::recoverTOTP($userId, $recoveryCode);

        if (($result['status'] ?? '') === 'ok') {
            // Finalize login
            session_regenerate_id(true);
            $_SESSION['authenticated'] = true;
            $_SESSION['username'] = $userId;
            unset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret']);
            echo json_encode(['status' => 'ok']);
        } else {
            if (($result['message'] ?? '') === 'Too many attempts. Try again later.') {
                http_response_code(429);
            } else {
                http_response_code(400);
            }
            echo json_encode($result);
        }
        exit;
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
        self::jsonHeaders();
        self::requireMethod(['POST']);
        self::requireCsrf();

        if (empty($_SESSION['username'])) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
            exit;
        }

        $userId = $_SESSION['username'];
        if (!preg_match(REGEX_USER, $userId)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid user identifier']);
            exit;
        }

        $result = UserModel::saveTOTPRecoveryCode($userId);
        if (($result['status'] ?? '') === 'ok') {
            echo json_encode($result);
        } else {
            http_response_code(500);
            echo json_encode($result);
        }
        exit;
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
        // Allow access if authenticated OR pending TOTP
        if (!( (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) || isset($_SESSION['pending_login_user']) )) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Not authorized to access TOTP setup"]);
            exit;
        }

        self::requireCsrf();

        // Fix: if username not present (pending flow), fall back to pending_login_user
        $username = $_SESSION['username'] ?? ($_SESSION['pending_login_user'] ?? '');
        if ($username === '') {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Username not available for TOTP setup']);
            exit;
        }

        header("Content-Type: image/png");
        header('X-Content-Type-Options: nosniff');

        $result = UserModel::setupTOTP($username);
        if (isset($result['error'])) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(["error" => $result['error']]);
            exit;
        }

        echo $result['imageData'];
        exit;
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
        header('X-Content-Type-Options: nosniff');

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
        self::requireCsrf();

        // Parse & validate input
        $inputData = self::readJson();
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

        // Pending-login flow
        if (isset($_SESSION['pending_login_user'])) {
            $username      = $_SESSION['pending_login_user'];
            $pendingSecret = $_SESSION['pending_login_secret'] ?? null;
            $rememberMe    = $_SESSION['pending_login_remember_me'] ?? false;

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
                $perms = loadUserPermissions($username);
                $all[$token] = [
                    'username'      => $username,
                    'expiry'        => $expiry,
                    'isAdmin'       => ((int)UserModel::getUserRole($username) === 1),
                    'folderOnly'    => $perms['folderOnly']    ?? false,
                    'readOnly'      => $perms['readOnly']      ?? false,
                    'disableUpload' => $perms['disableUpload'] ?? false
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

            // Finalize login
            session_regenerate_id(true);
            $_SESSION['authenticated']   = true;
            $_SESSION['username']        = $username;
            $_SESSION['isAdmin']         = ((int)UserModel::getUserRole($username) === 1);
            $perms = loadUserPermissions($username);
            $_SESSION['folderOnly']      = $perms['folderOnly']    ?? false;
            $_SESSION['readOnly']        = $perms['readOnly']      ?? false;
            $_SESSION['disableUpload']   = $perms['disableUpload'] ?? false;

            unset(
                $_SESSION['pending_login_user'],
                $_SESSION['pending_login_secret'],
                $_SESSION['pending_login_remember_me'],
                $_SESSION['totp_failures']
            );

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
        if ($username === '') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Username not found in session']);
            exit;
        }

        $totpSecret = UserModel::getTOTPSecret($username);
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

        unset($_SESSION['totp_failures']);
        echo json_encode(['status' => 'ok', 'message' => 'TOTP successfully verified']);
        exit;
    }

    /**
     * Upload profile picture (multipart/form-data)
     */
    public function uploadPicture()
    {
        self::jsonHeaders();

        // Auth & CSRF
        self::requireAuth();
        self::requireCsrf();

        if (empty($_FILES['profile_picture']) || $_FILES['profile_picture']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No file uploaded or error']);
            exit;
        }
        $file = $_FILES['profile_picture'];

        // Validate MIME & size
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

        // Destination
        $uploadDir = rtrim(UPLOAD_DIR, '/\\') . '/profile_pics';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Cannot create upload folder']);
            exit;
        }

        $ext      = $allowed[$mime];
        $user     = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_SESSION['username']);
        $filename = $user . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $dest     = $uploadDir . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to save file']);
            exit;
        }

        // Assuming /uploads maps to UPLOAD_DIR publicly
        $url = '/uploads/profile_pics/' . $filename;

        $result = UserModel::setProfilePicture($_SESSION['username'], $url);
        if (!($result['success'] ?? false)) {
            @unlink($dest);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Failed to save profile picture setting'
            ]);
            exit;
        }

        echo json_encode(['success' => true, 'url' => $url]);
        exit;
    }
}
