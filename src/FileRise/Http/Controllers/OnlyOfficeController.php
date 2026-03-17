<?php

declare(strict_types=1);

namespace FileRise\Http\Controllers;

use FileRise\Support\ACL;
use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageRegistry;
use FileRise\Domain\AdminModel;
use FileRise\Domain\AuthModel;
use FileRise\Domain\FileModel;

// src/controllers/OnlyOfficeController.php
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class OnlyOfficeController
{
// What FileRise will route to ONLYOFFICE at all (edit *or* view)
    private const OO_SUPPORTED_EXTS = [
    'doc','docx','odt','rtf','txt',
    'xls','xlsx','ods','csv',
    'ppt','pptx','odp',
    'pdf'
    ];

/** Origin that the Document Server should use to reach FileRise fast (internal URL) */
    private function effectiveFileOriginForDocs(): string
    {
        $cfg = AdminModel::getConfig();
        $oo  = is_array($cfg['onlyoffice'] ?? null) ? $cfg['onlyoffice'] : [];

        // 1) explicit constant
        if (defined('ONLYOFFICE_FILE_ORIGIN_FOR_DOCS') && ONLYOFFICE_FILE_ORIGIN_FOR_DOCS !== '') {
            return (string)ONLYOFFICE_FILE_ORIGIN_FOR_DOCS;
        }
        // 2) admin.json setting
        if (!empty($oo['fileOriginForDocs'])) {
            return (string)$oo['fileOriginForDocs'];
        }

        // 3) fallback: whatever the public sees (may hairpin, but still works)
        return $this->effectivePublicOrigin();
    }

  // Never editable via OO (we’ll always set edit=false for these)
    private const OO_NEVER_EDIT = ['pdf'];

  // (Optional) More view-only types you can enable if you like
    private const OO_VIEW_ONLY_EXTRAS = [
    'djvu','xps','oxps','epub','fb2','pages','hwp','hwpx',
    'vsdx','vsdm','vssx','vssm','vstx','vstm'
    ];
    /** Resolve effective secret: constants override adminConfig */
    private function effectiveSecret(): string
    {
        $cfg = AdminModel::getConfig();
        $oo  = is_array($cfg['onlyoffice'] ?? null) ? $cfg['onlyoffice'] : [];
        if (defined('ONLYOFFICE_JWT_SECRET') && ONLYOFFICE_JWT_SECRET !== '') {
            return (string)ONLYOFFICE_JWT_SECRET;
        }
        return (string)($oo['jwtSecret'] ?? '');
    }

    // --- lightweight logger ------------------------------------------------------
    private const OO_LOG_PATH = '/var/www/users/onlyoffice-cb.debug';

    private function ooDebug(): bool
    {
        // Enable verbose logging by either constant or env var
        if (defined('ONLYOFFICE_DEBUG') && ONLYOFFICE_DEBUG) {
            return true;
        }
        return getenv('ONLYOFFICE_DEBUG') === '1';
    }

/**
 * @param 'error'|'warn'|'info'|'debug' $level
 */
    private function ooLog(string $level, string $msg): void
    {
        $level = strtolower($level);
        $line  = '[OO-CB][' . strtoupper($level) . '] ' . $msg;

        // Only emit to Apache on errors (keeps logs clean)
        if ($level === 'error') {
            error_log($line);
        }

        // If debug mode is on, mirror all levels to a local file
        if ($this->ooDebug()) {
            @file_put_contents(self::OO_LOG_PATH, '[' . date('c') . '] ' . $line . "\n", FILE_APPEND);
        }
    }

    /** Resolve effective docs origin (http/https root of OO Docs server) */
    private function effectiveDocsOrigin(): string
    {
        $cfg = AdminModel::getConfig();
        $oo  = is_array($cfg['onlyoffice'] ?? null) ? $cfg['onlyoffice'] : [];
        if (defined('ONLYOFFICE_DOCS_ORIGIN') && ONLYOFFICE_DOCS_ORIGIN !== '') {
            return (string)ONLYOFFICE_DOCS_ORIGIN;
        }
        if (!empty($oo['docsOrigin'])) {
            return (string)$oo['docsOrigin'];
        }
        $env = getenv('ONLYOFFICE_DOCS_ORIGIN');
        return $env ? (string)$env : '';
    }

    /** Resolve effective enabled flag (constants override adminConfig) */
    private function effectiveEnabled(): bool
    {
        $cfg = AdminModel::getConfig();
        $oo  = is_array($cfg['onlyoffice'] ?? null) ? $cfg['onlyoffice'] : [];
        if (defined('ONLYOFFICE_ENABLED')) {
            return (bool)ONLYOFFICE_ENABLED;
        }
        return !empty($oo['enabled']);
    }

    /** Optional explicit public origin; else infer from BASE_URL / request */
    private function effectivePublicOrigin(): string
    {
        $cfg = AdminModel::getConfig();
        $oo  = is_array($cfg['onlyoffice'] ?? null) ? $cfg['onlyoffice'] : [];

        if (defined('ONLYOFFICE_PUBLIC_ORIGIN') && ONLYOFFICE_PUBLIC_ORIGIN !== '') {
            return (string)ONLYOFFICE_PUBLIC_ORIGIN;
        }
        if (!empty($oo['publicOrigin'])) {
            return (string)$oo['publicOrigin'];
        }

        // Try BASE_URL if it isn't a placeholder
        if (defined('BASE_URL') && strpos((string)BASE_URL, 'yourwebsite') === false) {
            $u = parse_url((string)BASE_URL);
            if (!empty($u['scheme']) && !empty($u['host'])) {
                return $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
            }
        }
        // Fallback to request (proxy aware)
        $proto = $_SERVER['HTTP_X_FORWARDED_PROTO']
            ?? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
        $host  = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');
        return $proto . '://' . $host;
    }

    /** base64url encode/decode helpers */
    private function b64uDec(string $s)
    {
        $s = strtr($s, '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) {
            $s .= str_repeat('=', 4 - $pad);
        }
        return base64_decode($s, true);
    }
    private function b64uEnc(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    private function decodeJwtPayload(string $jwt, string $secret): ?array
    {
        $parts = explode('.', $jwt, 3);
        if (count($parts) !== 3) {
            return null;
        }

        [$b64Header, $b64Payload, $b64Sig] = $parts;
        $headerJson = $this->b64uDec($b64Header);
        $payloadJson = $this->b64uDec($b64Payload);
        $sig = $this->b64uDec($b64Sig);
        if ($headerJson === false || $payloadJson === false || $sig === false) {
            return null;
        }

        $header = json_decode($headerJson, true);
        if (!is_array($header) || strtoupper((string)($header['alg'] ?? '')) !== 'HS256') {
            return null;
        }

        $calc = hash_hmac('sha256', $b64Header . '.' . $b64Payload, $secret, true);
        if (!hash_equals($calc, $sig)) {
            return null;
        }

        $payload = json_decode($payloadJson, true);
        return is_array($payload) ? $payload : null;
    }

    private function createSignedPayloadToken(array $payload, string $secret): string
    {
        $data = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if (!is_string($data) || $data === '') {
            return '';
        }
        $sig = hash_hmac('sha256', $data, $secret, true);
        return $this->b64uEnc($data) . '.' . $this->b64uEnc($sig);
    }

    private function decodeSignedPayloadToken(string $token, string $secret): ?array
    {
        if ($token === '' || strpos($token, '.') === false) {
            return null;
        }
        [$b64Data, $b64Sig] = explode('.', $token, 2);
        $data = $this->b64uDec($b64Data);
        $sig = $this->b64uDec($b64Sig);
        if ($data === false || $sig === false) {
            return null;
        }
        $calc = hash_hmac('sha256', $data, $secret, true);
        if (!hash_equals($calc, $sig)) {
            return null;
        }
        $payload = json_decode($data, true);
        return is_array($payload) ? $payload : null;
    }

    private function effectiveAclPermsForUser(string $username): array
    {
        $perms = loadUserPermissions($username) ?: [];
        if (AuthModel::getUserRole($username) === '1') {
            $perms['admin'] = true;
        }
        return is_array($perms) ? $perms : [];
    }

    private function callbackJwtTokenFromRequest(array $rawBody): string
    {
        $bodyToken = (string)($rawBody['token'] ?? '');
        if ($bodyToken !== '') {
            return trim($bodyToken);
        }

        $headers = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
        $auth = trim((string)($headers['authorization'] ?? ''));
        if ($auth !== '' && preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
            return trim((string)$m[1]);
        }

        return '';
    }

    private function trustedCallbackBody(array $rawBody, string $secret): ?array
    {
        $jwt = $this->callbackJwtTokenFromRequest($rawBody);
        if ($jwt === '') {
            return $rawBody;
        }

        $payload = $this->decodeJwtPayload($jwt, $secret);
        if (!is_array($payload)) {
            return null;
        }

        if (isset($payload['payload']) && is_array($payload['payload'])) {
            return $payload['payload'];
        }

        return $payload;
    }

    private function normalizeOrigin(string $url): ?array
    {
        $url = trim($url);
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            return null;
        }

        $scheme = strtolower((string)(parse_url($url, PHP_URL_SCHEME) ?: ''));
        $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?: ''));
        if (($scheme !== 'http' && $scheme !== 'https') || $host === '') {
            return null;
        }

        $port = (int)(parse_url($url, PHP_URL_PORT) ?: ($scheme === 'https' ? 443 : 80));

        return [
            'scheme' => $scheme,
            'host' => $host,
            'port' => $port,
        ];
    }

    private function isAllowedOnlyOfficeUrl(string $url): bool
    {
        $target = $this->normalizeOrigin($url);
        $docs = $this->normalizeOrigin($this->effectiveDocsOrigin());
        if ($target === null || $docs === null) {
            return false;
        }

        return $target['scheme'] === $docs['scheme']
            && $target['host'] === $docs['host']
            && $target['port'] === $docs['port'];
    }

    private function normalizeSourceId($id): string
    {
        $id = trim((string)$id);
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            return '';
        }
        return $id;
    }

    /**
     * @return array{0:string,1:?string} [sourceId, error]
     */
    private function resolveSourceId(string $raw, bool $allowDisabled = false): array
    {
        $sourceId = $this->normalizeSourceId($raw);
        if ($sourceId === '') {
            if (trim($raw) !== '') {
                return ['', 'Invalid source id.'];
            }
            return ['', null];
        }

        // "local" must remain valid even when Pro Sources are not available/enabled.
        // The core UI includes sourceId="local" in file list payloads, and legacy Pro
        // bundles (or non-Pro installs) do not provide ProSources at all.
        if (
            $sourceId === 'local'
            && (!class_exists('SourceContext') || !SourceContext::sourcesEnabled())
        ) {
            return [$sourceId, null];
        }

        if (!class_exists('SourceContext') || !SourceContext::sourcesEnabled()) {
            return ['', 'Invalid source.'];
        }
        $src = SourceContext::getSourceById($sourceId);
        if (!$src) {
            return ['', 'Invalid source.'];
        }
        if (empty($src['enabled']) && !$allowDisabled) {
            return ['', 'Invalid source.'];
        }
        return [$sourceId, null];
    }

    private function withSourceContext(string $sourceId, callable $fn, bool $allowDisabled = false)
    {
        if (!class_exists('SourceContext') || $sourceId === '') {
            return $fn();
        }
        $prev = SourceContext::getActiveId();
        SourceContext::setActiveId($sourceId, false, $allowDisabled);
        try {
            return $fn();
        } finally {
            SourceContext::setActiveId($prev, false);
        }
    }

    private function readStreamChunk($stream, int $length)
    {
        if (is_resource($stream)) {
            return fread($stream, $length);
        }
        if (is_object($stream) && method_exists($stream, 'read')) {
            return $stream->read($length);
        }
        if (is_object($stream) && method_exists($stream, 'getContents')) {
            return $stream->getContents();
        }
        return false;
    }

    private function closeStream($stream): void
    {
        if (is_resource($stream)) {
            fclose($stream);
            return;
        }
        if (is_object($stream) && method_exists($stream, 'close')) {
            $stream->close();
        }
    }

    private function resolveLegacyLocalFile(string $folder, string $file): ?array
    {
        if (!defined('UPLOAD_DIR')) {
            return null;
        }
        $base = rtrim((string)UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
        $baseReal = realpath($base);
        if ($baseReal === false || $baseReal === '') {
            return null;
        }
        $rel = ($folder === 'root') ? '' : (trim($folder, "/\\ ") . DIRECTORY_SEPARATOR);
        $abs = realpath($base . $rel . $file);
        if (!$abs || !is_file($abs)) {
            return null;
        }
        if (strpos($abs, $baseReal) !== 0) {
            return null;
        }
        $mime = function_exists('mime_content_type') ? mime_content_type($abs) : null;
        if (!$mime || !is_string($mime)) {
            $mime = 'application/octet-stream';
        }
        $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === 'svg') {
            $mime = 'image/svg+xml';
        }
        $size = (int)@filesize($abs);
        $mtime = (int)@filemtime($abs);
        return [
            'filePath' => $abs,
            'mimeType' => $mime,
            'downloadName' => basename($file),
            'size' => $size,
            'mtime' => $mtime,
        ];
    }

    /** GET /api/onlyoffice/status.php */
    public function status(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        $enabled   = $this->effectiveEnabled();
        $docsOrig  = $this->effectiveDocsOrigin();
        $secret    = $this->effectiveSecret();

    // Must have docs origin and secret to actually function
        $enabled = $enabled && ($docsOrig !== '') && ($secret !== '');

        $exts = self::OO_SUPPORTED_EXTS;
        $exts = array_values(array_unique(array_merge($exts, self::OO_VIEW_ONLY_EXTRAS)));

        echo json_encode([
        'enabled'      => (bool)$enabled,
        'exts'         => $exts,
        'docsOrigin'   => $docsOrig,                     // <-- for preconnect/api.js
        'publicOrigin' => $this->effectivePublicOrigin() // <-- informational
        ], JSON_UNESCAPED_SLASHES);
    }

    /** GET /api/onlyoffice/config.php?folder=...&file=... */
    // --- config(): use the DocServer-facing origin for fileUrl & callbackUrl ---
    public function config(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        @session_start();
        $user   = $_SESSION['username'] ?? 'anonymous';
        $perms  = $this->effectiveAclPermsForUser((string)$user);
        $isAdmin = \ACL::isAdmin($perms);

        $enabled     = $this->effectiveEnabled();
        $docsOrigin  = rtrim($this->effectiveDocsOrigin(), '/');
        $secret      = $this->effectiveSecret();

        if (!$enabled) {
            http_response_code(404);
            echo '{"error":"ONLYOFFICE disabled"}';
            return;
        }
        if ($secret === '') {
            http_response_code(500);
            echo '{"error":"ONLYOFFICE_JWT_SECRET not configured"}';
            return;
        }
        if ($docsOrigin === '') {
            http_response_code(500);
            echo '{"error":"ONLYOFFICE_DOCS_ORIGIN not configured"}';
            return;
        }
        if (!defined('UPLOAD_DIR')) {
            http_response_code(500);
            echo '{"error":"UPLOAD_DIR not defined"}';
            return;
        }

        $folder = \ACL::normalizeFolder((string)($_GET['folder'] ?? 'root'));
        $file   = basename((string)($_GET['file'] ?? ''));
        if ($file === '') {
            http_response_code(400);
            echo '{"error":"Bad request"}';
            return;
        }

        $sourceIdRaw = (string)($_GET['sourceId'] ?? '');
        $sourceId = '';
        if ($sourceIdRaw !== '') {
            [$sourceId, $sourceErr] = $this->resolveSourceId($sourceIdRaw, $isAdmin);
            if ($sourceErr !== null) {
                http_response_code(400);
                echo json_encode(['error' => $sourceErr]);
                return;
            }
        } elseif (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            [$sourceId, $sourceErr] = $this->resolveSourceId(SourceContext::getActiveId(), $isAdmin);
            if ($sourceErr !== null) {
                http_response_code(400);
                echo json_encode(['error' => $sourceErr]);
                return;
            }
        }

        if (!\ACL::canRead($user, $perms, $folder)) {
            http_response_code(403);
            echo '{"error":"Forbidden"}';
            return;
        }
        $canEdit = \ACL::canEdit($user, $perms, $folder);

        $downloadCtx = $this->withSourceContext($sourceId, function () use ($folder, $file) {
            $info = FileModel::getDownloadInfo($folder, $file);
            if (isset($info['error'])) {
                return $info;
            }
            $storage = StorageRegistry::getAdapter();
            $stat = $storage->stat($info['filePath']);
            return [
            'info' => $info,
            'stat' => $stat,
            ];
        }, $isAdmin);

        if (isset($downloadCtx['error'])) {
            $fallback = null;
            if ($sourceId === 'local') {
                $fallback = $this->resolveLegacyLocalFile($folder, $file);
            }
            if ($fallback) {
                $downloadInfo = $fallback;
                $stat = [
                'mtime' => (int)($fallback['mtime'] ?? 0),
                'size' => (int)($fallback['size'] ?? 0),
                ];
            } else {
                $err = $downloadCtx['error'];
                $code = in_array($err, ['File not found.', 'Access forbidden.'], true) ? 404 : 400;
                http_response_code($code);
                echo json_encode(['error' => ($code === 404 ? 'Not found' : $err)]);
                return;
            }
        } else {
            $downloadInfo = $downloadCtx['info'];
            $stat = $downloadCtx['stat'] ?? null;
        }

        // IMPORTANT: use the internal/fast origin for DocServer fetch + callback
        $fileOriginForDocs = rtrim($this->effectiveFileOriginForDocs(), '/');

        $exp  = time() + 10 * 60;
        $payload = ['f' => $folder,'n' => $file,'u' => $user,'adm' => $isAdmin,'exp' => $exp];
        if ($sourceId !== '') {
            $payload['sid'] = $sourceId;
        }
        $data = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $sig  = hash_hmac('sha256', $data, $secret, true);
        $tok  = $this->b64uEnc($data) . '.' . $this->b64uEnc($sig);
        $fileUrl = $fileOriginForDocs . '/api/onlyoffice/signed-download.php?tok=' . rawurlencode($tok);

        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION) ?: 'docx');
        $canSave = $canEdit && !in_array($ext, self::OO_NEVER_EDIT, true);
        $callbackUrl = null;
        if ($canSave) {
            $cbExp = time() + 10 * 60;
            $cbPayload = [
                'f' => $folder,
                'n' => $file,
                'u' => $user,
                'edit' => true,
                'op' => 'onlyoffice_save',
                'exp' => $cbExp,
            ];
            if ($sourceId !== '') {
                $cbPayload['sid'] = $sourceId;
            }
            $cbTok = $this->createSignedPayloadToken($cbPayload, $secret);
            if ($cbTok === '') {
                http_response_code(500);
                echo '{"error":"Failed to generate ONLYOFFICE callback token"}';
                return;
            }
            $callbackUrl = $fileOriginForDocs . '/api/onlyoffice/callback.php?tok=' . rawurlencode($cbTok);
        }

        $docType = in_array($ext, ['xls','xlsx','ods','csv'], true) ? 'cell'
            : (in_array($ext, ['ppt','pptx','odp'], true) ? 'slide' : 'word');
        $filePath = $downloadInfo['filePath'] ?? '';
        $mtime = 0;
        if (is_array($stat) && isset($stat['mtime'])) {
            $mtime = (int)$stat['mtime'];
        } elseif ($filePath && is_string($filePath) && is_file($filePath)) {
            $mtime = (int)@filemtime($filePath);
        }
        $keySeed = $filePath . '|' . (string)$mtime;
        if ($sourceId !== '') {
            $keySeed .= '|' . $sourceId;
        }
        $key = substr(sha1($keySeed), 0, 20);

        $docsApiJs  = $docsOrigin . '/web-apps/apps/api/documents/api.js';

        $cfgOut = [
          'document' => [
        'fileType' => $ext,
        'key'      => $key,
        'title'    => $file,
        'url'      => $fileUrl,
        'permissions' => [
          'download' => true,
          'print'    => true,
          'edit'     => $canSave,
        ],
          ],
          'documentType' => $docType,
          'editorConfig' => [
            'user'        => ['id' => $user, 'name' => $user],
            'lang'        => 'en',
          ],
          'type' => 'desktop',
        ];

        if ($callbackUrl !== null) {
            $cfgOut['editorConfig']['callbackUrl'] = $callbackUrl;
        }

        // JWT sign cfg
        $h = $this->b64uEnc(json_encode(['alg' => 'HS256','typ' => 'JWT']));
        $p = $this->b64uEnc(json_encode($cfgOut, JSON_UNESCAPED_SLASHES));
        $s = $this->b64uEnc(hash_hmac('sha256', "$h.$p", $secret, true));
        $cfgOut['token'] = "$h.$p.$s";

        // expose to client for preconnect/script load
        $cfgOut['docs_api_js']          = $docsApiJs;
        $cfgOut['documentServerOrigin'] = $docsOrigin;

        echo json_encode($cfgOut, JSON_UNESCAPED_SLASHES);
    }

    /** POST /api/onlyoffice/callback.php?folder=...&file=...&exp=...&sig=... */
    public function callback(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        if (isset($_GET['ping'])) {
            echo '{"error":0}';
            return;
        }

        $secret = $this->effectiveSecret();
        if ($secret === '') {
            http_response_code(500);
            $this->ooLog('error', 'missing secret');
            echo '{"error":6}';
            return;
        }

        $callbackToken = trim((string)($_GET['tok'] ?? ''));
        $callbackPayload = $this->decodeSignedPayloadToken($callbackToken, $secret);
        if (!is_array($callbackPayload)) {
            $this->ooLog('error', 'invalid callback token');
            echo '{"error":6}';
            return;
        }

        $folder = \ACL::normalizeFolder((string)($callbackPayload['f'] ?? 'root'));
        $file = basename((string)($callbackPayload['n'] ?? ''));
        $actor = (string)($callbackPayload['u'] ?? '');
        $allowEdit = !empty($callbackPayload['edit']);
        $op = (string)($callbackPayload['op'] ?? '');
        $exp = (int)($callbackPayload['exp'] ?? 0);
        $sourceIdRaw = (string)($callbackPayload['sid'] ?? ($callbackPayload['sourceId'] ?? ''));
        $sourceId = '';

        if ($file === '' || $actor === '' || !$allowEdit || $op !== 'onlyoffice_save' || !$exp || time() > $exp) {
            $this->ooLog('error', "expired or invalid callback token for $folder/$file");
            echo '{"error":6}';
            return;
        }

        if ($sourceIdRaw !== '') {
            [$sourceId, $sourceErr] = $this->resolveSourceId($sourceIdRaw, true);
            if ($sourceErr !== null) {
                $this->ooLog('error', "invalid source for callback: $sourceIdRaw");
                echo '{"error":6}';
                return;
            }
        }

        $raw  = file_get_contents('php://input') ?: '';
        if ($this->ooDebug()) {
            $this->ooLog('debug', 'BODY len=' . strlen($raw));
        }

        $rawBody = json_decode($raw, true);
        $rawBody = is_array($rawBody) ? $rawBody : [];
        $jwt = $this->callbackJwtTokenFromRequest($rawBody);
        $body = $this->trustedCallbackBody($rawBody, $secret);
        if (!is_array($body)) {
            $this->ooLog('error', "missing or invalid callback JWT for $folder/$file");
            echo '{"error":6}';
            return;
        }
        if ($jwt === '') {
            $this->ooLog('warn', "callback JWT missing; falling back to signed callback token only for $folder/$file");
        }

        $status = (int)($body['status'] ?? 0);
        $perms = $this->effectiveAclPermsForUser($actor);

    // Save-on statuses: 2/6/7
        if (in_array($status, [2,6,7], true)) {
            if (!\ACL::canEdit($actor, $perms, $folder)) {
                $this->ooLog('error', "ACL deny edit: actor='$actor' folder='$folder'");
                echo '{"error":6}';
                return;
            }
            $saveUrl = (string)($body['url'] ?? '');
            if ($saveUrl === '') {
                $this->ooLog('error', "no url for status=$status");
                echo '{"error":6}';
                return;
            }
            if (!$this->isAllowedOnlyOfficeUrl($saveUrl)) {
                $this->ooLog('error', "disallowed save url for $folder/$file");
                echo '{"error":6}';
                return;
            }

            // fetch saved file
            $data = null;
            $curlErr = '';
            $httpCode = 0;
            if (function_exists('curl_init')) {
                $ch = curl_init($saveUrl);
                curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT        => 45,
                CURLOPT_HTTPHEADER     => ['Accept: */*','User-Agent: FileRise-ONLYOFFICE-Callback'],
                ]);
                $data = curl_exec($ch);
                if ($data === false) {
                    $curlErr = curl_error($ch);
                }
                $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                if ($data === false || $httpCode >= 400) {
                    $this->ooLog('error', "curl get failed ($httpCode) url=$saveUrl err=" . ($curlErr ?: 'n/a'));
                    $data = null;
                }
            }
            if ($data === null) {
                $ctx = stream_context_create(['http' => ['method' => 'GET','timeout' => 45,'header' => "Accept: */*\r\n"]]);
                $data = @file_get_contents($saveUrl, false, $ctx);
                if ($data === false) {
                    $this->ooLog('error', "stream get failed url=$saveUrl");
                    echo '{"error":6}';
                    return;
                }
            }

            $saveResult = $this->withSourceContext($sourceId, function () use ($folder, $file, $data, $sourceId) {
                $info = FileModel::getDownloadInfo($folder, $file);
                if (isset($info['error'])) {
                    if ($sourceId === 'local') {
                        $fallback = $this->resolveLegacyLocalFile($folder, $file);
                        if ($fallback) {
                            if (class_exists('SourceContext') && SourceContext::isReadOnly()) {
                                return ['error' => 'read only'];
                            }
                            $dest = $fallback['filePath'];
                            if (@file_put_contents($dest, $data) === false) {
                                return ['error' => 'write failed'];
                            }
                            @touch($dest);
                            return ['path' => $dest];
                        }
                    }
                    return ['error' => $info['error']];
                }
                $storage = StorageRegistry::getAdapter();
                $dest = $info['filePath'];
                if (!$storage->write($dest, $data)) {
                    return ['error' => 'write failed'];
                }
                if ($storage->isLocal()) {
                    @touch($dest);
                }
                return ['path' => $dest];
            }, true);
            if (isset($saveResult['error'])) {
                $this->ooLog('error', "write failed: " . $saveResult['error']);
                echo '{"error":6}';
                return;
            }
            $dest = (string)($saveResult['path'] ?? '');

            // Success: debug only
            if ($this->ooDebug()) {
                $this->ooLog('debug', "saved OK by '$actor' → $dest (" . strlen($data) . " bytes, status=$status)");
            }
            echo '{"error":0}';
            return;
        }

    // Non-saving statuses: debug only
        if ($this->ooDebug()) {
            $this->ooLog('debug', "status=$status ack for $folder/$file by '$actor'");
        }
        echo '{"error":0}';
    }

    /** GET /api/onlyoffice/signed-download.php?tok=... */
    public function signedDownload(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');

        $secret = $this->effectiveSecret();
        if ($secret === '') {
            http_response_code(403);
            return;
        }

        $tok = $_GET['tok'] ?? '';
        if (!$tok || strpos($tok, '.') === false) {
            http_response_code(400);
            return;
        }
        [$b64data, $b64sig] = explode('.', $tok, 2);
        $data = $this->b64uDec($b64data);
        $sig  = $this->b64uDec($b64sig);
        if ($data === false || $sig === false) {
            http_response_code(400);
            return;
        }

        $calc = hash_hmac('sha256', $data, $secret, true);
        if (!hash_equals($calc, $sig)) {
            http_response_code(403);
            return;
        }

        $payload = json_decode($data, true);
        if (!$payload || !isset($payload['f'], $payload['n'], $payload['exp'])) {
            http_response_code(400);
            return;
        }
        if (time() > (int)$payload['exp']) {
            http_response_code(403);
            return;
        }

        $folder = trim(str_replace('\\', '/', $payload['f']), "/ \t\r\n");
        if ($folder === '' || $folder === 'root') {
            $folder = 'root';
        }
        $file   = basename((string)$payload['n']);

        $sourceIdRaw = (string)($payload['sid'] ?? ($payload['sourceId'] ?? ''));
        $sourceId = '';
        if ($sourceIdRaw !== '') {
            [$sourceId, $sourceErr] = $this->resolveSourceId($sourceIdRaw, true);
            if ($sourceErr !== null) {
                http_response_code(400);
                return;
            }
        }

        $this->withSourceContext($sourceId, function () use ($folder, $file, $sourceId) {
            $downloadInfo = FileModel::getDownloadInfo($folder, $file);
            $useLegacyLocal = false;
            if (isset($downloadInfo['error'])) {
                if ($sourceId === 'local') {
                    $fallback = $this->resolveLegacyLocalFile($folder, $file);
                    if ($fallback) {
                        $downloadInfo = $fallback;
                        $useLegacyLocal = true;
                    } else {
                        $err = $downloadInfo['error'];
                        $code = in_array($err, ['File not found.', 'Access forbidden.'], true) ? 404 : 400;
                        http_response_code($code);
                        return;
                    }
                } else {
                    $err = $downloadInfo['error'];
                    $code = in_array($err, ['File not found.', 'Access forbidden.'], true) ? 404 : 400;
                    http_response_code($code);
                    return;
                }
            }

            $path = $downloadInfo['filePath'];
            $mime = $downloadInfo['mimeType'] ?? 'application/octet-stream';
            $downloadName = $downloadInfo['downloadName'] ?? $file;
            if ($useLegacyLocal) {
                $size = (int)($downloadInfo['size'] ?? 0);
                header('Content-Type: ' . $mime);
                header('Content-Disposition: inline; filename="' . rawurlencode($downloadName) . '"');
                header('Accept-Ranges: none');
                if ($size > 0) {
                    header('Content-Length: ' . $size);
                }
                if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
                    http_response_code(200);
                    return;
                }
                $fh = @fopen($path, 'rb');
                if ($fh === false) {
                    http_response_code(404);
                    return;
                }
                $chunkSize = 8192;
                while (!feof($fh)) {
                    $buffer = fread($fh, $chunkSize);
                    if ($buffer === false || $buffer === '') {
                        break;
                    }
                    echo $buffer;
                    flush();
                    if (connection_aborted()) {
                        break;
                    }
                }
                fclose($fh);
                return;
            }

            $storage = StorageRegistry::getAdapter();

            $stat = $storage->stat($path);
            if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                if ($stat === null || ($stat['type'] ?? '') === '') {
                    $probe = $storage->openReadStream($path, 1, 0);
                    if ($probe === false) {
                        http_response_code(404);
                        return;
                    }
                    $this->closeStream($probe);
                    $stat = [
                    'type' => 'file',
                    'size' => 0,
                    'sizeUnknown' => true,
                    ];
                } else {
                    http_response_code(404);
                    return;
                }
            }

            $size = (int)($stat['size'] ?? 0);
            $sizeUnknown = !empty($stat['sizeUnknown']);

            header('Content-Type: ' . $mime);
            header('Content-Disposition: inline; filename="' . rawurlencode($downloadName) . '"');
            header('Accept-Ranges: none'); // OO doesn’t require ranges; avoids partial edge-cases
            if (!$sizeUnknown && $size > 0) {
                header('Content-Length: ' . $size);
            }

            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
                http_response_code(200);
                return;
            }

            $stream = $storage->openReadStream($path, null, 0);
            if ($stream === false) {
                http_response_code(404);
                return;
            }

            $chunkSize = 8192;
            while (true) {
                $buffer = $this->readStreamChunk($stream, $chunkSize);
                if ($buffer === false || $buffer === '') {
                    break;
                }
                echo $buffer;
                flush();
                if (connection_aborted()) {
                    break;
                }
            }

            $this->closeStream($stream);
        }, true);
    }
}
