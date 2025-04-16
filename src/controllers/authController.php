<?php
// src/controllers/authController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/AuthModel.php';
require_once PROJECT_ROOT . '/vendor/autoload.php';

use RobThree\Auth\Algorithm;
use RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider;
use Jumbojett\OpenIDConnectClient;

class AuthController {

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
    public function auth(): void {
        // Global exception handler.
        set_exception_handler(function ($e) {
            error_log("Unhandled exception: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["error" => "Internal Server Error"]);
            exit();
        });
        
        header('Content-Type: application/json');

        // If OIDC parameters are present, initiate OIDC flow.
        $oidcAction = $_GET['oidc'] ?? null;
        if (!$oidcAction && isset($_GET['code'])) {
            $oidcAction = 'callback';
        }
        if ($oidcAction) {
            // Load admin configuration for OIDC.
            $adminConfigFile = USERS_DIR . 'adminConfig.json';
            if (file_exists($adminConfigFile)) {
                $enc = file_get_contents($adminConfigFile);
                $dec = decryptData($enc, $encryptionKey);
                $cfg = ($dec !== false) ? json_decode($dec, true) : [];
            } else {
                $cfg = [];
            }
            $oidc_provider_url  = $cfg['oidc']['providerUrl']  ?? 'https://your-oidc-provider.com';
            $oidc_client_id     = $cfg['oidc']['clientId']     ?? 'YOUR_CLIENT_ID';
            $oidc_client_secret = $cfg['oidc']['clientSecret'] ?? 'YOUR_CLIENT_SECRET';
            $oidc_redirect_uri  = $cfg['oidc']['redirectUri']  ?? 'https://yourdomain.com/api/auth/auth.php?oidc=callback';

            $oidc = new OpenIDConnectClient($oidc_provider_url, $oidc_client_id, $oidc_client_secret);
            $oidc->setRedirectURL($oidc_redirect_uri);

            if ($oidcAction === 'callback') {
                try {
                    $oidc->authenticate();
                    $username = $oidc->requestUserInfo('preferred_username');
                    
                    // Check for TOTP secret.
                    $totp_secret = null;
                    $usersFile = USERS_DIR . USERS_FILE;
                    if (file_exists($usersFile)) {
                        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                            $parts = explode(":", trim($line));
                            if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
                                $totp_secret = decryptData($parts[3], $encryptionKey);
                                break;
                            }
                        }
                    }
                    if ($totp_secret) {
                        $_SESSION['pending_login_user'] = $username;
                        $_SESSION['pending_login_secret'] = $totp_secret;
                        header("Location: index.html?totp_required=1");
                        exit();
                    }
                    
                    // Finalize login (no TOTP)
                    session_regenerate_id(true);
                    $_SESSION["authenticated"] = true;
                    $_SESSION["username"] = $username;
                    $_SESSION["isAdmin"] = (AuthModel::getUserRole($username) === "1");
                    $_SESSION["folderOnly"] = loadUserPermissions($username);
                    header("Location: index.html");
                    exit();
                } catch (Exception $e) {
                    error_log("OIDC authentication error: " . $e->getMessage());
                    http_response_code(401);
                    echo json_encode(["error" => "Authentication failed."]);
                    exit();
                }
            } else {
                // Initiate OIDC authentication.
                try {
                    $oidc->authenticate();
                    exit();
                } catch (Exception $e) {
                    error_log("OIDC initiation error: " . $e->getMessage());
                    http_response_code(401);
                    echo json_encode(["error" => "Authentication initiation failed."]);
                    exit();
                }
            }
        }
        
        // Fallback: Form-based Authentication.
        $data = json_decode(file_get_contents("php://input"), true);
        $username = trim($data["username"] ?? "");
        $password = trim($data["password"] ?? "");
        $rememberMe = isset($data["remember_me"]) && $data["remember_me"] === true;
        
        if (!$username || !$password) {
            http_response_code(400);
            echo json_encode(["error" => "Username and password are required"]);
            exit();
        }
        
        if (!preg_match(REGEX_USER, $username)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid username format. Only letters, numbers, underscores, dashes, and spaces are allowed."]);
            exit();
        }
        
        $ip = $_SERVER['REMOTE_ADDR'];
        $currentTime = time();
        $attemptsFile = USERS_DIR . 'failed_logins.json';
        $failedAttempts = AuthModel::loadFailedAttempts($attemptsFile);
        $maxAttempts = 5;
        $lockoutTime = 30 * 60; // 30 minutes
        
        if (isset($failedAttempts[$ip])) {
            $attemptData = $failedAttempts[$ip];
            if ($attemptData['count'] >= $maxAttempts && ($currentTime - $attemptData['last_attempt']) < $lockoutTime) {
                http_response_code(429);
                echo json_encode(["error" => "Too many failed login attempts. Please try again later."]);
                exit();
            }
        }
        
