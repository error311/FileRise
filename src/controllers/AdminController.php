<?php

declare(strict_types=1);
// src/controllers/AdminController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';
require_once PROJECT_ROOT . '/src/models/FolderCrypto.php';

class AdminController
{

    /** Enforce authentication (401). */
    public static function requireAuth(): void
    {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }

    /** Enforce admin (401). */
    public static function requireAdmin(): void
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

    /** Enforce CSRF using X-CSRF-Token header (or csrfToken param as fallback). */
    public static function requireCsrf(): void
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

    public function getConfig(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        $config = AdminModel::getConfig();
        if (isset($config['error'])) {
            http_response_code(500);
            header('Cache-Control: no-store');
            echo json_encode(['error' => $config['error']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }

        // ---- Effective ONLYOFFICE values (constants override adminConfig) ----
        $ooCfg      = is_array($config['onlyoffice'] ?? null) ? $config['onlyoffice'] : [];
        $effEnabled = defined('ONLYOFFICE_ENABLED')
            ? (bool) ONLYOFFICE_ENABLED
            : (bool) ($ooCfg['enabled'] ?? false);

        $effDocs = (defined('ONLYOFFICE_DOCS_ORIGIN') && ONLYOFFICE_DOCS_ORIGIN !== '')
            ? (string) ONLYOFFICE_DOCS_ORIGIN
            : (string) ($ooCfg['docsOrigin'] ?? '');

        $hasSecret = defined('ONLYOFFICE_JWT_SECRET')
            ? (ONLYOFFICE_JWT_SECRET !== '')
            : (!empty($ooCfg['jwtSecret']));

        $publicOriginCfg = (string) ($ooCfg['publicOrigin'] ?? '');

        // ---- Pro / license info (all guarded for clean core installs) ----
        $licenseString = null;
        if (defined('PRO_LICENSE_FILE') && PRO_LICENSE_FILE && @is_file(PRO_LICENSE_FILE)) {
            $json = @file_get_contents(PRO_LICENSE_FILE);
            if ($json !== false) {
                $decoded = json_decode($json, true);
                if (is_array($decoded) && !empty($decoded['license'])) {
                    $licenseString = (string) $decoded['license'];
                }
            }
        }

        $proActive = defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE;

        // FR_PRO_INFO is only defined when bootstrap_pro.php has run; guard it
        $proPayload = [];
        if (defined('FR_PRO_INFO') && is_array(FR_PRO_INFO)) {
            $p = FR_PRO_INFO['payload'] ?? null;
            if (is_array($p)) {
                $proPayload = $p;
            }
        }

        // ---- ClamAV / virus scanning (env/constant override awareness) ----
        $envScanRaw = getenv('VIRUS_SCAN_ENABLED');

        if ($envScanRaw !== false && $envScanRaw !== '') {
            // 1) If env var is set, it is the source of truth
            $clamScanUploads = filter_var($envScanRaw, FILTER_VALIDATE_BOOLEAN);
            $clamLockedByEnv = true;
        } elseif (defined('VIRUS_SCAN_ENABLED')) {
            // 2) Optional: support a PHP constant as a "locked" override too
            $clamScanUploads = (bool) VIRUS_SCAN_ENABLED;
            $clamLockedByEnv = true;
        } else {
            // 3) No env/constant -> use whatever was saved in the admin config
            $clamScanUploads = (bool) ($config['clamav']['scanUploads'] ?? false);
            $clamLockedByEnv = false;
        }

        $proType    = $proPayload['type']  ?? null;
        $proEmail   = $proPayload['email'] ?? null;
        $proVersion = defined('FR_PRO_BUNDLE_VERSION') ? FR_PRO_BUNDLE_VERSION : null;
        $proPlan      = $proPayload['plan']      ?? null;
        $proExpiresAt = $proPayload['expiresAt'] ?? null;
        $proMaxMajor  = $proPayload['maxMajor']  ?? null;

        $proInfo = [
            'active'   => (bool)$proActive,
            'type'     => $proType ?: '',
            'email'    => $proEmail ?: '',
            'version'  => $proVersion ?: '',
            'license'  => $licenseString ?: '',
            'plan'     => $proPlan ?: '',
            'expiresAt'=> $proExpiresAt ?: '',
            'maxMajor' => $proMaxMajor,
        ];

        $public = AdminModel::buildPublicSubset($config);

        // Safe public view of Pro status (no license string)
        $public['pro'] = [
            'active'  => (bool)$proActive,
            'version' => $proVersion ?: '',
        ];

        $isAdmin = !empty($_SESSION['authenticated']) && !empty($_SESSION['isAdmin']);

        if ($isAdmin) {
            // ---- Encryption at rest (master key status) ----
            $encSupported = CryptoAtRest::isAvailable();
            $encKeyBytes = (defined('SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES')
                ? (int)SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES
                : 32);
            $envEncRaw = getenv('FR_ENCRYPTION_MASTER_KEY');
            $envEncPresent = ($envEncRaw !== false && trim((string)$envEncRaw) !== '');
            $envEncValid = false;
            if ($envEncPresent) {
                $envEncValid = (CryptoAtRest::decodeKeyString((string)$envEncRaw) !== null);
            }

            $keyFile = rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR . 'encryption_master.key';
            $filePresent = is_file($keyFile);
            $fileValid = false;
            if ($filePresent && $encSupported) {
                $sz = @filesize($keyFile);
                $fileValid = (is_int($sz) && $sz === $encKeyBytes);
            }

            $encSource = 'missing';
            if ($envEncPresent) {
                $encSource = $envEncValid ? 'env' : 'env_invalid';
            } elseif ($filePresent) {
                $encSource = $fileValid ? 'file' : 'file_invalid';
            }

            $encHasMasterKey = CryptoAtRest::masterKeyIsConfigured();

            // admin-only extras: presence flags + proxy options + ONLYOFFICE effective view
            $envPublished = getenv('FR_PUBLISHED_URL');
            $publishedLockedByEnv = ($envPublished !== false && trim((string)$envPublished) !== '');
            $publishedCfg = (string)($config['publishedUrl'] ?? '');
            $publishedEffective = $publishedLockedByEnv ? trim((string)$envPublished) : $publishedCfg;

            $adminExtra = [
                'loginOptions' => array_merge($public['loginOptions'], [
                    'authBypass'     => (bool)($config['loginOptions']['authBypass'] ?? false),
                    'authHeaderName' => (string)($config['loginOptions']['authHeaderName'] ?? 'X-Remote-User'),
                ]),
                'oidc' => array_merge($public['oidc'], [
                    'hasClientId'     => !empty($config['oidc']['clientId']),
                    'hasClientSecret' => !empty($config['oidc']['clientSecret']),
                    'debugLogging'    => !empty($config['oidc']['debugLogging']),
                    'allowDemote'     => !empty($config['oidc']['allowDemote']),
                    'publicClient'    => !empty($config['oidc']['publicClient']),
                ]),
                'onlyoffice' => [
                    'enabled'      => $effEnabled,
                    'docsOrigin'   => $effDocs,         // effective (constants win)
                    'publicOrigin' => $publicOriginCfg, // optional override from adminConfig
                    'hasJwtSecret' => (bool)$hasSecret, // boolean only; never leak secret
                    'lockedByPhp'  => (
                        defined('ONLYOFFICE_ENABLED')
                        || defined('ONLYOFFICE_DOCS_ORIGIN')
                        || defined('ONLYOFFICE_JWT_SECRET')
                        || defined('ONLYOFFICE_PUBLIC_ORIGIN')
                    ),
                ],
                'pro' => $proInfo,
                'deployment' => [
                    'basePath' => (defined('FR_BASE_PATH') ? (string)FR_BASE_PATH : ''),
                    'shareUrl' => (defined('SHARE_URL') ? (string)SHARE_URL : ''),
                    'publishedUrl' => $publishedCfg,
                    'publishedUrlEffective' => $publishedEffective,
                    'publishedUrlLockedByEnv' => $publishedLockedByEnv,
                ],
                'encryption' => [
                    'supported'   => (bool)$encSupported,
                    'hasMasterKey'=> (bool)$encHasMasterKey,
                    'source'      => (string)$encSource, // env|env_invalid|file|file_invalid|missing
                    'lockedByEnv' => (bool)$envEncValid,
                    'envPresent'  => (bool)$envEncPresent,
                    'filePresent' => (bool)$filePresent,
                ],
                'proSearch' => (function () use ($config) {
                    $raw = isset($config['proSearch']) && is_array($config['proSearch'])
                        ? $config['proSearch']
                        : [];
                    $enabled = !empty($raw['enabled']);
                    $defaultLimit = isset($raw['defaultLimit']) ? (int)$raw['defaultLimit'] : 50;
                    $env = getenv('FR_PRO_SEARCH_ENABLED');
                    $locked = ($env !== false && $env !== '');
                    if ($locked) {
                        $val = strtolower(trim((string)$env));
                        $enabled = in_array($val, ['1', 'true', 'yes', 'on'], true);
                    }
                    return [
                        'enabled'      => $enabled,
                        'defaultLimit' => max(1, min(200, $defaultLimit)),
                        'lockedByEnv'  => $locked,
                    ];
                })(),
            ];

            header('Cache-Control: no-store'); // don’t cache admin config
            echo json_encode(array_merge($public, $adminExtra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }

        // Non-admins / unauthenticated: only the public subset
        header('Cache-Control: no-store');
        echo json_encode($public, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return;
    }

    public function setEncryptionKey(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        try {
            self::requireAuth();
            self::requireAdmin();
            self::requireCsrf();

            if (!CryptoAtRest::isAvailable()) {
                http_response_code(409);
                echo json_encode([
                    'ok' => false,
                    'error' => 'not_supported',
                    'message' => 'libsodium secretstream is not available on this PHP build.',
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }

            $envRaw = getenv('FR_ENCRYPTION_MASTER_KEY');
            $envPresent = ($envRaw !== false && trim((string)$envRaw) !== '');
            $envValid = $envPresent && (CryptoAtRest::decodeKeyString((string)$envRaw) !== null);
            if ($envValid) {
                http_response_code(409);
                echo json_encode([
                    'ok' => false,
                    'error' => 'locked_by_env',
                    'message' => 'FR_ENCRYPTION_MASTER_KEY is set; admin key file is disabled.',
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }

            $in = self::readJson();
            $action = isset($in['action']) ? trim((string)$in['action']) : '';
            $force = !empty($in['force']);

            $keyFile = rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR . 'encryption_master.key';
            if (!is_dir(META_DIR)) {
                @mkdir(META_DIR, 0775, true);
            }

            if ($action === 'clear') {
                if (!$force) {
                    $summary = self::folderCryptoSummary();
                    $encCount = (int)($summary['encryptedCount'] ?? 0);
                    $jobCount = (int)($summary['activeJobs'] ?? 0);
                    if ($encCount > 0 || $jobCount > 0) {
                        http_response_code(409);
                        echo json_encode([
                            'ok' => false,
                            'error' => ($jobCount > 0 ? 'crypto_job_active' : 'encrypted_folders_exist'),
                            'message' => 'Encrypted folders or active crypto jobs detected. Decrypt folders before removing the key, or force removal.',
                            'summary' => [
                                'encryptedCount' => $encCount,
                                'activeJobs' => $jobCount,
                            ],
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        return;
                    }

                    $scan = self::scanEncryptedFilesOnDisk();
                    $scanFound = !empty($scan['found']);
                    $scanTruncated = !empty($scan['truncated']);
                    $scanError = (string)($scan['error'] ?? '');
                    if ($scanFound || $scanTruncated || $scanError !== '') {
                        http_response_code(409);
                        echo json_encode([
                            'ok' => false,
                            'error' => $scanFound
                                ? 'encrypted_files_detected'
                                : ($scanError !== '' ? 'encrypted_files_scan_failed' : 'encrypted_files_scan_truncated'),
                            'message' => $scanFound
                                ? 'Encrypted files detected on disk. Decrypt folders before removing the key, or force removal.'
                                : ($scanError !== ''
                                    ? 'Unable to confirm that no encrypted files remain. Fix errors or force removal.'
                                    : 'Scan truncated. Unable to confirm that no encrypted files remain. Force removal only if you accept the risk.'),
                            'summary' => [
                                'encryptedCount' => $encCount,
                                'activeJobs' => $jobCount,
                                'scan' => [
                                    'found' => $scanFound,
                                    'scanned' => (int)($scan['scanned'] ?? 0),
                                    'truncated' => $scanTruncated,
                                    'error' => $scanError,
                                ],
                            ],
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        return;
                    }
                }
                if (is_file($keyFile)) {
                    @unlink($keyFile);
                }
                echo json_encode(['ok' => true, 'cleared' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }

            $keyBin = null;
            if ($action === 'generate') {
                $keyBin = random_bytes((int)SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES);
            } elseif ($action === 'set') {
                $keyStr = isset($in['key']) ? (string)$in['key'] : '';
                $keyBin = CryptoAtRest::decodeKeyString($keyStr);
                if ($keyBin === null) {
                    http_response_code(400);
                    echo json_encode(['ok' => false, 'error' => 'invalid_key', 'message' => 'Key must be 64 hex chars or base64:... for 32 bytes.']);
                    return;
                }
            } else {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => 'invalid_action']);
                return;
            }

            if (!is_string($keyBin) || strlen($keyBin) !== (int)SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES) {
                http_response_code(500);
                echo json_encode(['ok' => false, 'error' => 'key_gen_failed']);
                return;
            }

            if (@file_put_contents($keyFile, $keyBin, LOCK_EX) === false) {
                http_response_code(500);
                echo json_encode(['ok' => false, 'error' => 'write_failed']);
                return;
            }
            @chmod($keyFile, 0600);

            echo json_encode(['ok' => true, 'written' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'exception', 'message' => $e->getMessage()]);
        }
    }

    private static function folderCryptoSummary(): array
    {
        $encryptedCount = 0;
        $activeJobs = 0;

        try {
            $doc = FolderCrypto::load();
            $folders = is_array($doc['folders'] ?? null) ? $doc['folders'] : [];
            foreach ($folders as $row) {
                if (!is_array($row)) continue;
                if (!empty($row['encrypted'])) $encryptedCount++;
                if (!empty($row['job']) && is_array($row['job'])) {
                    $state = strtolower((string)($row['job']['state'] ?? ''));
                    if ($state !== '' && $state !== 'done') $activeJobs++;
                }
            }
        } catch (\Throwable $e) {
            // best-effort only
        }

        return [
            'encryptedCount' => $encryptedCount,
            'activeJobs' => $activeJobs,
        ];
    }

    private static function scanEncryptedFilesOnDisk(int $limit = 40000): array
    {
        $root = realpath((string)UPLOAD_DIR);
        if ($root === false || !is_dir($root)) {
            return [
                'found' => false,
                'scanned' => 0,
                'truncated' => true,
                'error' => 'upload_dir_unavailable',
            ];
        }

        $skipDirs = ['trash', 'profile_pics', '@eadir'];
        $scanned = 0;
        $truncated = false;

        try {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($it as $info) {
                if ($scanned >= $limit) { $truncated = true; break; }
                if (!$info instanceof SplFileInfo) continue;

                $name = $info->getFilename();
                if ($name === '' || $name[0] === '.') continue;
                $lower = strtolower($name);
                if (in_array($lower, $skipDirs, true)) {
                    continue;
                }
                if (str_starts_with($lower, 'resumable_')) {
                    continue;
                }
                if ($info->isDir() || $info->isLink()) {
                    continue;
                }

                $scanned++;
                try {
                    if (CryptoAtRest::isEncryptedFile($info->getPathname())) {
                        return [
                            'found' => true,
                            'scanned' => $scanned,
                            'truncated' => false,
                            'error' => '',
                        ];
                    }
                } catch (\Throwable $e) {
                    // ignore per-file errors
                }
            }
        } catch (\Throwable $e) {
            return [
                'found' => false,
                'scanned' => $scanned,
                'truncated' => true,
                'error' => 'scan_failed',
            ];
        }

        return [
            'found' => false,
            'scanned' => $scanned,
            'truncated' => $truncated,
            'error' => '',
        ];
    }


    public static function virusLog(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        self::requireAdmin();

        // Pro check
        $isProActive = (defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE);
        if (!$isProActive) {
            http_response_code(403);
            echo json_encode([
                'ok'      => false,
                'error'   => 'pro_required',
                'message' => 'FileRise Pro is not active on this instance.',
            ]);
            return;
        }

        $logFile = rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR . 'virus_detections.log';
        $limit   = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 200;

        $entries = [];
        $hasMore = false;

        if (is_file($logFile) && is_readable($logFile)) {
            $lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            $total = count($lines);

            if ($total > $limit) {
                $hasMore = true;
                $lines   = array_slice($lines, -$limit);
            }

            $lines = array_reverse($lines); // newest first

            foreach ($lines as $line) {
                $rec = json_decode($line, true);
                if (!is_array($rec)) {
                    continue;
                }

                $entries[] = [
                    'ts'       => $rec['ts']       ?? null,
                    'user'     => $rec['user']     ?? 'Unknown',
                    'ip'       => $rec['ip']       ?? 'unknown',
                    'folder'   => $rec['folder']   ?? 'root',
                    'file'     => $rec['file']     ?? '',
                    'source'   => $rec['source']   ?? 'normal',
                    'engine'   => $rec['engine']   ?? '',
                    'exitCode' => $rec['exitCode'] ?? null,
                    'message'  => $rec['message']  ?? '',
                ];
            }
        }

        $format = isset($_GET['format']) ? strtolower((string)$_GET['format']) : 'json';

        // CSV export
        if ($format === 'csv') {
            header_remove('Content-Type');
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="filerise-virus-detections.csv"');

            $out = fopen('php://output', 'wb');
            if ($out === false) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode([
                    'ok'    => false,
                    'error' => 'stream_error',
                ]);
                return;
            }

            fputcsv($out, [
                'timestamp_utc',
                'user',
                'ip',
                'folder',
                'file',
                'source',
                'engine',
                'exitCode',
                'message',
            ]);

            foreach ($entries as $row) {
                fputcsv($out, [
                    $row['ts']       ?? '',
                    $row['user']     ?? '',
                    $row['ip']       ?? '',
                    $row['folder']   ?? '',
                    $row['file']     ?? '',
                    $row['source']   ?? '',
                    $row['engine']   ?? '',
                    (string)($row['exitCode'] ?? ''),
                    $row['message']  ?? '',
                ]);
            }

            fclose($out);
            return;
        }

        // JSON response
        http_response_code(200);
        echo json_encode([
            'ok'      => true,
            'entries' => $entries,
            'hasMore' => $hasMore,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    public static function clamavTest(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        self::requireAdmin();

        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed.']);
            return;
        }

        $cmd = defined('VIRUS_SCAN_CMD') ? VIRUS_SCAN_CMD : 'clamscan';

        // engine version (non-fatal)
        $versionOutput = [];
        $versionCode   = 0;
        @exec(escapeshellcmd($cmd) . ' --version 2>&1', $versionOutput, $versionCode);
        $engineLine = trim($versionOutput[0] ?? '');
        $engineInfo = $engineLine ?: null;

        // temp file
        $tmpFile = tempnam(sys_get_temp_dir(), 'fr_clamtest_');
        if ($tmpFile === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Unable to create temporary test file.']);
            return;
        }

        file_put_contents($tmpFile, "FileRise ClamAV connectivity test\n");

        $scanOutput = [];
        $scanCode   = 0;
        $scanCmd = escapeshellcmd($cmd)
            . ' --stdout --no-summary '
            . escapeshellarg($tmpFile)
            . ' 2>&1';

        @exec($scanCmd, $scanOutput, $scanCode);
        @unlink($tmpFile);

        if ($scanCode === 0) {
            echo json_encode([
                'success' => true,
                'command' => $cmd,
                'engine'  => $engineInfo,
                'details' => 'Test file scanned successfully – no malware detected (exit code 0).',
            ]);
            return;
        }

        $raw = trim(implode("\n", $scanOutput));

        http_response_code(200);
        echo json_encode([
            'success' => false,
            'error'   => 'ClamAV returned exit code ' . $scanCode . '. ' .
                'Check that ClamAV is installed and its virus database is up to date.',
            'command' => $cmd,
            'engine'  => $engineInfo,
            'details' => $raw,
        ]);
    }

    public function setLicense(): void
    {
        // Always respond JSON
        header('Content-Type: application/json; charset=utf-8');

        try {
            // Same guards as other admin endpoints
            self::requireAuth();
            self::requireAdmin();
            self::requireCsrf();

            $raw = file_get_contents('php://input');
            $data = json_decode($raw ?: '{}', true);
            if (!is_array($data)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
                return;
            }

            $license = isset($data['license']) ? trim((string)$data['license']) : '';

            // Store license + updatedAt in JSON file
            if (!defined('PRO_LICENSE_FILE')) {
                // Fallback if constant not defined for some reason
                define('PRO_LICENSE_FILE', rtrim(USERS_DIR, "/\\") . '/proLicense.json');
            }

            $payload = [
                'license'   => $license,
                'updatedAt' => gmdate('c'),
            ];

            $dir = dirname(PRO_LICENSE_FILE);
            if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to create license dir']);
                return;
            }

            $json = json_encode($payload, JSON_PRETTY_PRINT);
            if ($json === false || file_put_contents(PRO_LICENSE_FILE, $json) === false) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to write license file']);
                return;
            }

            echo json_encode(['success' => true]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Exception: ' . $e->getMessage(),
            ]);
        }
    }

    public function getProPortals(): array
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            throw new RuntimeException('FileRise Pro is not active.');
        }

        $proPortalsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProPortals.php';
        if (!is_file($proPortalsPath)) {
            throw new RuntimeException('ProPortals.php not found in Pro bundle.');
        }

        require_once $proPortalsPath;

        // ProPortals is implemented in the Pro bundle and handles JSON storage.
        $store   = new ProPortals(FR_PRO_BUNDLE_DIR);
        $portals = $store->listPortals();

        return $portals;
    }

    /**
     * @param array $portalsPayload Raw "portals" array from JSON body
     */
    public function saveProPortals(array $portalsPayload): void
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            throw new RuntimeException('FileRise Pro is not active.');
        }

        $proPortalsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProPortals.php';
        if (!is_file($proPortalsPath)) {
            throw new RuntimeException('ProPortals.php not found in Pro bundle.');
        }

        require_once $proPortalsPath;

        if (!is_array($portalsPayload)) {
            throw new InvalidArgumentException('Invalid portals format.');
        }

        $data    = ['portals' => []];
        $invalid = [];

        foreach ($portalsPayload as $slug => $info) {
            $slug = trim((string)$slug);

            if (!is_array($info)) {
                $info = [];
            }

            $label  = trim((string)($info['label'] ?? $slug));
            $folder = trim((string)($info['folder'] ?? ''));

            // Require both slug and folder; collect invalid ones so the UI can warn.
            if ($slug === '' || $folder === '') {
                $invalid[] = $label !== '' ? $label : ($slug !== '' ? $slug : '(unnamed portal)');
                continue;
            }

            $clientEmail  = trim((string)($info['clientEmail'] ?? ''));
            $uploadOnly   = !empty($info['uploadOnly']);
            $allowDownload = array_key_exists('allowDownload', $info)
                ? !empty($info['allowDownload'])
                : true;
            $expiresAt    = trim((string)($info['expiresAt'] ?? ''));

            // Branding + form behavior
            $title        = trim((string)($info['title'] ?? ''));
            $introText    = trim((string)($info['introText'] ?? ''));
            $requireForm  = !empty($info['requireForm']);
            $brandColor   = trim((string)($info['brandColor'] ?? ''));
            $footerText   = trim((string)($info['footerText'] ?? ''));

            // Optional logo info
            $logoFile = trim((string)($info['logoFile'] ?? ''));
            $logoUrl  = trim((string)($info['logoUrl']  ?? ''));

            // Upload rules / thank-you behavior
            $uploadMaxSizeMb    = isset($info['uploadMaxSizeMb']) ? (int)$info['uploadMaxSizeMb'] : 0;
            $uploadExtWhitelist = trim((string)($info['uploadExtWhitelist'] ?? ''));
            $uploadMaxPerDay    = isset($info['uploadMaxPerDay']) ? (int)$info['uploadMaxPerDay'] : 0;
            $showThankYou       = !empty($info['showThankYou']);
            $thankYouText       = trim((string)($info['thankYouText'] ?? ''));

            // Form defaults
            $formDefaults = isset($info['formDefaults']) && is_array($info['formDefaults'])
                ? $info['formDefaults']
                : [];

            $formDefaults = [
                'name'      => trim((string)($formDefaults['name'] ?? '')),
                'email'     => trim((string)($formDefaults['email'] ?? '')),
                'reference' => trim((string)($formDefaults['reference'] ?? '')),
                'notes'     => trim((string)($formDefaults['notes'] ?? '')),
            ];

            // Required flags
            $formRequired = isset($info['formRequired']) && is_array($info['formRequired'])
                ? $info['formRequired']
                : [];

            $formRequired = [
                'name'      => !empty($formRequired['name']),
                'email'     => !empty($formRequired['email']),
                'reference' => !empty($formRequired['reference']),
                'notes'     => !empty($formRequired['notes']),
            ];

            // Labels
            $formLabels = isset($info['formLabels']) && is_array($info['formLabels'])
                ? $info['formLabels']
                : [];

            $formLabels = [
                'name'      => trim((string)($formLabels['name'] ?? 'Name')),
                'email'     => trim((string)($formLabels['email'] ?? 'Email')),
                'reference' => trim((string)($formLabels['reference'] ?? 'Reference / Case / Order #')),
                'notes'     => trim((string)($formLabels['notes'] ?? 'Notes')),
            ];

            // Visibility
            $formVisible = isset($info['formVisible']) && is_array($info['formVisible'])
                ? $info['formVisible']
                : [];

            $formVisible = [
                'name'      => !array_key_exists('name', $formVisible)      || !empty($formVisible['name']),
                'email'     => !array_key_exists('email', $formVisible)     || !empty($formVisible['email']),
                'reference' => !array_key_exists('reference', $formVisible) || !empty($formVisible['reference']),
                'notes'     => !array_key_exists('notes', $formVisible)     || !empty($formVisible['notes']),
            ];



            $data['portals'][$slug] = [
                'label'              => $label,
                'folder'             => $folder,
                'clientEmail'        => $clientEmail,
                'uploadOnly'         => $uploadOnly,
                'allowDownload'      => $allowDownload,
                'expiresAt'          => $expiresAt,
                'title'              => $title,
                'introText'          => $introText,
                'requireForm'        => $requireForm,
                'brandColor'         => $brandColor,
                'footerText'         => $footerText,
                'logoFile'           => $logoFile,
                'logoUrl'            => $logoUrl,
                'uploadMaxSizeMb'    => $uploadMaxSizeMb,
                'uploadExtWhitelist' => $uploadExtWhitelist,
                'uploadMaxPerDay'    => $uploadMaxPerDay,
                'showThankYou'       => $showThankYou,
                'thankYouText'       => $thankYouText,
                'formDefaults'       => $formDefaults,
                'formRequired'       => $formRequired,
                'formLabels'         => $formLabels,
                'formVisible'        => $formVisible,
            ];
        }
        if (!empty($invalid)) {
            throw new InvalidArgumentException(
                'One or more portals are missing a slug or folder: ' . implode(', ', $invalid)
            );
        }


        $store = new ProPortals(FR_PRO_BUNDLE_DIR);
        $ok    = $store->savePortals($data);

        if (!$ok) {
            throw new RuntimeException('Could not write portals.json');
        }
    }

    public function getProGroups(): array
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            throw new RuntimeException('FileRise Pro is not active.');
        }

        $proGroupsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProGroups.php';
        if (!is_file($proGroupsPath)) {
            throw new RuntimeException('ProGroups.php not found in Pro bundle.');
        }

        require_once $proGroupsPath;

        $store  = new ProGroups(FR_PRO_BUNDLE_DIR);
        $groups = $store->listGroups();

        return $groups;
    }

    /**
     * @param array $groupsPayload Raw "groups" array from JSON body
     */
    public function saveProGroups(array $groupsPayload): void
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            throw new RuntimeException('FileRise Pro is not active.');
        }

        $proGroupsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProGroups.php';
        if (!is_file($proGroupsPath)) {
            throw new RuntimeException('ProGroups.php not found in Pro bundle.');
        }

        require_once $proGroupsPath;

        // Normalize / validate the payload into the canonical structure
        if (!is_array($groupsPayload)) {
            throw new InvalidArgumentException('Invalid groups format.');
        }

        $data = ['groups' => []];

        foreach ($groupsPayload as $name => $info) {
            $name = trim((string)$name);
            if ($name === '') {
                continue;
            }

            $label   = isset($info['label']) ? trim((string)$info['label']) : $name;
            $members = isset($info['members']) && is_array($info['members']) ? $info['members'] : [];
            $grants  = isset($info['grants']) && is_array($info['grants']) ? $info['grants'] : [];

            $data['groups'][$name] = [
                'name'    => $name,
                'label'   => $label,
                'members' => array_values(array_unique(array_map('strval', $members))),
                'grants'  => $grants,
            ];
        }

        $store = new ProGroups(FR_PRO_BUNDLE_DIR);
        if (!$store->save($data)) {
            throw new RuntimeException('Could not write groups.json');
        }
    }


    public function testOidcConfig(array $payload): array
    {
        // 1) Resolve providerUrl:
        //    - Prefer payload (what you type into the Admin UI)
        //    - Fall back to saved admin config
        //    - Fall back to env/constant (if you use env-based config)
        $providerUrl = trim((string)($payload['providerUrl'] ?? ''));

        // Try admin config if not provided in payload
        if ($providerUrl === '') {
            if (!class_exists('AdminModel')) {
                require_once PROJECT_ROOT . '/src/models/AdminModel.php';
            }
            $model  = new AdminModel();
            $config = $model->getConfig();
            $providerUrl = trim((string)($config['oidc']['providerUrl'] ?? ''));
        }

        // Try constant from config.php (if you use one)
        if ($providerUrl === '' && defined('OIDC_PROVIDER_URL')) {
            $providerUrl = trim((string)OIDC_PROVIDER_URL);
        }

        if ($providerUrl === '') {
            return [
                'success' => false,
                'error'   => 'No OIDC provider URL configured.'
            ];
        }


        // 2) Normalize discovery URL
        $base = rtrim($providerUrl, '/');

        // If they pasted a .well-known URL directly, don't append anything
        if (stripos($base, '/.well-known/') !== false) {
            $discoveryUrl = $base;
        } else {
            // Works with Keycloak:
            //   https://auth.example.com/realms/yourrealm
            // → https://auth.example.com/realms/yourrealm/.well-known/openid-configuration
            $discoveryUrl = $base . '/.well-known/openid-configuration';
        }

        // 3) Fetch discovery document
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 5,
            ],
            'https' => [
                'timeout' => 5,
            ],
        ]);

        $raw = @file_get_contents($discoveryUrl, false, $ctx);
        if ($raw === false) {
            $err = error_get_last();
            return [
                'success'      => false,
                'error'        => 'Failed to fetch discovery document from provider.',
                'discoveryUrl' => $discoveryUrl,
                'phpError'     => $err['message'] ?? null,
            ];
        }

        $json = json_decode($raw, true);
        if (!is_array($json)) {
            return [
                'success'      => false,
                'error'        => 'Discovery document is not valid JSON.',
                'discoveryUrl' => $discoveryUrl,
            ];
        }

        $issuer  = (string)($json['issuer'] ?? '');
        $auth    = (string)($json['authorization_endpoint'] ?? '');
        $token   = (string)($json['token_endpoint'] ?? '');
        $userinfo = (string)($json['userinfo_endpoint'] ?? '');

        if ($issuer === '' || $auth === '') {
            return [
                'success'      => false,
                'error'        => 'Discovery document is missing issuer or authorization_endpoint.',
                'discoveryUrl' => $discoveryUrl,
                'jsonSample'   => [
                    'issuer'                 => $json['issuer'] ?? null,
                    'authorization_endpoint' => $json['authorization_endpoint'] ?? null,
                ],
            ];
        }

        // Shape the response exactly how your JS expects it:
        return [
            'success'                => true,
            'providerUrl'            => $providerUrl,
            'discoveryUrl'           => $discoveryUrl,
            'issuer'                 => $issuer,
            'authorization_endpoint' => $auth,
            'token_endpoint'         => $token,
            'userinfo_endpoint'      => $userinfo,
            // optional warnings array, your JS will just log them
            'warnings'               => [],
        ];
    }

