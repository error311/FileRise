<?php
require_once 'vendor/autoload.php';
require_once 'config.php';

use RobThree\Auth\Algorithm;
use RobThree\Auth\Providers\Qr\GoogleChartsQrCodeProvider;

header('Content-Type: application/json');

// Global exception handler: logs errors and returns a generic error message.
set_exception_handler(function ($e) {
    error_log("Unhandled exception: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "Internal Server Error"]);
    exit();
});

/**
 * Helper: Get the user's role from users.txt.
 */
function getUserRole($username) {
    $usersFile = USERS_DIR . USERS_FILE;
    if (file_exists($usersFile)) {
        foreach (file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(":", trim($line));
            if (count($parts) >= 3 && $parts[0] === $username) {
                return trim($parts[2]);
            }
        }
    }
    return null;
}

/* --- OIDC Authentication Flow --- */
// Detect either ?oidc=… or a callback that only has ?code=
$oidcAction = $_GET['oidc'] ?? null;
if (!$oidcAction && isset($_GET['code'])) {
    $oidcAction = 'callback';
}
if ($oidcAction) {
    $adminConfigFile = USERS_DIR . 'adminConfig.json';
    if (file_exists($adminConfigFile)) {
        $enc = file_get_contents($adminConfigFile);
        $dec = decryptData($enc, $encryptionKey);
        $cfg = $dec !== false ? json_decode($dec, true) : [];
    } else {
        $cfg = [];
    }
    $oidc_provider_url  = $cfg['oidc']['providerUrl']  ?? 'https://your-oidc-provider.com';
    $oidc_client_id     = $cfg['oidc']['clientId']     ?? 'YOUR_CLIENT_ID';
    $oidc_client_secret = $cfg['oidc']['clientSecret'] ?? 'YOUR_CLIENT_SECRET';
    // Use your production domain for redirect URI.
    $oidc_redirect_uri  = $cfg['oidc']['redirectUri']  ?? 'https://yourdomain.com/auth.php?oidc=callback';

    $oidc = new Jumbojett\OpenIDConnectClient(
        $oidc_provider_url,
        $oidc_client_id,
        $oidc_client_secret
    );
    $oidc->setRedirectURL($oidc_redirect_uri);

    if ($oidcAction === 'callback') {
        try {
            $oidc->authenticate();
            $username = $oidc->requestUserInfo('preferred_username');

            // Check if this user has a TOTP secret.
            $usersFile = USERS_DIR . USERS_FILE;
            $totp_secret = null;
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
                // Hold pending login & prompt for TOTP.
                $_SESSION['pending_login_user']   = $username;
                $_SESSION['pending_login_secret'] = $totp_secret;
                header("Location: index.html?totp_required=1");
                exit();
            }

            // No TOTP → finalize login.
            session_regenerate_id(true);
            $_SESSION["authenticated"] = true;
            $_SESSION["username"]      = $username;
            $_SESSION["isAdmin"]       = (getUserRole($username) === "1");
            $_SESSION["folderOnly"]    = loadUserPermissions($username);

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

/* --- Fallback: Form-based Authentication --- */
$usersFile = USERS_DIR . USERS_FILE;
$maxAttempts = 5;
$lockoutTime = 30 * 60; // 30 minutes
$attemptsFile = USERS_DIR . 'failed_logins.json';
$failedLogFile = USERS_DIR . 'failed_login.log';
$persistentTokensFile = USERS_DIR . 'persistent_tokens.json';

function loadFailedAttempts($file) {
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (is_array($data)) {
            return $data;
        }
    }
    return [];
}

function saveFailedAttempts($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

$ip = $_SERVER['REMOTE_ADDR'];
$currentTime = time();
$failedAttempts = loadFailedAttempts($attemptsFile);

if (isset($failedAttempts[$ip])) {
    $attemptData = $failedAttempts[$ip];
    if ($attemptData['count'] >= $maxAttempts && ($currentTime - $attemptData['last_attempt']) < $lockoutTime) {
        http_response_code(429);
        echo json_encode(["error" => "Too many failed login attempts. Please try again later."]);
        exit();
    }
}

function authenticate($username, $password) {
    global $usersFile, $encryptionKey;
    if (!file_exists($usersFile)) {
        return false;
    }
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) < 3) continue;
        if ($username === $parts[0] && password_verify($password, $parts[1])) {
            $result = ['role' => $parts[2]];
            $result['totp_secret'] = (isset($parts[3]) && !empty($parts[3]))
                ? decryptData($parts[3], $encryptionKey)
                : null;
            return $result;
        }
    }
    return false;
}

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

