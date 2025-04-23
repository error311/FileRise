<?php
// src/controllers/authController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/AuthModel.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';

use RobThree\Auth\Algorithm;
use RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider;
use Jumbojett\OpenIDConnectClient;

class AuthController
{

    /**
     * @OA\Post(
     *     path="/api/auth/auth.php",
     *     summary="Authenticate user",
     *     description="Handles user authentication via OIDC or form-based credentials. For OIDC flows, processes callbacks; otherwise, performs standard authentication with optional TOTP verification.",
     *     operationId="authUser",
     *     tags={"Auth"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"username", "password"},
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="password", type="string", example="secretpassword"),
     *             @OA\Property(property="remember_me", type="boolean", example=true),
     *             @OA\Property(property="totp_code", type="string", example="123456")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Login successful; returns user info and status",
     *         @OA\JsonContent(
     *             @OA\Property(property="status", type="string", example="ok"),
     *             @OA\Property(property="success", type="string", example="Login successful"),
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="isAdmin", type="boolean", example=true)
     *         )
     *     ),
     *     @OA\Response(
     *         response=400,
     *         description="Bad Request (e.g., missing credentials)"
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized (e.g., invalid credentials, too many attempts)"
     *     ),
     *     @OA\Response(
     *         response=429,
     *         description="Too many failed login attempts"
     *     )
     * )
     *
     * Handles user authentication via OIDC or form-based login.
     *
     * @return void Redirects on success or outputs JSON error.
     */
    // in src/controllers/AuthController.php

