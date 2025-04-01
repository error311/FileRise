<?php
require_once 'vendor/autoload.php';
require 'config.php';
header('Content-Type: application/json');

// --- OIDC Authentication Flow ---
if (isset($_GET['oidc'])) {

    // Read and decrypt OIDC configuration from JSON file.
    $adminConfigFile = USERS_DIR . 'adminConfig.json';
    if (file_exists($adminConfigFile)) {
        $encryptedContent = file_get_contents($adminConfigFile);
        $decryptedContent = decryptData($encryptedContent, $encryptionKey);
        if ($decryptedContent === false) {
            echo json_encode(['error' => 'Failed to decrypt admin configuration.']);
            exit;
        }
        $adminConfig = json_decode($decryptedContent, true);
        if (isset($adminConfig['oidc'])) {
            $oidcConfig = $adminConfig['oidc'];
            $oidc_provider_url = !empty($oidcConfig['providerUrl']) ? $oidcConfig['providerUrl'] : 'https://your-oidc-provider.com';
            $oidc_client_id    = !empty($oidcConfig['clientId']) ? $oidcConfig['clientId'] : 'YOUR_CLIENT_ID';
            $oidc_client_secret = !empty($oidcConfig['clientSecret']) ? $oidcConfig['clientSecret'] : 'YOUR_CLIENT_SECRET';
            $oidc_redirect_uri  = !empty($oidcConfig['redirectUri']) ? $oidcConfig['redirectUri'] : 'https://yourdomain.com/auth.php?oidc=callback';
        } else {
            $oidc_provider_url = 'https://your-oidc-provider.com';
            $oidc_client_id    = 'YOUR_CLIENT_ID';
            $oidc_client_secret = 'YOUR_CLIENT_SECRET';
            $oidc_redirect_uri  = 'https://yourdomain.com/auth.php?oidc=callback';
        }
    } else {
        $oidc_provider_url = 'https://your-oidc-provider.com';
        $oidc_client_id    = 'YOUR_CLIENT_ID';
        $oidc_client_secret = 'YOUR_CLIENT_SECRET';
        $oidc_redirect_uri  = 'https://yourdomain.com/auth.php?oidc=callback';
    }

    $oidc = new Jumbojett\OpenIDConnectClient(
        $oidc_provider_url,
        $oidc_client_id,
        $oidc_client_secret
    );
    $oidc->setRedirectURL($oidc_redirect_uri);

    // Since PKCE is disabled in Keycloak, we do not set any PKCE parameters.

    if ($_GET['oidc'] === 'callback') {
        try {
            $oidc->authenticate();
            $username = $oidc->requestUserInfo('preferred_username');
            session_regenerate_id(true);
            $_SESSION["authenticated"] = true;
            $_SESSION["username"] = $username;
            $_SESSION["isAdmin"] = false;
            header("Location: index.html");
            exit();
        } catch (Exception $e) {
            echo json_encode(["error" => "Authentication failed: " . $e->getMessage()]);
            exit();
        }
    } else {
        try {
            $oidc->authenticate();
            exit();
        } catch (Exception $e) {
            echo json_encode(["error" => "Authentication initiation failed: " . $e->getMessage()]);
            exit();
        }
    }
}

// --- Fallback: Form-based Authentication ---

$usersFile = USERS_DIR . USERS_FILE;
$maxAttempts = 5;
$lockoutTime = 30 * 60;
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
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

$ip = $_SERVER['REMOTE_ADDR'];
$currentTime = time();
$failedAttempts = loadFailedAttempts($attemptsFile);

if (isset($failedAttempts[$ip])) {
    $attemptData = $failedAttempts[$ip];
    if ($attemptData['count'] >= $maxAttempts && ($currentTime - $attemptData['last_attempt']) < $lockoutTime) {
        echo json_encode(["error" => "Too many failed login attempts. Please try again later."]);
        exit();
    }
}

/*
 * Updated authenticate() function:
 * It reads each line from users.txt.
 * It expects records in the format:
 * username:hashed_password:role[:encrypted_totp_secret]
 * If a fourth field is present and non-empty, it decrypts it to obtain the TOTP secret.
 */
function authenticate($username, $password) {
    global $usersFile, $encryptionKey;
    if (!file_exists($usersFile)) {
        return false;
    }
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) < 3) continue; // Skip invalid lines.
        if ($username === $parts[0] && password_verify($password, $parts[1])) {
            $result = ['role' => $parts[2]];
            // If there's a fourth field, decrypt it to get the TOTP secret.
            if (isset($parts[3]) && !empty($parts[3])) {
                $result['totp_secret'] = decryptData($parts[3], $encryptionKey);
            } else {
                $result['totp_secret'] = null;
            }
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
    echo json_encode(["error" => "Username and password are required"]);
    exit();
}

if (!preg_match('/^[A-Za-z0-9_\- ]+$/', $username)) {
    echo json_encode(["error" => "Invalid username format. Only letters, numbers, underscores, dashes, and spaces are allowed."]);
    exit();
}

$user = authenticate($username, $password);
if ($user !== false) {
    // Only require TOTP if the user's TOTP secret is set.
    if (!empty($user['totp_secret'])) {
        if (empty($data['totp_code'])) {
            echo json_encode([
              "totp_required" => true,
              "message" => "TOTP code required"
            ]);
            exit();
        } else {
            $tfa = new \RobThree\Auth\TwoFactorAuth('FileRise');
            $providedCode = trim($data['totp_code']);
            if (!$tfa->verifyCode($user['totp_secret'], $providedCode)) {
                echo json_encode(["error" => "Invalid TOTP code"]);
                exit();
            }
        }
    }
    // --- End TOTP Integration ---

    if (isset($failedAttempts[$ip])) {
        unset($failedAttempts[$ip]);
        saveFailedAttempts($attemptsFile, $failedAttempts);
    }
    session_regenerate_id(true);
    $_SESSION["authenticated"] = true;
    $_SESSION["username"] = $username;
    $_SESSION["isAdmin"] = ($user['role'] === "1");
    
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
            "isAdmin"  => ($user['role'] === "1")
        ];
        $encryptedContent = encryptData(json_encode($persistentTokens, JSON_PRETTY_PRINT), $encryptionKey);
        file_put_contents($persistentTokensFile, $encryptedContent, LOCK_EX);
        setcookie('remember_me_token', $token, $expiry, '/', '', $secure, true);
    }
    
    echo json_encode(["success" => "Login successful", "isAdmin" => $_SESSION["isAdmin"]]);
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
    echo json_encode(["error" => "Invalid credentials"]);
}
?>