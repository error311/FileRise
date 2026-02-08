<?php
declare(strict_types=1);
/**
 * @OA\Post(
 *   path="/api/folder/setFolderEncryption.php",
 *   summary="Set folder encryption state",
 *   description="Enables or disables folder encryption (v1 compatibility).",
 *   operationId="setFolderEncryption",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *   @OA\Parameter(name="X-CSRF-Token", in="header", required=true, @OA\Schema(type="string")),
 *   @OA\RequestBody(
 *     required=true,
 *     @OA\JsonContent(
 *       required={"folder","encrypted"},
 *       @OA\Property(property="folder", type="string", example="team/reports"),
 *       @OA\Property(property="encrypted", type="boolean", example=true)
 *     )
 *   ),
 *   @OA\Response(response=200, description="Update result"),
 *   @OA\Response(response=400, description="Invalid input"),
 *   @OA\Response(response=401, description="Unauthorized"),
 *   @OA\Response(response=403, description="Forbidden"),
 *   @OA\Response(response=404, description="Folder not found"),
 *   @OA\Response(response=409, description="Conflict"),
 *   @OA\Response(response=500, description="Server error")
 * )
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

// Auth
if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// CSRF (header preferred, align with other APIs)
$hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
$tok = $_SESSION['csrf_token'] ?? '';
if (!$hdr || !$tok || !hash_equals((string)$tok, (string)$hdr)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid CSRF token']);
    exit;
}

$username = (string)($_SESSION['username'] ?? '');
if ($username === '') {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$in = json_decode($raw, true);
if (!is_array($in)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid input.']);
    exit;
}

$folder = isset($in['folder']) ? (string)$in['folder'] : 'root';
$folder = str_replace('\\', '/', trim($folder));
$folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? 'root' : trim($folder, '/');

$encrypted = isset($in['encrypted']) ? (bool)$in['encrypted'] : null;
if ($encrypted === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing encrypted flag.']);
    exit;
}

// Basic validation
if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid folder name.']);
    exit;
}

// Ensure folder exists on disk
$base = realpath((string)UPLOAD_DIR);
if ($base === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Server misconfiguration.']);
    exit;
}
if ($folder === 'root') {
    $dir = $base;
} else {
    $guess = rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folder);
    $dir = realpath($guess);
}
if ($dir === false || !is_dir($dir) || strpos($dir, $base) !== 0) {
    http_response_code(404);
    echo json_encode(['error' => 'Folder not found.']);
    exit;
}

// v1 safety: no background encrypt/decrypt jobs.
// - Enabling encryption requires an empty folder tree (no files).
// - Disabling encryption requires no encrypted files remain in the tree.
$skipDirs = ['trash', 'profile_pics', '@eadir'];
if ($folder !== 'root') {
    // In v1 we keep "resumable_*" under the folder; ignore those
    $skipDirs[] = null; // placeholder (handled by starts-with check below)
}

$hasAnyFile = function (string $rootDir) use ($skipDirs): bool {
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($rootDir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    $seen = 0;
    foreach ($it as $p => $info) {
        if (++$seen > 20000) break;
        $name = $info->getFilename();
        if ($name === '' || $name[0] === '.') continue;
        $lower = strtolower($name);
        if (in_array($lower, $skipDirs, true)) {
            if ($info->isDir()) {
                $it->next();
            }
            continue;
        }
        if (str_starts_with($lower, 'resumable_')) {
            continue;
        }
        if ($info->isFile()) return true;
    }
    return false;
};

$hasEncryptedFile = function (string $rootDir): bool {
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($rootDir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    $seen = 0;
    foreach ($it as $p => $info) {
        if (++$seen > 40000) break;
        if (!$info->isFile()) continue;
        $name = $info->getFilename();
        if ($name === '' || $name[0] === '.') continue;
        $lower = strtolower($name);
        if ($lower === 'trash' || $lower === 'profile_pics') continue;
        if (str_starts_with($lower, 'resumable_')) continue;
        try {
            if (CryptoAtRest::isEncryptedFile($info->getPathname())) return true;
        } catch (Throwable $e) { /* ignore */ }
    }
    return false;
};

// Permission gate via capabilities (keeps logic centralized)
$caps = \FileRise\Http\Controllers\FolderController::capabilities($folder, $username);
$encCaps = (is_array($caps) && isset($caps['encryption']) && is_array($caps['encryption'])) ? $caps['encryption'] : [];
$canEncrypt = !empty($encCaps['canEncrypt']);
$canDecrypt = !empty($encCaps['canDecrypt']);

if ($encrypted && !$canEncrypt) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden: cannot enable encryption for this folder.']);
    exit;
}
if (!$encrypted && !$canDecrypt) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden: cannot disable encryption for this folder.']);
    exit;
}

if ($encrypted) {
    if ($hasAnyFile($dir)) {
        http_response_code(409);
        echo json_encode(['error' => 'Folder is not empty. v1 encryption can only be enabled on an empty folder tree (move files out first).']);
        exit;
    }
} else {
    if ($hasEncryptedFile($dir)) {
        http_response_code(409);
        echo json_encode(['error' => 'Folder still contains encrypted files. Move them out (to decrypt) before disabling folder encryption.']);
        exit;
    }
}

@session_write_close();

$res = \FileRise\Domain\FolderCrypto::setEncrypted($folder, $encrypted, $username);
if (empty($res['ok'])) {
    http_response_code(500);
    echo json_encode(['error' => $res['error'] ?? 'Failed to update encryption state.']);
    exit;
}

echo json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