    public function auth(): void
    {
        header('Content-Type: application/json');
        set_exception_handler(function ($e) {
            error_log("Unhandled exception: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Internal Server Error']);
            exit();
        });

        // Decode any JSON payload
        $data       = json_decode(file_get_contents('php://input'), true) ?: [];
        $username   = trim($data['username']   ?? '');
        $password   = trim($data['password']   ?? '');
        $totpCode   = trim($data['totp_code']  ?? '');
        $rememberMe = !empty($data['remember_me']);

        //
        // 1) TOTP‑only step: user already passed credentials and we asked for TOTP,
        //    now they POST just totp_code.
        //
        if ($totpCode && isset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret'])) {
            $username = $_SESSION['pending_login_user'];
            $secret   = $_SESSION['pending_login_secret'];
            $rememberMe = $_SESSION['pending_login_remember_me'] ?? false;
            $tfa = new TwoFactorAuth(new GoogleChartsQrCodeProvider(), 'FileRise', 6, 30, Algorithm::Sha1);
            if (! $tfa->verifyCode($secret, $totpCode)) {
                echo json_encode(['error' => 'Invalid TOTP code']);
                exit();
            }
            // clear the pending markers
            unset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret']);
            // now finish login
            $this->finalizeLogin($username, $rememberMe);
        }

        //
        // 2) OIDC flow
        //
        $oidcAction = $_GET['oidc'] ?? null;
        if (! $oidcAction && isset($_GET['code'])) {
            $oidcAction = 'callback';
        }
        if ($oidcAction) {
            $cfg = AdminModel::getConfig();
            $oidc = new OpenIDConnectClient(
                $cfg['oidc']['providerUrl'],
                $cfg['oidc']['clientId'],
                $cfg['oidc']['clientSecret']
            );
            $oidc->setRedirectURL($cfg['oidc']['redirectUri']);

            if ($oidcAction === 'callback') {
                try {
                    $oidc->authenticate();
                    $username = $oidc->requestUserInfo('preferred_username');

                    // check if this user has a TOTP secret
                    $totp_secret = null;
                    $usersFile = USERS_DIR . USERS_FILE;
                    if (file_exists($usersFile)) {
                        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                            $parts = explode(':', trim($line));
                            if (count($parts) >= 4 && $parts[0] === $username && $parts[3] !== '') {
                                $totp_secret = decryptData($parts[3], $GLOBALS['encryptionKey']);
                                break;
                            }
                        }
                    }
                    if ($totp_secret) {
                        $_SESSION['pending_login_user']   = $username;
                        $_SESSION['pending_login_secret'] = $totp_secret;
                        header('Location: /index.html?totp_required=1');
                        exit();
                    }

                    // no TOTP → finish immediately
                    $this->finishBrowserLogin($username);
                } catch (\Exception $e) {
                    error_log("OIDC auth error: " . $e->getMessage());
                    http_response_code(401);
                    echo json_encode(['error' => 'Authentication failed.']);
                    exit();
                }
            } else {
                // initial OIDC redirect
                try {
                    $oidc->authenticate();
                    exit();
                } catch (\Exception $e) {
                    error_log("OIDC initiation error: " . $e->getMessage());
                    http_response_code(401);
                    echo json_encode(['error' => 'Authentication initiation failed.']);
                    exit();
                }
            }
        }

        //
        // 3) Form‑based / AJAX login
        //
        if (! $username || ! $password) {
            http_response_code(400);
            echo json_encode(['error' => 'Username and password are required']);
            exit();
        }
        if (! preg_match(REGEX_USER, $username)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid username format']);
            exit();
        }

        // rate‑limit
        $ip           = $_SERVER['REMOTE_ADDR'];
        $attemptsFile = USERS_DIR . 'failed_logins.json';
        $failed       = AuthModel::loadFailedAttempts($attemptsFile);
        if (
            isset($failed[$ip]) &&
            $failed[$ip]['count'] >= 5 &&
            time() - $failed[$ip]['last_attempt'] < 30 * 60
        ) {
            http_response_code(429);
            echo json_encode(['error' => 'Too many failed login attempts. Please try again later.']);
            exit();
        }

        $user = AuthModel::authenticate($username, $password);
        if ($user === false) {
            // record failure
            $failed[$ip] = [
                'count'        => ($failed[$ip]['count'] ?? 0) + 1,
                'last_attempt' => time()
            ];
            AuthModel::saveFailedAttempts($attemptsFile, $failed);
            http_response_code(401);
            echo json_encode(['error' => 'Invalid credentials']);
            exit();
        }

        // if this account has TOTP, ask for it
        if (! empty($user['totp_secret'])) {
            $_SESSION['pending_login_user']   = $username;
            $_SESSION['pending_login_secret'] = $user['totp_secret'];
            $_SESSION['pending_login_remember_me'] = $rememberMe;
            echo json_encode(['totp_required' => true]);
            exit();
        }

        // otherwise clear rate‑limit & finish
        if (isset($failed[$ip])) {
            unset($failed[$ip]);
            AuthModel::saveFailedAttempts($attemptsFile, $failed);
        }
        $this->finalizeLogin($username, $rememberMe);
    }

    /**
     * Finalize an AJAX‐style login (form/basic/TOTP) by
     * issuing the session, remember‑me cookie, and JSON payload.
     */
    protected function finalizeLogin(string $username, bool $rememberMe): void
    {
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        $_SESSION['username']      = $username;
        $_SESSION['isAdmin']       = (AuthModel::getUserRole($username) === '1');

        $perms = loadUserPermissions($username);
        $_SESSION['folderOnly']    = $perms['folderOnly']    ?? false;
        $_SESSION['readOnly']      = $perms['readOnly']      ?? false;
        $_SESSION['disableUpload'] = $perms['disableUpload'] ?? false;

        // remember‑me
        if ($rememberMe) {
            $tokFile = USERS_DIR . 'persistent_tokens.json';
            $token   = bin2hex(random_bytes(32));
            $expiry  = time() + 30 * 24 * 60 * 60;
            $all     = [];

            if (file_exists($tokFile)) {
                $dec = decryptData(file_get_contents($tokFile), $GLOBALS['encryptionKey']);
                $all = json_decode($dec, true) ?: [];
            }

            $all[$token] = [
                'username' => $username,
                'expiry'   => $expiry,
                'isAdmin'  => $_SESSION['isAdmin']
            ];

            file_put_contents(
                $tokFile,
                encryptData(json_encode($all, JSON_PRETTY_PRINT), $GLOBALS['encryptionKey']),
                LOCK_EX
            );

            $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

            setcookie('remember_me_token', $token, $expiry, '/', '', $secure, true);

            setcookie(
                session_name(),
                session_id(),
                $expiry,
                '/',
                '',
                $secure,
                true
            );

            session_regenerate_id(true);
        }

        echo json_encode([
            'status'        => 'ok',
            'success'       => 'Login successful',
            'isAdmin'       => $_SESSION['isAdmin'],
            'folderOnly'    => $_SESSION['folderOnly'],
            'readOnly'      => $_SESSION['readOnly'],
            'disableUpload' => $_SESSION['disableUpload'],
            'username'      => $username
        ]);
        exit();
    }