$user = authenticate($username, $password);
if ($user !== false) {
    if (!empty($user['totp_secret'])) {
                // If TOTP code is missing or malformed, indicate that TOTP is required.
                if (empty($data['totp_code']) || !preg_match('/^\d{6}$/', $data['totp_code'])) {
                   // ← STORE pending user & secret so recovery can see it
                    $_SESSION['pending_login_user']   = $username;
                    $_SESSION['pending_login_secret'] = $user['totp_secret'];
                    echo json_encode([
                      "totp_required" => true,
                      "message"      => "TOTP code required"
                    ]);
                    exit();
                } else {
                    $tfa = new \RobThree\Auth\TwoFactorAuth(
                        new GoogleChartsQrCodeProvider(), // QR code provider
                        'FileRise',                       // issuer
                        6,                                // number of digits
                        30,                               // period in seconds
                        Algorithm::Sha1                   // Correct enum case name from your enum
                    );
            $providedCode = trim($data['totp_code']);
            if (!$tfa->verifyCode($user['totp_secret'], $providedCode)) {
                echo json_encode(["error" => "Invalid TOTP code"]);
                exit();
            }
        }
    }
    if (isset($failedAttempts[$ip])) {
        unset($failedAttempts[$ip]);
        saveFailedAttempts($attemptsFile, $failedAttempts);
    }
    session_regenerate_id(true);
    $_SESSION["authenticated"] = true;
    $_SESSION["username"] = $username;
    $_SESSION["isAdmin"] = ($user['role'] === "1");
    $_SESSION["folderOnly"] = loadUserPermissions($username);
    
    if ($rememberMe) {
        $token = bin2hex(random_bytes(32));
        $expiry = time() + (30 * 24 * 60 * 60);
        $persistentTokens = [];
        if (file_exists($persistentTokensFile)) {
            $encryptedContent = file_get_contents($persistentTokensFile);
            $decryptedContent = decryptData($encryptedContent, $encryptionKey);
            $persistentTokens = json_decode($decryptedContent, true);
            if (!is_array($persistentTokens)) {
                $persistentTokens = [];
            }
        }
        $persistentTokens[$token] = [
            "username" => $username,
            "expiry"   => $expiry,
            "isAdmin"  => ($_SESSION["isAdmin"] === true)
        ];
        $encryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $encryptionKey);
        file_put_contents($persistentTokensFile, $encryptedContent, LOCK_EX);
        // Define $secure based on whether HTTPS is enabled
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        setcookie('remember_me_token', $token, $expiry, '/', '', $secure, true);
    }
    
    echo json_encode([
      "status" => "ok",
      "success"   => "Login successful", 
      "isAdmin"   => $_SESSION["isAdmin"],
      "folderOnly"=> $_SESSION["folderOnly"],
      "username"  => $_SESSION["username"]
    ]);
} else {
    if (isset($failedAttempts[$ip])) {
        $failedAttempts[$ip]['count']++;
        $failedAttempts[$ip]['last_attempt'] = $currentTime;
    } else {
        $failedAttempts[$ip] = ['count' => 1, 'last_attempt' => $currentTime];
    }
    saveFailedAttempts($attemptsFile, $failedAttempts);
    $logLine = date('Y-m-d H:i:s') . " - Failed login attempt for username: " . $username . " from IP: " . $ip . PHP_EOL;
    file_put_contents($failedLogFile, $logLine, FILE_APPEND);
    http_response_code(401);
    echo json_encode(["error" => "Invalid credentials"]);
}
?>