        $user = AuthModel::authenticate($username, $password);
        if ($user !== false) {
            // Handle TOTP if required.
            if (!empty($user['totp_secret'])) {
                if (empty($data['totp_code']) || !preg_match('/^\d{6}$/', $data['totp_code'])) {
                    $_SESSION['pending_login_user'] = $username;
                    $_SESSION['pending_login_secret'] = $user['totp_secret'];
                    echo json_encode([
                        "totp_required" => true,
                        "message" => "TOTP code required"
                    ]);
                    exit();
                } else {
                    $tfa = new \RobThree\Auth\TwoFactorAuth(
                        new GoogleChartsQrCodeProvider(),
                        'FileRise',
                        6,
                        30,
                        Algorithm::Sha1
                    );
                    $providedCode = trim($data['totp_code']);
                    if (!$tfa->verifyCode($user['totp_secret'], $providedCode)) {
                        echo json_encode(["error" => "Invalid TOTP code"]);
                        exit();
                    }
                }
            }
            
            // Clear failed attempts.
            if (isset($failedAttempts[$ip])) {
                unset($failedAttempts[$ip]);
                AuthModel::saveFailedAttempts($attemptsFile, $failedAttempts);
            }
            
            session_regenerate_id(true);
            $_SESSION["authenticated"] = true;
            $_SESSION["username"] = $username;
            $_SESSION["isAdmin"] = ($user['role'] === "1");
            $_SESSION["folderOnly"] = loadUserPermissions($username);
            
            // Handle "remember me"
            if ($rememberMe) {
                $persistentTokensFile = USERS_DIR . 'persistent_tokens.json';
                $tokenPersistent = bin2hex(random_bytes(32));
                $expiry = time() + (30 * 24 * 60 * 60);
                $persistentTokens = [];
                if (file_exists($persistentTokensFile)) {
                    $encryptedContent = file_get_contents($persistentTokensFile);
                    $decryptedContent = decryptData($encryptedContent, $GLOBALS['encryptionKey']);
                    $persistentTokens = json_decode($decryptedContent, true);
                    if (!is_array($persistentTokens)) {
                        $persistentTokens = [];
                    }
                }
                $persistentTokens[$tokenPersistent] = [
                    "username" => $username,
                    "expiry" => $expiry,
                    "isAdmin" => ($_SESSION["isAdmin"] === true)
                ];
                $encryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $GLOBALS['encryptionKey']);
                file_put_contents($persistentTokensFile, $encryptedContent, LOCK_EX);
                $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
                setcookie('remember_me_token', $tokenPersistent, $expiry, '/', '', $secure, true);
            }
            
            echo json_encode([
                "status" => "ok",
                "success" => "Login successful",
                "isAdmin" => $_SESSION["isAdmin"],
                "folderOnly" => $_SESSION["folderOnly"],
                "username" => $_SESSION["username"]
            ]);
        } else {
            // Record failed login attempt.
            if (isset($failedAttempts[$ip])) {
                $failedAttempts[$ip]['count']++;
                $failedAttempts[$ip]['last_attempt'] = $currentTime;
            } else {
                $failedAttempts[$ip] = ['count' => 1, 'last_attempt' => $currentTime];
            }
            AuthModel::saveFailedAttempts($attemptsFile, $failedAttempts);
            $failedLogFile = USERS_DIR . 'failed_login.log';
            $logLine = date('Y-m-d H:i:s') . " - Failed login attempt for username: " . $username . " from IP: " . $ip . PHP_EOL;
            file_put_contents($failedLogFile, $logLine, FILE_APPEND);
            http_response_code(401);
            echo json_encode(["error" => "Invalid credentials"]);
        }
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
    public function checkAuth(): void {
        header('Content-Type: application/json');

        $usersFile = USERS_DIR . USERS_FILE;
        // If the users file does not exist or is empty, signal setup mode.
        if (!file_exists($usersFile) || trim(file_get_contents($usersFile)) === '') {
            error_log("checkAuth: users file not found or empty; entering setup mode.");
            echo json_encode(["setup" => true]);
            exit;
        }

        // If the session is not authenticated, output false.
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            echo json_encode(["authenticated" => false]);
            exit;
        }

        // Retrieve the username from the session.
        $username = $_SESSION['username'] ?? '';
        // Determine TOTP enabled by checking the users file.
        $totp_enabled = false;
        if ($username) {
            foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $parts = explode(':', trim($line));
                if ($parts[0] === $username && isset($parts[3]) && trim($parts[3]) !== "") {
                    $totp_enabled = true;
                    break;
                }
            }
        }
        
        // Determine admin status using AuthModel::getUserRole()
        $userRole = AuthModel::getUserRole($username);
        $isAdmin = ((int)$userRole === 1);

        $response = [
            "authenticated" => true,
            "isAdmin"       => $isAdmin,
            "totp_enabled"  => $totp_enabled,
            "username"      => $username,
            "folderOnly"    => $_SESSION["folderOnly"] ?? false
        ];
        echo json_encode($response);
        exit;
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
    public function getToken(): void {
        header('Content-Type: application/json');
        echo json_encode([
            "csrf_token" => $_SESSION['csrf_token'],
            "share_url"  => SHARE_URL
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
    public function loginBasic(): void {
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
                header("Location: index.html?totp_required=1");
                exit;
            }
            // Finalize login.
            session_regenerate_id(true);
            $_SESSION["authenticated"] = true;
            $_SESSION["username"] = $username;
            $_SESSION["isAdmin"] = (AuthModel::getUserRole($username) === "1");
            $_SESSION["folderOnly"] = AuthModel::loadFolderPermission($username);

            header("Location: index.html");
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
    public function logout(): void {
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
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        
        // Destroy the session.
        session_destroy();
        
        // Redirect the user to the login page (or index) with a logout flag.
        header("Location: index.html?logout=1");
        exit;
    }
}