    /**
     * A version of finalizeLogin() that ends in a browser redirect
     * (used for OIDC non‑AJAX flows).
     */
    protected function finishBrowserLogin(string $username): void
    {
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        $_SESSION['username']      = $username;
        $_SESSION['isAdmin']       = (AuthModel::getUserRole($username) === '1');

        $perms = loadUserPermissions($username);
        $_SESSION['folderOnly']    = $perms['folderOnly']    ?? false;
        $_SESSION['readOnly']      = $perms['readOnly']      ?? false;
        $_SESSION['disableUpload'] = $perms['disableUpload'] ?? false;

        header('Location: /index.html');
        exit();
    }

    /**
     * @OA\Get(
     *     path="/api/auth/checkAuth.php",
     *     summary="Check authentication status",
     *     description="Checks if the current session is authenticated. If the users file is missing or empty, returns a setup flag. Also returns information about admin privileges, TOTP status, and folder-only access.",
     *     operationId="checkAuth",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=200,
     *         description="Returns authentication status and user details",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="authenticated", type="boolean", example=true),
     *             @OA\Property(property="isAdmin", type="boolean", example=true),
     *             @OA\Property(property="totp_enabled", type="boolean", example=false),
     *             @OA\Property(property="username", type="string", example="johndoe"),
     *             @OA\Property(property="folderOnly", type="boolean", example=false)
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Setup mode (if the users file is missing or empty)",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="setup", type="boolean", example=true)
     *         )
     *     )
     * )
     *
     * Checks whether the user is authenticated or if the system is in setup mode.
     *
     * @return void Outputs a JSON response with authentication details.
     */

    public function checkAuth(): void
    {

    // 1) Remember-me re-login
    if (empty($_SESSION['authenticated']) && !empty($_COOKIE['remember_me_token'])) {
        $payload = AuthModel::validateRememberToken($_COOKIE['remember_me_token']);
        if ($payload) {
            $old = $_SESSION['csrf_token'] ?? bin2hex(random_bytes(32));
            session_regenerate_id(true);
            $_SESSION['csrf_token'] = $old;
            $_SESSION['authenticated']  = true;
            $_SESSION['username']       = $payload['username'];
            $_SESSION['isAdmin']        = !empty($payload['isAdmin']);
            $_SESSION['folderOnly']     = $payload['folderOnly']    ?? false;
            $_SESSION['readOnly']       = $payload['readOnly']      ?? false;
            $_SESSION['disableUpload']  = $payload['disableUpload'] ?? false;
            // regenerate CSRF if you use one
            

            // TOTP enabled? (same logic as below)
            $usersFile = USERS_DIR . USERS_FILE;
            $totp = false;
            if (file_exists($usersFile)) {
                foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                    $parts = explode(':', trim($line));
                    if ($parts[0] === $_SESSION['username'] && !empty($parts[3])) {
                        $totp = true;
                        break;
                    }
                }
            }

            echo json_encode([
                'authenticated' => true,
                'csrf_token'    => $_SESSION['csrf_token'],
                'isAdmin'       => $_SESSION['isAdmin'],
                'totp_enabled'  => $totp,
                'username'      => $_SESSION['username'],
                'folderOnly'    => $_SESSION['folderOnly'],
                'readOnly'      => $_SESSION['readOnly'],
                'disableUpload' => $_SESSION['disableUpload']
            ]);
            exit();
        }
    }