    public function installProBundle(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        try {
            // Guard rails: method + auth + CSRF
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method not allowed']);
                return;
            }

            self::requireAuth();
            self::requireAdmin();
            self::requireCsrf();

            // Ensure ZipArchive is available
            if (!class_exists('\\ZipArchive')) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'ZipArchive extension is required on the server.']);
                return;
            }

            // Basic upload validation
            if (empty($_FILES['bundle']) || !is_array($_FILES['bundle'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Missing uploaded bundle (field "bundle").']);
                return;
            }

            $f = $_FILES['bundle'];

            if (!empty($f['error']) && $f['error'] !== UPLOAD_ERR_OK) {
                $msg = 'Upload error.';
                switch ($f['error']) {
                    case UPLOAD_ERR_INI_SIZE:
                    case UPLOAD_ERR_FORM_SIZE:
                        $msg = 'Uploaded file exceeds size limit.';
                        break;
                    case UPLOAD_ERR_PARTIAL:
                        $msg = 'Uploaded file was only partially received.';
                        break;
                    case UPLOAD_ERR_NO_FILE:
                        $msg = 'No file was uploaded.';
                        break;
                    default:
                        $msg = 'Upload failed with error code ' . (int)$f['error'];
                        break;
                }
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => $msg]);
                return;
            }

            $tmpName = $f['tmp_name'] ?? '';
            if ($tmpName === '' || !is_uploaded_file($tmpName)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid uploaded file.']);
                return;
            }

            // Guard against unexpectedly large bundles (e.g., >100MB)
            $size = isset($f['size']) ? (int)$f['size'] : 0;
            if ($size <= 0 || $size > 100 * 1024 * 1024) {
                http_response_code(413);
                echo json_encode(['success' => false, 'error' => 'Bundle size is invalid or too large (max 100MB).']);
                return;
            }

            // Optional: require .zip extension by name (best-effort)
            $origName = (string)($f['name'] ?? '');
            if ($origName !== '' && !preg_match('/\.zip$/i', $origName)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Bundle must be a .zip file.']);
                return;
            }

            // NEW: normalize to basename so C:\fakepath\FileRisePro-v1.2.1.zip works.
            $basename = $origName;
            if ($basename !== '') {
                // Normalize slashes and then take basename
                $basename = str_replace('\\', '/', $basename);
                $basename = basename($basename);
            }

            // Try to parse the bundle version from the *basename*
            // Supports: FileRisePro-v1.2.3.zip or FileRisePro_1.2.3.zip (case-insensitive)
            $declaredVersion = null;
            if (
                $basename !== '' &&
                preg_match(
                    '/^FileRisePro[_-]v?([0-9]+\.[0-9]+\.[0-9]+)\.zip$/i',
                    $basename,
                    $m
                )
            ) {
                $declaredVersion = 'v' . $m[1];
            }

            // Prepare temp working dir
            $tempRoot = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);
            $workDir  = $tempRoot . DIRECTORY_SEPARATOR . 'filerise_pro_' . bin2hex(random_bytes(8));
            if (!@mkdir($workDir, 0700, true)) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to prepare temp dir.']);
                return;
            }

            $zipPath = $workDir . DIRECTORY_SEPARATOR . 'bundle.zip';
            if (!@move_uploaded_file($tmpName, $zipPath)) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to move uploaded bundle.']);
                return;
            }

            $zip = new \ZipArchive();
            if ($zip->open($zipPath) !== true) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Failed to open ZIP bundle.']);
                return;
            }

            $installed = [
                'src'    => [],
                'docs'   => [],
            ];

            $projectRoot = rtrim(PROJECT_ROOT, DIRECTORY_SEPARATOR);

            // Where Pro bundle code lives (defaults to USERS_DIR . '/pro')
            $projectRoot = rtrim(PROJECT_ROOT, DIRECTORY_SEPARATOR);
            $bundleRoot = defined('FR_PRO_BUNDLE_DIR')
                ? rtrim(FR_PRO_BUNDLE_DIR, DIRECTORY_SEPARATOR)
                : (rtrim(USERS_DIR, "/\\") . DIRECTORY_SEPARATOR . 'pro');

            // Put README-Pro.txt / LICENSE-Pro.txt inside the bundle dir as well
            $proDocsDir = $bundleRoot;
            if (!is_dir($proDocsDir)) {
                @mkdir($proDocsDir, 0755, true);
            }

            $allowedTopLevel = ['LICENSE-Pro.txt', 'README-Pro.txt'];

            // Iterate entries and selectively extract/copy expected files only
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if ($name === false) {
                    continue;
                }

                // Normalise and guard
                $name = ltrim($name, "/\\");
                if ($name === '' || substr($name, -1) === '/') {
                    continue; // skip directories
                }
                if (strpos($name, '../') !== false || strpos($name, '..\\') !== false) {
                    continue; // path traversal guard
                }

                // Ignore macOS Finder junk: __MACOSX and "._" resource forks
                $base = basename($name);
                if (
                    str_starts_with($name, '__MACOSX/') ||
                    str_contains($name, '/__MACOSX/') ||
                    str_starts_with($base, '._')
                ) {
                    continue;
                }

                $targetPath = null;
                $category   = null;

                if (in_array($name, $allowedTopLevel, true)) {
                    // Docs → bundle dir (under /users/pro)
                    $targetPath = $proDocsDir . DIRECTORY_SEPARATOR . $name;
                    $category   = 'docs';
                } elseif (strpos($name, 'src/pro/') === 0) {
                    // e.g. src/pro/bootstrap_pro.php -> FR_PRO_BUNDLE_DIR/bootstrap_pro.php
                    $relative = substr($name, strlen('src/pro/'));
                    if ($relative === '' || substr($relative, -1) === '/') {
                        continue;
                    }
                    $targetPath = $bundleRoot . DIRECTORY_SEPARATOR . $relative;
                    $category   = 'src';
                } else {
                    // Skip anything outside these prefixes
                    continue;
                }

                if (!$targetPath || !$category) {
                    continue;
                }

                // Track whether we're overwriting an existing file (for reporting only)
                $wasExisting = is_file($targetPath);

                // Read from ZIP entry
                $stream = $zip->getStream($name);
                if (!$stream) {
                    continue;
                }

                $dir = dirname($targetPath);
                if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
                    fclose($stream);
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => 'Failed to create destination directory for ' . $name]);
                    return;
                }

                $data = stream_get_contents($stream);
                fclose($stream);
                if ($data === false) {
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => 'Failed to read data for ' . $name]);
                    return;
                }

                // Always overwrite target file on install/upgrade
                if (@file_put_contents($targetPath, $data) === false) {
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => 'Failed to write ' . $name]);
                    return;
                }

                @chmod($targetPath, 0644);

                // Track what we installed (and whether it was overwritten)
                if (!isset($installed[$category])) {
                    $installed[$category] = [];
                }
                $installed[$category][] = $targetPath . ($wasExisting ? ' (overwritten)' : '');
            }

            $zip->close();

            // Best-effort cleanup; ignore failures
            @unlink($zipPath);
            @rmdir($workDir);

            // NEW: ensure OPcache picks up new Pro bundle code immediately
            if (function_exists('opcache_invalidate')) {
                foreach ($installed['src'] as $pathInfo) {
                    // strip " (overwritten)" suffix if present
                    $path = preg_replace('/\s+\(overwritten\)$/', '', $pathInfo);
                    if (is_string($path) && $path !== '' && is_file($path)) {
                        @opcache_invalidate($path, true);
                    }
                }
            }

            // Reflect current Pro status in response if bootstrap was loaded
            $proActive = defined('FR_PRO_ACTIVE') && FR_PRO_ACTIVE;

            $reportedVersion = $declaredVersion;
            if ($reportedVersion === null && defined('FR_PRO_BUNDLE_VERSION')) {
                $reportedVersion = FR_PRO_BUNDLE_VERSION;
            }

            $proPayload = defined('FR_PRO_INFO') && is_array(FR_PRO_INFO)
                ? (FR_PRO_INFO['payload'] ?? null)
                : null;

            echo json_encode([
                'success'    => true,
                'message'    => 'Pro bundle installed.',
                'installed'  => $installed,
                'proActive'  => (bool)$proActive,
                'proVersion' => $reportedVersion,
                'proPayload' => $proPayload,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Exception during bundle install: ' . $e->getMessage(),
            ]);
        }
    }

    public function updateConfig(): void
    {
        header('Content-Type: application/json');

        // —– auth & CSRF checks —–
        if (
            !isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true ||
            !isset($_SESSION['isAdmin'])      || !$_SESSION['isAdmin']
        ) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized access.']);
            exit;
        }
        $headersArr    = array_change_key_case(getallheaders(), CASE_LOWER);
        $receivedToken = trim($headersArr['x-csrf-token'] ?? ($_POST['csrfToken'] ?? ''));
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid CSRF token.']);
            exit;
        }

        // —– fetch payload —–
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid input.']);
            exit;
        }

        // —– load existing on-disk config —–
        $existing = AdminModel::getConfig();
        if (isset($existing['error'])) {
            http_response_code(500);
            echo json_encode(['error' => $existing['error']]);
            exit;
        }

        // —– start merge with existing as base —–
        // Ensure minimal structure if the file was partially missing.
        $merged = $existing + [
            'header_title'        => '',
            'publishedUrl'        => '',
            'loginOptions'        => [
                'disableFormLogin' => false,
                'disableBasicAuth' => true,
                'disableOIDCLogin' => true,
                'authBypass'       => false,
                'authHeaderName'   => 'X-Remote-User'
            ],
            'globalOtpauthUrl'    => '',
            'enableWebDAV'        => false,
            'sharedMaxUploadSize' => 0,
            'oidc'                => [
                'providerUrl' => '',
                'clientId'    => '',
                'clientSecret' => '',
                'redirectUri' => '',
                'publicClient' => false,
            ],
            'branding'            => [
                'customLogoUrl' => '',
                'headerBgLight'   => '',
                'headerBgDark'    => '',
                'footerHtml'    => '',
            ],
            'clamav'              => [
                'scanUploads' => false,
            ],
        ];

        // header_title (cap length and strip control chars)
        if (array_key_exists('header_title', $data)) {
            $title = trim((string)$data['header_title']);
            $title = preg_replace('/[\x00-\x1F\x7F]/', '', $title);
            if (mb_strlen($title) > 100) { // hard cap
                $title = mb_substr($title, 0, 100);
            }
            $merged['header_title'] = $title;
        }

        // publishedUrl: optional advertised base URL (e.g. https://example.com/fr)
        // Env var FR_PUBLISHED_URL (if set) is the source of truth; admin value becomes read-only.
        $envPublished = getenv('FR_PUBLISHED_URL');
        $publishedLockedByEnv = ($envPublished !== false && trim((string)$envPublished) !== '');
        if (!$publishedLockedByEnv && array_key_exists('publishedUrl', $data)) {
            $u = trim((string)$data['publishedUrl']);
            if ($u === '') {
                $merged['publishedUrl'] = '';
            } else {
                $valid = filter_var($u, FILTER_VALIDATE_URL);
                $scheme = strtolower(parse_url($u, PHP_URL_SCHEME) ?: '');
                if (!$valid || ($scheme !== 'http' && $scheme !== 'https')) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid Published URL (must be http(s) URL).']);
                    exit;
                }
                $merged['publishedUrl'] = $u;
            }
        }

        // loginOptions: inherit existing then override if provided
        foreach (['disableFormLogin', 'disableBasicAuth', 'disableOIDCLogin', 'authBypass'] as $flag) {
            if (isset($data['loginOptions'][$flag])) {
                $merged['loginOptions'][$flag] = filter_var(
                    $data['loginOptions'][$flag],
                    FILTER_VALIDATE_BOOLEAN
                );
            }
        }
        if (isset($data['loginOptions']['authHeaderName'])) {
            $hdr = trim((string)$data['loginOptions']['authHeaderName']);
            // very restrictive header-name pattern: letters, numbers, dashes
            if ($hdr !== '' && preg_match('/^[A-Za-z0-9\-]+$/', $hdr)) {
                $merged['loginOptions']['authHeaderName'] = $hdr;
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid authHeaderName.']);
                exit;
            }
        }

        // globalOtpauthUrl
        if (array_key_exists('globalOtpauthUrl', $data)) {
            $merged['globalOtpauthUrl'] = trim((string)$data['globalOtpauthUrl']);
        }

        // enableWebDAV
        if (array_key_exists('enableWebDAV', $data)) {
            $merged['enableWebDAV'] = filter_var($data['enableWebDAV'], FILTER_VALIDATE_BOOLEAN);
        }

        // sharedMaxUploadSize
        if (array_key_exists('sharedMaxUploadSize', $data)) {
            $sms = filter_var($data['sharedMaxUploadSize'], FILTER_VALIDATE_INT);
            if ($sms === false || $sms < 0) {
                http_response_code(400);
                echo json_encode(['error' => 'sharedMaxUploadSize must be a non-negative integer (bytes).']);
                exit;
            }
            // Clamp to PHP limits to avoid confusing UX
            $maxPost  = self::iniToBytes(ini_get('post_max_size'));
            $maxFile  = self::iniToBytes(ini_get('upload_max_filesize'));
            $phpCap   = min($maxPost ?: PHP_INT_MAX, $maxFile ?: PHP_INT_MAX);
            if ($phpCap !== PHP_INT_MAX && $sms > $phpCap) {
                $sms = $phpCap;
            }
            $merged['sharedMaxUploadSize'] = $sms;
        }

        // oidc: only overwrite non-empty inputs; validate when enabling OIDC
        foreach (['providerUrl', 'clientId', 'clientSecret', 'redirectUri'] as $f) {
            if (!empty($data['oidc'][$f])) {
                $val = trim((string)$data['oidc'][$f]);
                if ($f === 'providerUrl' || $f === 'redirectUri') {
                    $val = filter_var($val, FILTER_SANITIZE_URL);
                }
                $merged['oidc'][$f] = $val;
            }
        }

        // OIDC public client flag (and optional secret wipe)
        if (array_key_exists('publicClient', $data['oidc'])) {
            $isPublic = filter_var($data['oidc']['publicClient'], FILTER_VALIDATE_BOOLEAN);
            $merged['oidc']['publicClient'] = $isPublic;
            if ($isPublic) {
                // Ensure secret is cleared when switching to public client mode
                $merged['oidc']['clientSecret'] = '';
            }
        }

        // OIDC debug logging toggle
