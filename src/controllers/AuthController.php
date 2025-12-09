<?php
// src/controllers/AuthController.php

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
     * Lightweight, opt-in OIDC debug logger (guarded by FR_OIDC_DEBUG and config flags).
     * Never logs secrets or tokens, only metadata.
     */
    protected function logOidcDebug(string $message, array $context = []): void
    {
        // FR_OIDC_DEBUG constant is the global “force on” switch.
        $cfg  = AdminModel::getConfig();
        $oidc = $cfg['oidc'] ?? [];

        // Support both the new 'debugLogging' key and the older 'debug' / 'oidc_debug'
        $cfgDebug = !empty($oidc['debugLogging'])
            || !empty($oidc['debug'])
            || !empty($cfg['oidc_debug']);

        if ((!defined('FR_OIDC_DEBUG') || !FR_OIDC_DEBUG) && !$cfgDebug) {
            return;
        }

        // Scrub anything that looks like a secret/token just in case
        foreach ($context as $k => $v) {
            $kl = strtolower((string)$k);
            if (strpos($kl, 'secret') !== false || strpos($kl, 'token') !== false) {
                $context[$k] = '[redacted]';
            }
        }

        $suffix = $context ? ' | ' . json_encode($context) : '';
        error_log('[OIDC] ' . $message . $suffix);
    }

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
        // 1) TOTP-only step: user already passed credentials and we asked for TOTP,
        //    now they POST just totp_code.
        //
        if ($totpCode && isset($_SESSION['pending_login_user'], $_SESSION['pending_login_secret'])) {
            $username    = $_SESSION['pending_login_user'];
            $secret      = $_SESSION['pending_login_secret'];
            $rememberMe  = $_SESSION['pending_login_remember_me'] ?? false;

            $tfa = new TwoFactorAuth(new GoogleChartsQrCodeProvider(), 'FileRise', 6, 30, Algorithm::Sha1);
            if (!$tfa->verifyCode($secret, $totpCode)) {
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
        if (!$oidcAction && isset($_GET['code'])) {
            $oidcAction = 'callback';
        }

        if ($oidcAction) {
            $this->logOidcDebug('Incoming OIDC request', [
                'action'       => $oidcAction,
                'has_code'     => isset($_GET['code']),
                'issuer_param' => $_GET['iss'] ?? null,
                'request_uri'  => $_SERVER['REQUEST_URI'] ?? null,
            ]);

            $cfg          = AdminModel::getConfig();
            $clientId     = $cfg['oidc']['clientId']     ?? null;
            $clientSecret = $cfg['oidc']['clientSecret'] ?? null;

            // When configured as a public client (no secret), pass null, not an empty string.
            if ($clientSecret === '') {
                $clientSecret = null;
            }

            $tokenAuthMethod = null;
            if (defined('OIDC_TOKEN_ENDPOINT_AUTH_METHOD') && OIDC_TOKEN_ENDPOINT_AUTH_METHOD) {
                $tokenAuthMethod = OIDC_TOKEN_ENDPOINT_AUTH_METHOD;
            }

            $this->logOidcDebug('Building OIDC client', [
                'providerUrl'            => $cfg['oidc']['providerUrl'] ?? null,
                'redirectUri'            => $cfg['oidc']['redirectUri'] ?? null,
                'clientId'               => $clientId,
                'hasClientSecret'        => $clientSecret ? 'yes' : 'no',
                'tokenEndpointAuthMethod'=> $tokenAuthMethod ?: '(library default)',
            ]);

            $oidc = new OpenIDConnectClient(
                $cfg['oidc']['providerUrl'],
                $clientId ?: null,
                $clientSecret
            );

            // Always send PKCE (S256). Required by Authelia for public clients, safe for confidential ones.
            if (method_exists($oidc, 'setCodeChallengeMethod')) {
                $oidc->setCodeChallengeMethod('S256');
            }

            // client_secret_post with Authelia using config.php
            if (method_exists($oidc, 'setTokenEndpointAuthMethod') && $tokenAuthMethod) {
                $oidc->setTokenEndpointAuthMethod($tokenAuthMethod);
            }

            $oidc->setRedirectURL($cfg['oidc']['redirectUri']);
            $oidc->addScope(['openid', 'profile', 'email']);

            if ($oidcAction === 'callback') {
                try {
                    $this->logOidcDebug('OIDC callback starting authenticate()');
                    $oidc->authenticate();
                    $this->logOidcDebug('OIDC authenticate() succeeded, fetching user info');

                    // Resolve username from claims (same as your original)
                    $username =
                        $oidc->requestUserInfo('preferred_username')
                        ?: $oidc->requestUserInfo('email')
                        ?: $oidc->requestUserInfo('sub');

                    $username = trim((string)$username);
                    if ($username === '') {
                        http_response_code(401);
                        echo json_encode(['error' => 'Authentication failed: no username in OIDC claims.']);
                        exit();
                    }

                    // Pull full userinfo once so we can inspect groups / roles
                    $userinfo = $oidc->requestUserInfo();

                    // Collect groups/roles from various fields (same logic as before)
                    $rawTags = [];

                    $addTags = function ($val) use (&$rawTags) {
                        if (is_array($val)) {
                            foreach ($val as $v) {
                                $v = trim((string)$v);
                                if ($v !== '') {
                                    $rawTags[] = $v;
                                }
                            }
                        } elseif (is_string($val)) {
                            // support comma or space separated lists
                            foreach (preg_split('/[,\s]+/', $val) as $v) {
                                $v = trim($v);
                                if ($v !== '') {
                                    $rawTags[] = $v;
                                }
                            }
                        }
                    };

                    // 1) Common flat claims (includes "usergroups" which you mentioned)
                    foreach (['groups', 'group', 'usergroups', 'user_groups', 'roles'] as $field) {
                        if (isset($userinfo->$field)) {
                            $addTags($userinfo->$field);
                        }
                    }

                    // 2) realm_access.roles (Keycloak realm roles)
                    if (isset($userinfo->realm_access) && is_object($userinfo->realm_access)
                        && isset($userinfo->realm_access->roles) && is_array($userinfo->realm_access->roles)
                    ) {
                        $addTags($userinfo->realm_access->roles);
                    }

                    // 3) resource_access.<client>.roles (Keycloak client roles)
                    if (isset($userinfo->resource_access) && is_object($userinfo->resource_access)) {
                        foreach (get_object_vars($userinfo->resource_access) as $clientObj) {
                            if (is_object($clientObj) && isset($clientObj->roles) && is_array($clientObj->roles)) {
                                $addTags($clientObj->roles);
                            }
                        }
                    }

                    // Normalize tags: strip leading '/', trim, drop empties
                    $normalizedTags = [];
                    foreach ($rawTags as $g) {
                        $g = trim((string)$g);
                        if ($g === '') {
                            continue;
                        }
                        // Keycloak groups often look like "/filerise-admins" or "/frp_staff"
                        $g = ltrim($g, '/');
                        if ($g === '') {
                            continue;
                        }
                        $normalizedTags[] = $g;
                    }

                    $this->logOidcDebug('OIDC userinfo summary', [
                        'username'      => $username,
                        'has_email'     => isset($userinfo->email),
                        'has_preferred' => isset($userinfo->preferred_username),
                        'group_count'   => count($normalizedTags),
                    ]);

                    // Determine whether IdP says this user is an admin
                    $isAdminByIdp = false;
                    if (!empty($normalizedTags) && defined('FR_OIDC_ADMIN_GROUP') && FR_OIDC_ADMIN_GROUP !== '') {
                        $adminNeedle = strtolower(FR_OIDC_ADMIN_GROUP);
                        foreach ($normalizedTags as $tag) {
                            if (strtolower($tag) === $adminNeedle) {
                                $isAdminByIdp = true;
                                break;
                            }
                        }
                    }

                    // Determine which Pro groups this user should be in.
// Uses FR_OIDC_PRO_GROUP_PREFIX for backward compatibility.
// - If prefix is '', ALL groups are mapped into Pro groups.
// - If prefix is non-empty, only groups starting with that prefix are used.
$proGroupSlugs = [];
$prefix        = defined('FR_OIDC_PRO_GROUP_PREFIX') ? (string)FR_OIDC_PRO_GROUP_PREFIX : '';
$prefixLc      = strtolower($prefix);

foreach ($normalizedTags as $tag) {
    $tagLc = strtolower($tag);

    if ($prefixLc === '') {
        // Empty prefix → import all IdP groups as-is
        $proGroupSlugs[] = $tag;
    } elseif (strpos($tagLc, $prefixLc) === 0) {
        // Non-empty prefix → only groups starting with it
        $proGroupSlugs[] = $tag;
    }
}

                    // Make sure a local FileRise account exists, and upgrade to admin if IdP says so
                    $ensure = AuthModel::ensureLocalOidcUser($username, $isAdminByIdp);
                    if (isset($ensure['error'])) {
                        error_log('OIDC local user ensure failed for ' . $username . ': ' . $ensure['error']);
                        http_response_code(403);
                        echo json_encode(['error' => 'OIDC login rejected: ' . $ensure['error']]);
                        exit();
                    }

                    // Best-effort: map IdP groups into FileRise Pro groups
                    try {
                        if (method_exists('AuthModel', 'applyOidcGroupsToPro')) {
                            AuthModel::applyOidcGroupsToPro($username, $proGroupSlugs);
                        }
                    } catch (\Throwable $syncEx) {
                        error_log('OIDC Pro group sync error for ' . $username . ': ' . $syncEx->getMessage());
                    }

                    // check if this user has a TOTP secret
                    $totp_secret = null;
                    $usersFile   = USERS_DIR . USERS_FILE;
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

                    // no TOTP → finish immediately (this recomputes isAdmin from users.txt)
                    $this->finishBrowserLogin($username);
                } catch (\Exception $e) {
                    $this->logOidcDebug('OIDC authenticate() threw exception', [
                        'exception' => get_class($e),
                        'message'   => $e->getMessage(),
                    ]);
                    error_log("OIDC auth error: " . $e->getMessage());
                    http_response_code(401);
                    echo json_encode(['error' => 'Authentication failed.']);
                    exit();
                }
            } else {
                // initial OIDC redirect
                try {
                    $this->logOidcDebug('Starting OIDC authentication redirect');
                    $oidc->authenticate();
                    exit();
                } catch (\Exception $e) {
                    $this->logOidcDebug('OIDC initiation exception', [
                        'exception' => get_class($e),
                        'message'   => $e->getMessage(),
                    ]);
                    error_log("OIDC initiation error: " . $e->getMessage());
                    http_response_code(401);
                    echo json_encode(['error' => 'Authentication initiation failed.']);
                    exit();
                }
            }
        }

        //
        // 3) Form-based / AJAX login
        //
        if (!$username || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Username and password are required']);
            exit();
        }
        if (!preg_match(REGEX_USER, $username)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid username format']);
            exit();
        }

        // rate-limit
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
        if (!empty($user['totp_secret'])) {
            $_SESSION['pending_login_user']   = $username;
            $_SESSION['pending_login_secret'] = $user['totp_secret'];
            $_SESSION['pending_login_remember_me'] = $rememberMe;
            echo json_encode(['totp_required' => true]);
            exit();
        }

        // otherwise clear rate-limit & finish
        if (isset($failed[$ip])) {
            unset($failed[$ip]);
            AuthModel::saveFailedAttempts($attemptsFile, $failed);
        }
        $this->finalizeLogin($username, $rememberMe);
    }

    /**
     * Finalize an AJAX‐style login (form/basic/TOTP) by
     * issuing the session, remember-me cookie, and JSON payload.
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

        // remember-me
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
     * (used for OIDC non-AJAX flows).
     *
     * @param string    $username
     * @param bool|null $isAdminOverride  If true, force admin. If null, use users.txt role.
     */
    protected function finishBrowserLogin(string $username, ?bool $isAdminOverride = null): void
    {
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        $_SESSION['username']      = $username;

        if ($isAdminOverride === null) {
            $_SESSION['isAdmin'] = (AuthModel::getUserRole($username) === '1');
        } else {
            $_SESSION['isAdmin'] = $isAdminOverride;
        }

        $perms = loadUserPermissions($username);
        $_SESSION['folderOnly']    = $perms['folderOnly']    ?? false;
        $_SESSION['readOnly']      = $perms['readOnly']      ?? false;
        $_SESSION['disableUpload'] = $perms['disableUpload'] ?? false;

        header('Location: /index.html');
        exit();
    }

    public function checkAuth(): void
    {
        // 1) Remember-me re-login
        if (empty($_SESSION['authenticated']) && !empty($_COOKIE['remember_me_token'])) {
            $payload = AuthModel::validateRememberToken($_COOKIE['remember_me_token']);
            if ($payload) {
                $old = $_SESSION['csrf_token'] ?? bin2hex(random_bytes(32));
                session_regenerate_id(true);
                $_SESSION['csrf_token']     = $old;
                $_SESSION['authenticated']  = true;
                $_SESSION['username']       = $payload['username'];
                $_SESSION['isAdmin']        = !empty($payload['isAdmin']);
                $_SESSION['folderOnly']     = $payload['folderOnly']    ?? false;
                $_SESSION['readOnly']       = $payload['readOnly']      ?? false;
                $_SESSION['disableUpload']  = $payload['disableUpload'] ?? false;

                // TOTP enabled? (same logic as below)
                $usersFile = USERS_DIR . USERS_FILE;
                $totp      = false;
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

    public function loginBasic(): void
    {
        // Set header for plain-text or JSON as needed.
        header('Content-Type: application/json');

        // Check for HTTP Basic auth credentials.
        if (!isset($_SERVER['PHP_AUTH_USER'])) {
            header('WWW-Authenticate: Basic realm="FileRise Login"');
            header('HTTP/1.0 401 Unauthorized');
            echo 'Authorization Required';
            exit();
        }

        $username = trim($_SERVER['PHP_AUTH_USER']);
        $password = trim($_SERVER['PHP_AUTH_PW']);

        // Validate username format.
        if (!preg_match(REGEX_USER, $username)) {
            header('WWW-Authenticate: Basic realm="FileRise Login"');
            header('HTTP/1.0 401 Unauthorized');
            echo 'Invalid username format';
            exit();
        }

        // Attempt authentication.
        $role = AuthModel::authenticate($username, $password);
        if ($role !== false) {
            // Check for TOTP secret.
            $secret = AuthModel::getUserTOTPSecret($username);
            if ($secret) {
                // If TOTP is required, store pending values and redirect to prompt for TOTP.
                $_SESSION['pending_login_user']   = $username;
                $_SESSION['pending_login_secret'] = $secret;
                header("Location: /index.html?totp_required=1");
                exit();
            }

            // Finalize login.
            session_regenerate_id(true);
            $_SESSION["authenticated"] = true;
            $_SESSION["username"]      = $username;
            $_SESSION["isAdmin"]       = (AuthModel::getUserRole($username) === "1");

            // load _all_ the permissions
            $userPerms = loadUserPermissions($username);
            $_SESSION["folderOnly"]    = $userPerms["folderOnly"]    ?? false;
            $_SESSION["readOnly"]      = $userPerms["readOnly"]      ?? false;
            $_SESSION["disableUpload"] = $userPerms["disableUpload"] ?? false;

            header("Location: /index.html");
            exit();
        }

        // Invalid credentials; prompt again.
        header('WWW-Authenticate: Basic realm="FileRise Login"');
        header('HTTP/1.0 401 Unauthorized');
        echo 'Invalid credentials';
        exit();
    }

    public function logout(): void
    {
        // Retrieve headers and check CSRF token.
        $headersArr   = array_change_key_case(getallheaders(), CASE_LOWER);
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
        exit();
    }
}