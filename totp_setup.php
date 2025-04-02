<?php
// totp_setup.php

require_once 'vendor/autoload.php';
require_once 'config.php';

use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\PngWriter;
use Endroid\QrCode\ErrorCorrectionLevel\ErrorCorrectionLevelHigh;

// For debugging purposes, you might enable error reporting temporarily:
// ini_set('display_errors', 1);
// error_reporting(E_ALL);

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(403);
    exit;
}

// Verify CSRF token provided as a GET parameter.
if (!isset($_GET['csrf']) || $_GET['csrf'] !== $_SESSION['csrf_token']) {
    http_response_code(403);
    exit;
}

$username = $_SESSION['username'] ?? '';
if (!$username) {
    http_response_code(400);
    exit;
}

// Set header to output a PNG image.
header("Content-Type: image/png");

// Define the path to your users.txt file.
$usersFile = USERS_DIR . USERS_FILE;

/**
 * Updates the TOTP secret for the given user in users.txt.
 *
 * @param string $username
 * @param string $encryptedSecret The encrypted TOTP secret.
 */
function updateUserTOTPSecret($username, $encryptedSecret) {
    global $usersFile;
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $newLines = [];
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) < 3) {
            $newLines[] = $line;
            continue;
        }
        if ($parts[0] === $username) {
            // If a fourth field exists, update it; otherwise, append it.
            if (count($parts) >= 4) {
                $parts[3] = $encryptedSecret;
            } else {
                $parts[] = $encryptedSecret;
            }
            $newLines[] = implode(':', $parts);
        } else {
            $newLines[] = $line;
        }
    }
    file_put_contents($usersFile, implode(PHP_EOL, $newLines) . PHP_EOL, LOCK_EX);
}

/**
 * Retrieves the current user's TOTP secret from users.txt (if present).
 *
 * @param string $username
 * @return string|null The decrypted TOTP secret or null if not found.
 */
function getUserTOTPSecret($username) {
    global $usersFile, $encryptionKey;
    if (!file_exists($usersFile)) {
        return null;
    }
    $lines = file($usersFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $parts = explode(':', trim($line));
        if (count($parts) >= 4 && $parts[0] === $username && !empty($parts[3])) {
            return decryptData($parts[3], $encryptionKey);
        }
    }
    return null;
}

/**
 * Retrieves the global OTPAuth URL from admin configuration.
 *
 * @return string Global OTPAuth URL template or an empty string if not set.
 */
function getGlobalOtpauthUrl() {
    global $encryptionKey;
    $adminConfigFile = USERS_DIR . 'adminConfig.json';
    if (file_exists($adminConfigFile)) {
        $encryptedContent = file_get_contents($adminConfigFile);
        $decryptedContent = decryptData($encryptedContent, $encryptionKey);
        if ($decryptedContent !== false) {
            $config = json_decode($decryptedContent, true);
            if (isset($config['globalOtpauthUrl']) && !empty($config['globalOtpauthUrl'])) {
                return $config['globalOtpauthUrl'];
            }
        }
    }
    return "";
}

$tfa = new \RobThree\Auth\TwoFactorAuth('FileRise');

// Retrieve the current TOTP secret for the user.
$totpSecret = getUserTOTPSecret($username);
if (!$totpSecret) {
    // If no TOTP secret exists, generate a new one.
    $totpSecret = $tfa->createSecret();
    $encryptedSecret = encryptData($totpSecret, $encryptionKey);
    updateUserTOTPSecret($username, $encryptedSecret);
}

// Determine the otpauth URL to use.
// If a global OTPAuth URL template is defined, replace placeholders {label} and {secret}.
// Otherwise, use the default method.
$globalOtpauthUrl = getGlobalOtpauthUrl();
if (!empty($globalOtpauthUrl)) {
    $label = "FileRise:" . $username;
    $otpauthUrl = str_replace(
        ["{label}", "{secret}"],
        [urlencode($label), $totpSecret],
        $globalOtpauthUrl
    );
} else {
    $label = urlencode("FileRise:" . $username);
    $issuer = urlencode("FileRise");
    $otpauthUrl = "otpauth://totp/{$label}?secret={$totpSecret}&issuer={$issuer}";
}

// Build the QR code using Endroid QR Code.
$result = Builder::create()
    ->writer(new PngWriter())
    ->data($otpauthUrl)
    ->errorCorrectionLevel(new ErrorCorrectionLevelHigh())
    ->build();

header('Content-Type: ' . $result->getMimeType());
echo $result->getString();
?>