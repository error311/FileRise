<?php
// src/controllers/UserController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';
require_once PROJECT_ROOT . '/src/models/AuthModel.php';

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

    public function getUsers()
    {
        self::jsonHeaders();
        self::requireAdmin();

        // Retrieve users using the model
        $users = UserModel::getAllUsers();
        echo json_encode($users);
        exit;
    }

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

    public function getUserPermissions()
    {
        self::jsonHeaders();
        self::requireAuth();

        $permissions = UserModel::getUserPermissions();
        echo json_encode($permissions);
        exit;
    }

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
        // Block changing the demo account password when in demo mode
        if (FR_DEMO_MODE && $username === 'demo') {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => false,
                'error'   => 'Password changes are disabled on the public demo.'
            ]);
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

        if (defined('FR_DEMO_MODE') && FR_DEMO_MODE && $username === 'demo') {
            http_response_code(403);
            echo json_encode([
                'error' => 'TOTP settings are disabled for the demo account.'
            ]);
            exit;
        }

        $totp_enabled = isset($data['totp_enabled']) ? filter_var($data['totp_enabled'], FILTER_VALIDATE_BOOLEAN) : false;
        $result = UserModel::updateUserPanel($username, $totp_enabled);
        echo json_encode($result);
        exit;
    }

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

        if (defined('FR_DEMO_MODE') && FR_DEMO_MODE && $username === 'demo') {
            http_response_code(403);
            echo json_encode([
                'error' => 'TOTP settings are disabled for the demo account.'
            ]);
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

        if (defined('FR_DEMO_MODE') && FR_DEMO_MODE && $userId === 'demo') {
            http_response_code(403);
            echo json_encode([
                'status'  => 'error',
                'message' => 'TOTP settings are disabled for the demo account.',
            ]);
            exit;
        }

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

    public function setupTOTP()
    {
        // Allow access if authenticated OR pending TOTP
        if (!( (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) || isset($_SESSION['pending_login_user']) )) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Not authorized to access TOTP setup"]);
            exit;
        }

        $username = $_SESSION['username'] ?? ($_SESSION['pending_login_user'] ?? '');
        if (defined('FR_DEMO_MODE') && FR_DEMO_MODE && $username === 'demo') {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'TOTP setup is disabled for the demo account.']);
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

             // Decide final admin flag (local role + optional OIDC override)
             $roleAdmin = ((int)UserModel::getUserRole($username) === 1);
             $isAdmin   = $roleAdmin;
 
             if (!empty($_SESSION['oidc_isAdmin'])) {
                 $isAdmin = true; // IdP admin group can only elevate, never downgrade
             }
 
             // Issue remember-me token if requested
             if ($rememberMe) {
                 $tokFile = USERS_DIR . 'persistent_tokens.json';
                 $token   = bin2hex(random_bytes(32));
                 $expiry  = time() + 30 * 24 * 60 * 60;
                 $all     = [];
 
                 if (file_exists($tokFile)) {
                     $dec = decryptData(file_get_contents($tokFile), $GLOBALS['encryptionKey']);
                     $all = json_decode($dec, true) ?: [];
                 }
 
                 $perms = loadUserPermissions($username);
                 $all[$token] = [
                     'username'      => $username,
                     'expiry'        => $expiry,
                     'isAdmin'       => $isAdmin,
                     'folderOnly'    => $perms['folderOnly']    ?? false,
                     'readOnly'      => $perms['readOnly']      ?? false,
                     'disableUpload' => $perms['disableUpload'] ?? false,
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
             $_SESSION['isAdmin']         = $isAdmin;
 
             $perms = loadUserPermissions($username);
             $_SESSION['folderOnly']      = $perms['folderOnly']    ?? false;
             $_SESSION['readOnly']        = $perms['readOnly']      ?? false;
             $_SESSION['disableUpload']   = $perms['disableUpload'] ?? false;
 
             // If OIDC groups were stashed for this pending login, sync them now (after TOTP)
             if (!empty($_SESSION['oidc_groups']) && is_array($_SESSION['oidc_groups'])) {
                 AuthModel::syncOidcGroupsToPro($username, $_SESSION['oidc_groups']);
             }
 
             unset(
                 $_SESSION['pending_login_user'],
                 $_SESSION['pending_login_secret'],
                 $_SESSION['pending_login_remember_me'],
                 $_SESSION['totp_failures'],
                 $_SESSION['oidc_isAdmin'],
                 $_SESSION['oidc_groups']
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

        if (defined('FR_DEMO_MODE') && FR_DEMO_MODE) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error'   => 'Profile picture changes are disabled in the demo environment.',
            ]);
            exit;
        }

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

        $fsPath = rtrim(UPLOAD_DIR, '/\\') . '/profile_pics/' . $filename;

        // Remove the filesystem root (PROJECT_ROOT) so we get a web-relative path
        $root   = rtrim(PROJECT_ROOT, '/\\');
        $url    = preg_replace('#^' . preg_quote($root, '#') . '#', '', $fsPath);

        // Ensure it starts with /
        if ($url === '' || $url[0] !== '/') {
            $url = '/' . $url;
        }

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

    /**
     * Upload branding logo (Pro-only; admin, CSRF).
     * Reuses the profile_pics directory but does NOT change the user's avatar.
     */
    public function uploadBrandLogo()
    {
        self::jsonHeaders();

        // Auth, admin & CSRF
        self::requireAuth();
        self::requireAdmin();
        self::requireCsrf();

        if (empty($_FILES['brand_logo']) || $_FILES['brand_logo']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No file uploaded or error']);
            exit;
        }
        $file = $_FILES['brand_logo'];

        // Validate MIME & size (same rules as uploadPicture)
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

        // Destination: reuse profile_pics directory
        $uploadDir = rtrim(UPLOAD_DIR, '/\\') . '/profile_pics';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Cannot create upload folder']);
            exit;
        }

        $ext      = $allowed[$mime];
        $user     = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_SESSION['username'] ?? 'logo');
        $filename = 'branding_' . $user . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $dest     = $uploadDir . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to save file']);
            exit;
        }

        
        $fsPath = rtrim(UPLOAD_DIR, '/\\') . '/profile_pics/' . $filename;

        // Remove the filesystem root (PROJECT_ROOT) so we get a web-relative path
        $root   = rtrim(PROJECT_ROOT, '/\\');
        $url    = preg_replace('#^' . preg_quote($root, '#') . '#', '', $fsPath);

        // Ensure it starts with /
        if ($url === '' || $url[0] !== '/') {
            $url = '/' . $url;
        }

        echo json_encode(['success' => true, 'url' => $url]);
        exit;
    }

        /**
     * Upload a logo for a specific client portal (Pro-only; admin, CSRF).
     * Stores the file in UPLOAD_DIR/profile_pics and returns filename + URL.
     */
    public function uploadPortalLogo(): void
    {
        self::jsonHeaders();

        // Auth, admin & CSRF
        self::requireAuth();
        self::requireAdmin();
        self::requireCsrf();

        if (empty($_FILES['portal_logo']) || $_FILES['portal_logo']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No file uploaded or error']);
            exit;
        }

        $file = $_FILES['portal_logo'];

        // Optional: which portal (used only for filename prefix)
        $slugRaw = isset($_POST['slug']) ? (string)$_POST['slug'] : '';
        $slug    = preg_replace('/[^a-zA-Z0-9_\-]/', '', $slugRaw) ?: 'portal';

        // Validate MIME & size (same rules as uploadPicture / uploadBrandLogo)
        $allowed = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/gif'  => 'gif',
        ];

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!isset($allowed[$mime])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid file type']);
            exit;
        }

        if ($file['size'] > 2 * 1024 * 1024) { // 2MB
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'File too large']);
            exit;
        }

        // Destination: reuse profile_pics directory
        $uploadDir = rtrim(UPLOAD_DIR, '/\\') . '/profile_pics';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Cannot create upload folder']);
            exit;
        }

        $ext      = $allowed[$mime];
        $filename = 'portal_' . $slug . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $dest     = $uploadDir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to save file']);
            exit;
        }

        // Build a web path similar to uploadBrandLogo
        $fsPath = $uploadDir . '/' . $filename;

        $root = rtrim(PROJECT_ROOT, '/\\');
        $url  = preg_replace('#^' . preg_quote($root, '#') . '#', '', $fsPath);

        if ($url === '' || $url[0] !== '/') {
            $url = '/' . ltrim($url, '/\\');
        }

        echo json_encode([
            'success'  => true,
            'fileName' => $filename,
            'url'      => $url,
        ]);
        exit;
    }

    public function siteConfig(): void
    {
        header('Content-Type: application/json');

        $usersDir     = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $publicPath   = $usersDir . 'siteConfig.json';
        $adminEncPath = $usersDir . 'adminConfig.json';

        $publicMtime = is_file($publicPath) ? (int)@filemtime($publicPath) : 0;
        $adminMtime  = is_file($adminEncPath) ? (int)@filemtime($adminEncPath) : 0;

        // If public cache is present and fresh enough, serve it
        if ($publicMtime > 0 && $publicMtime >= $adminMtime) {
            $raw = @file_get_contents($publicPath);
            $data = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($data)) {
                echo json_encode($data);
                return;
            }
        }

        // Otherwise regenerate from decrypted admin config
        $cfg = AdminModel::getConfig();
        if (isset($cfg['error'])) {
            http_response_code(500);
            echo json_encode(['error' => $cfg['error']]);
            return;
        }

        $public = AdminModel::buildPublicSubset($cfg);
        $w = AdminModel::writeSiteConfig($public); // best effort
        echo json_encode($public);
    }
}