        $usersFile = USERS_DIR . USERS_FILE;

        // 2) Setup mode?
        if (!file_exists($usersFile) || trim(file_get_contents($usersFile)) === '') {
            error_log("checkAuth: setup mode");
            echo json_encode(['setup' => true]);
            exit();
        }

        // 3) Session-based auth
        if (empty($_SESSION['authenticated'])) {
            echo json_encode(['authenticated' => false]);
            exit();
        }

        // 4) TOTP enabled?
        $totp = false;
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line));
            if ($parts[0] === ($_SESSION['username'] ?? '') && !empty($parts[3])) {
                $totp = true;
                break;
            }
        }

        // 5) Final response
        $resp = [
            'authenticated' => true,
            'isAdmin'       => !empty($_SESSION['isAdmin']),
            'totp_enabled'  => $totp,
            'username'      => $_SESSION['username'],
            'folderOnly'    => $_SESSION['folderOnly']    ?? false,
            'readOnly'      => $_SESSION['readOnly']      ?? false,
            'disableUpload' => $_SESSION['disableUpload'] ?? false
        ];

        echo json_encode($resp);
        exit();
    }

    /**
     * @OA\Get(
     *     path="/api/auth/token.php",
     *     summary="Retrieve CSRF token and share URL",
     *     description="Returns the current CSRF token along with the configured share URL.",
     *     operationId="getToken",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=200,
     *         description="CSRF token and share URL",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="csrf_token", type="string", example="0123456789abcdef..."),
     *             @OA\Property(property="share_url", type="string", example="https://yourdomain.com/share.php")
     *         )
     *     )
     * )
     *
     * Returns the CSRF token and share URL.
     *
     * @return void Outputs the JSON response.
     */
    public function getToken(): void
    {
        // 1) Ensure session and CSRF token exist
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
    
        // 2) Emit headers
        header('Content-Type: application/json');
        header('X-CSRF-Token: ' . $_SESSION['csrf_token']);
    
        // 3) Return JSON payload
        echo json_encode([
            'csrf_token' => $_SESSION['csrf_token'],
            'share_url'  => SHARE_URL
        ]);
        exit;
    }

    /**
     * @OA\Get(
     *     path="/api/auth/login_basic.php",
     *     summary="Authenticate using HTTP Basic Authentication",
     *     description="Performs HTTP Basic authentication. If credentials are missing, sends a 401 response prompting for Basic auth. On valid credentials, optionally handles TOTP verification and finalizes session login.",
     *     operationId="loginBasic",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=200,
     *         description="Login successful; redirects to index.html",
     *         @OA\JsonContent(
     *             type="object",
     *             @OA\Property(property="success", type="string", example="Login successful")
     *         )
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized due to missing credentials or invalid credentials."
     *     )
     * )
     *
     * Handles HTTP Basic authentication (with optional TOTP) and logs the user in.
     *
     * @return void Redirects on success or sends a 401 header.
     */
    public function loginBasic(): void
    {
        // Set header for plain-text or JSON as needed.
        header('Content-Type: application/json');

        // Check for HTTP Basic auth credentials.
        if (!isset($_SERVER['PHP_AUTH_USER'])) {
            header('WWW-Authenticate: Basic realm="FileRise Login"');
            header('HTTP/1.0 401 Unauthorized');
            echo 'Authorization Required';
            exit;
        }

        $username = trim($_SERVER['PHP_AUTH_USER']);
        $password = trim($_SERVER['PHP_AUTH_PW']);

        // Validate username format.
        if (!preg_match(REGEX_USER, $username)) {
            header('WWW-Authenticate: Basic realm="FileRise Login"');
            header('HTTP/1.0 401 Unauthorized');
            echo 'Invalid username format';
            exit;
        }

        // Attempt authentication.
        $role = AuthModel::authenticate($username, $password);
        if ($role !== false) {
            // Check for TOTP secret.
            $secret = AuthModel::getUserTOTPSecret($username);
            if ($secret) {
                // If TOTP is required, store pending values and redirect to prompt for TOTP.
                $_SESSION['pending_login_user'] = $username;
                $_SESSION['pending_login_secret'] = $secret;
                header("Location: /index.html?totp_required=1");
                exit;
            }
            // Finalize login.
            session_regenerate_id(true);
            $_SESSION["authenticated"] = true;
            $_SESSION["username"] = $username;
            $_SESSION["isAdmin"] = (AuthModel::getUserRole($username) === "1");
            // load _all_ the permissions
            $userPerms = loadUserPermissions($username);
            $_SESSION["folderOnly"]    = $userPerms["folderOnly"]    ?? false;
            $_SESSION["readOnly"]      = $userPerms["readOnly"]      ?? false;
            $_SESSION["disableUpload"] = $userPerms["disableUpload"] ?? false;

            header("Location: /index.html");
            exit;
        }
        // Invalid credentials; prompt again.
        header('WWW-Authenticate: Basic realm="FileRise Login"');
        header('HTTP/1.0 401 Unauthorized');
        echo 'Invalid credentials';
        exit;
    }

    /**
     * @OA\Post(
     *     path="/api/auth/logout.php",
     *     summary="Logout user",
     *     description="Clears the session, removes persistent login tokens, and redirects the user to the login page.",
     *     operationId="logoutUser",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=302,
     *         description="Redirects to the login page with a logout flag."
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     )
     * )
     *
     * Logs the user out by clearing session data, removing persistent tokens, and destroying the session.
     *
     * @return void Redirects to index.html with a logout flag.
     */
    public function logout(): void
    {
        // Retrieve headers and check CSRF token.
        $headersArr = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = isset($headersArr['x-csrf-token']) ? trim($headersArr['x-csrf-token']) : '';

        // Log mismatch but do not prevent logout.
        if (isset($_SESSION['csrf_token']) && $receivedToken !== $_SESSION['csrf_token']) {
            error_log("CSRF token mismatch on logout. Proceeding with logout.");
        }

        // Remove the "remember_me_token" from persistent tokens.
        if (isset($_COOKIE['remember_me_token'])) {
            $token = $_COOKIE['remember_me_token'];
            $persistentTokensFile = USERS_DIR . 'persistent_tokens.json';
            if (file_exists($persistentTokensFile)) {
                $encryptedContent = file_get_contents($persistentTokensFile);
                $decryptedContent = decryptData($encryptedContent, $GLOBALS['encryptionKey']);
                $persistentTokens = json_decode($decryptedContent, true);
                if (is_array($persistentTokens) && isset($persistentTokens[$token])) {
                    unset($persistentTokens[$token]);
                    $newEncryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $GLOBALS['encryptionKey']);
                    file_put_contents($persistentTokensFile, $newEncryptedContent, LOCK_EX);
                }
            }
            // Clear the cookie.
            $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
            setcookie('remember_me_token', '', time() - 3600, '/', '', $secure, true);
        }

        // Clear session data.
        $_SESSION = [];

        // Clear the session cookie.
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params["path"],
                $params["domain"],
                $params["secure"],
                $params["httponly"]
            );
        }

        // Destroy the session.
        session_destroy();

        // Redirect the user to the login page (or index) with a logout flag.
        header("Location: /index.html?logout=1");
        exit;
    }
}