if (isset($data['oidc']['debugLogging'])) {
    $merged['oidc']['debugLogging'] = filter_var(
        $data['oidc']['debugLogging'],
        FILTER_VALIDATE_BOOLEAN
    );
}

// OIDC admin demotion toggle
if (isset($data['oidc']['allowDemote'])) {
    $merged['oidc']['allowDemote'] = filter_var(
        $data['oidc']['allowDemote'],
        FILTER_VALIDATE_BOOLEAN
    );
}

        // If OIDC login is enabled, ensure required fields are present and sane
        $oidcEnabled = !empty($merged['loginOptions']['disableOIDCLogin']) ? false : true;

        if ($oidcEnabled) {
            $prov = $merged['oidc']['providerUrl'] ?? '';
            $rid  = $merged['oidc']['redirectUri'] ?? '';
            $cid  = $merged['oidc']['clientId'] ?? '';

            if ($prov === '' || $rid === '' || $cid === '') {
                http_response_code(400);
                echo json_encode([
                    'error' => 'OIDC is enabled but providerUrl, redirectUri, and clientId are required.'
                ]);
                exit;
            }

            // Require https except for localhost development
            $httpsOk = function (string $url): bool {
                if ($url === '') return false;
                $parts = parse_url($url);
                if (!$parts || empty($parts['scheme'])) return false;

                $scheme = strtolower($parts['scheme']);
                $host   = strtolower($parts['host'] ?? '');

                if ($scheme === 'https') {
                    return true;
                }

                if ($scheme === 'http' && ($host === 'localhost' || $host === '127.0.0.1')) {
                    return true;
                }

                return false;
            };


        }


        // —– persist merged config —–
        // ---- ONLYOFFICE: merge from payload (unless locked by PHP defines) ----
        $ooLockedByPhp = (
            defined('ONLYOFFICE_ENABLED') ||
            defined('ONLYOFFICE_DOCS_ORIGIN') ||
            defined('ONLYOFFICE_JWT_SECRET') ||
            defined('ONLYOFFICE_PUBLIC_ORIGIN')
        );

        if (!$ooLockedByPhp && isset($data['onlyoffice']) && is_array($data['onlyoffice'])) {
            $ooExisting = (isset($existing['onlyoffice']) && is_array($existing['onlyoffice']))
                ? $existing['onlyoffice'] : [];

            $oo = $ooExisting;

            if (array_key_exists('enabled', $data['onlyoffice'])) {
                $oo['enabled'] = filter_var($data['onlyoffice']['enabled'], FILTER_VALIDATE_BOOLEAN);
            }
            if (isset($data['onlyoffice']['docsOrigin'])) {
                $oo['docsOrigin'] = (string)$data['onlyoffice']['docsOrigin'];
            }
            if (isset($data['onlyoffice']['publicOrigin'])) {
                $oo['publicOrigin'] = (string)$data['onlyoffice']['publicOrigin'];
            }
            // Allow setting/changing the secret when NOT locked by PHP
            if (isset($data['onlyoffice']['jwtSecret'])) {
                $js = trim((string)$data['onlyoffice']['jwtSecret']);
                if ($js !== '') {
                    $oo['jwtSecret'] = $js; // stored encrypted by AdminModel
                }
                // If blank, we leave existing secret unchanged (no implicit wipe).
            }

            $merged['onlyoffice'] = $oo;
        }
        // Branding: pass through raw strings; AdminModel enforces Pro + sanitization.
        if (isset($data['branding']) && is_array($data['branding'])) {
            if (!isset($merged['branding']) || !is_array($merged['branding'])) {
                $merged['branding'] = [
                    'customLogoUrl'   => '',
                    'headerBgLight'   => '',
                    'headerBgDark'    => '',
                    'footerHtml'      => '',
                ];
            }
            foreach (['customLogoUrl', 'headerBgLight', 'headerBgDark', 'footerHtml'] as $key) {
                if (array_key_exists($key, $data['branding'])) {
                    $merged['branding'][$key] = (string)$data['branding'][$key];
                }
            }
        }

        // --- ClamAV: store admin toggle only when not locked by env/constant ---
        $envScanRaw    = getenv('VIRUS_SCAN_ENABLED');
        $clamLockedEnv = ($envScanRaw !== false && $envScanRaw !== '') || defined('VIRUS_SCAN_ENABLED');

        if (!$clamLockedEnv && isset($data['clamav']) && is_array($data['clamav'])) {
            if (array_key_exists('scanUploads', $data['clamav'])) {
                $merged['clamav']['scanUploads'] = filter_var(
                    $data['clamav']['scanUploads'],
                    FILTER_VALIDATE_BOOLEAN
                );
            }
        }

        // --- Pro Search Everywhere: respect env lock, otherwise persist toggle/limit ---
        $envProSearch    = getenv('FR_PRO_SEARCH_ENABLED');
        $proSearchLocked = ($envProSearch !== false && $envProSearch !== '');
        if (!$proSearchLocked && isset($data['proSearch']) && is_array($data['proSearch'])) {
            if (!isset($merged['proSearch']) || !is_array($merged['proSearch'])) {
                $merged['proSearch'] = [
                    'enabled' => true,
                    'defaultLimit' => 50,
                ];
            }
            if (array_key_exists('enabled', $data['proSearch'])) {
                $merged['proSearch']['enabled'] = filter_var(
                    $data['proSearch']['enabled'],
                    FILTER_VALIDATE_BOOLEAN
                );
            }
            if (array_key_exists('defaultLimit', $data['proSearch'])) {
                $lim = filter_var($data['proSearch']['defaultLimit'], FILTER_VALIDATE_INT);
                $merged['proSearch']['defaultLimit'] = max(1, min(200, $lim !== false ? $lim : 50));
            }
        }

        $result = AdminModel::updateConfig($merged);
        if (isset($result['error'])) {
            http_response_code(500);
        }
        echo json_encode($result);
        exit;
    }

    /** Convert php.ini shorthand like "128M" to bytes */
    private static function iniToBytes($val)
    {
        if ($val === false || $val === null || $val === '') return 0;
        $val = trim((string)$val);
        $last = strtolower($val[strlen($val) - 1]);
        $num = (int)$val;
        switch ($last) {
            case 'g':
                $num *= 1024;
            case 'm':
                $num *= 1024;
            case 'k':
                $num *= 1024;
        }
        return $num;
    }
}
