<?php
// src/controllers/OnlyOfficeController.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/src/models/AdminModel.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

class OnlyOfficeController
{


// What FileRise will route to ONLYOFFICE at all (edit *or* view)
private const OO_SUPPORTED_EXTS = [
    'doc','docx','odt','rtf','txt',
    'xls','xlsx','ods','csv',
    'ppt','pptx','odp',
    'pdf'
  ];
  
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
    if (defined('ONLYOFFICE_DEBUG') && ONLYOFFICE_DEBUG) return true;
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
        if (!empty($oo['docsOrigin'])) return (string)$oo['docsOrigin'];
        $env = getenv('ONLYOFFICE_DOCS_ORIGIN');
        return $env ? (string)$env : '';
    }

    /** Resolve effective enabled flag (constants override adminConfig) */
    private function effectiveEnabled(): bool
    {
        $cfg = AdminModel::getConfig();
        $oo  = is_array($cfg['onlyoffice'] ?? null) ? $cfg['onlyoffice'] : [];
        if (defined('ONLYOFFICE_ENABLED')) return (bool)ONLYOFFICE_ENABLED;
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
        if (!empty($oo['publicOrigin'])) return (string)$oo['publicOrigin'];

        // Try BASE_URL if it isn't a placeholder
        if (defined('BASE_URL') && strpos((string)BASE_URL, 'yourwebsite') === false) {
            $u = parse_url((string)BASE_URL);
            if (!empty($u['scheme']) && !empty($u['host'])) {
                return $u['scheme'].'://'.$u['host'].(isset($u['port'])?':'.$u['port']:'');
            }
        }
        // Fallback to request (proxy aware)
        $proto = $_SERVER['HTTP_X_FORWARDED_PROTO']
            ?? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
        $host  = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');
        return $proto.'://'.$host;
    }

    /** base64url encode/decode helpers */
    private function b64uDec(string $s)
    {
        $s = strtr($s, '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) $s .= str_repeat('=', 4 - $pad);
        return base64_decode($s, true);
    }
    private function b64uEnc(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/','-_'), '=');
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
        // If you want the extras:
        $exts = array_values(array_unique(array_merge($exts, self::OO_VIEW_ONLY_EXTRAS)));
        
        echo json_encode(['enabled' => (bool)$enabled, 'exts' => $exts], JSON_UNESCAPED_SLASHES);
    }

    /** GET /api/onlyoffice/config.php?folder=...&file=... */
    public function config(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        @session_start();
        $user   = $_SESSION['username'] ?? 'anonymous';
        $perms  = [];
        $isAdmin = \ACL::isAdmin($perms);

        // Effective toggles
        $enabled    = $this->effectiveEnabled();
        $docsOrigin = rtrim($this->effectiveDocsOrigin(), '/');
        $secret     = $this->effectiveSecret();
        if (!$enabled) { http_response_code(404); echo '{"error":"ONLYOFFICE disabled"}'; return; }
        if ($secret === '') { http_response_code(500); echo '{"error":"ONLYOFFICE_JWT_SECRET not configured"}'; return; }
        if ($docsOrigin === '') { http_response_code(500); echo '{"error":"ONLYOFFICE_DOCS_ORIGIN not configured"}'; return; }
        if (!defined('UPLOAD_DIR')) { http_response_code(500); echo '{"error":"UPLOAD_DIR not defined"}'; return; }

        // Inputs
        $folder = \ACL::normalizeFolder((string)($_GET['folder'] ?? 'root'));
        $file   = basename((string)($_GET['file'] ?? ''));
        if ($file === '') { http_response_code(400); echo '{"error":"Bad request"}'; return; }

        // ACL
        if (!\ACL::canRead($user, $perms, $folder)) { http_response_code(403); echo '{"error":"Forbidden"}'; return; }
        $canEdit = \ACL::canEdit($user, $perms, $folder);

        // Path
        $base = rtrim(UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
        $rel  = ($folder === 'root') ? '' : ($folder . '/');
        $abs  = realpath($base . $rel . $file);
        if (!$abs || !is_file($abs)) { http_response_code(404); echo '{"error":"Not found"}'; return; }
        if (strpos($abs, realpath($base)) !== 0) { http_response_code(400); echo '{"error":"Invalid path"}'; return; }

        // Public origin
        $publicOrigin = $this->effectivePublicOrigin();

        // Signed download
        $exp  = time() + 10*60;
        $data = json_encode(['f'=>$folder,'n'=>$file,'u'=>$user,'adm'=>$isAdmin,'exp'=>$exp], JSON_UNESCAPED_SLASHES);
        $sig  = hash_hmac('sha256', $data, $secret, true);
        $tok  = $this->b64uEnc($data) . '.' . $this->b64uEnc($sig);
        $fileUrl = $publicOrigin . '/api/onlyoffice/signed-download.php?tok=' . rawurlencode($tok);

        // Callback
        $cbExp = time() + 10*60;
        $cbSig = hash_hmac('sha256', $folder.'|'.$file.'|'.$cbExp, $secret);
        $callbackUrl = $publicOrigin . '/api/onlyoffice/callback.php'
          . '?folder=' . rawurlencode($folder)
          . '&file='   . rawurlencode($file)
          . '&exp='    . $cbExp
          . '&sig='    . $cbSig;

        // Doc type & key
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION) ?: 'docx');
        $docType = in_array($ext, ['xls','xlsx','ods','csv'], true) ? 'cell'
                : (in_array($ext, ['ppt','pptx','odp'], true) ? 'slide' : 'word');
        $key = substr(sha1($abs . '|' . (string)filemtime($abs)), 0, 20);

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
              'edit' => $canEdit && !in_array($ext, self::OO_NEVER_EDIT, true),
            ],
          ],
          'documentType' => $docType,
          'editorConfig' => [
            'callbackUrl' => $callbackUrl,
            'user'        => ['id'=>$user, 'name'=>$user],
            'lang'        => 'en',
          ],
          'type' => 'desktop',
        ];

        // JWT sign cfg
        $h = $this->b64uEnc(json_encode(['alg'=>'HS256','typ'=>'JWT']));
        $p = $this->b64uEnc(json_encode($cfgOut, JSON_UNESCAPED_SLASHES));
        $s = $this->b64uEnc(hash_hmac('sha256', "$h.$p", $secret, true));
        $cfgOut['token'] = "$h.$p.$s";
        $cfgOut['docs_api_js'] = $docsApiJs;

        echo json_encode($cfgOut, JSON_UNESCAPED_SLASHES);
    }

    /** POST /api/onlyoffice/callback.php?folder=...&file=...&exp=...&sig=... */
    public function callback(): void
{
    header('Content-Type: application/json; charset=utf-8');

    if (isset($_GET['ping'])) { echo '{"error":0}'; return; }

    $secret = $this->effectiveSecret();
    if ($secret === '') { http_response_code(500); $this->ooLog('error', 'missing secret'); echo '{"error":6}'; return; }

    $folderRaw = (string)($_GET['folder'] ?? 'root');
    $fileRaw   = (string)($_GET['file']   ?? '');
    $exp       = (int)($_GET['exp']       ?? 0);
    $sig       = (string)($_GET['sig']    ?? '');
    $calc      = hash_hmac('sha256', "$folderRaw|$fileRaw|$exp", $secret);

    // Debug-only preflight (no secrets; show short sigs)
    if ($this->ooDebug()) {
        $this->ooLog('debug', sprintf(
            "PRE f='%s' n='%s' exp=%d sig[8]=%s calc[8]=%s",
            $folderRaw, $fileRaw, $exp, substr($sig, 0, 8), substr($calc, 0, 8)
        ));
    }

    $folder = \ACL::normalizeFolder($folderRaw);
    $file   = basename($fileRaw);
    if (!$exp || time() > $exp) { $this->ooLog('error', "expired exp for $folder/$file"); echo '{"error":6}'; return; }
    if (!hash_equals($calc, $sig)) { $this->ooLog('error', "sig mismatch for $folder/$file"); echo '{"error":6}'; return; }

    $raw  = file_get_contents('php://input') ?: '';
    if ($this->ooDebug()) {
        $this->ooLog('debug', 'BODY len=' . strlen($raw));
    }

    $body   = json_decode($raw, true) ?: [];
    $status = (int)($body['status'] ?? 0);
    $actor  = (string)($body['actions'][0]['userid'] ?? '');

    $actorIsAdmin = (defined('DEFAULT_ADMIN_USER') && $actor !== '' && strcasecmp($actor, (string)DEFAULT_ADMIN_USER) === 0)
                 || (strcasecmp($actor, 'admin') === 0);
    $perms = $actorIsAdmin ? ['admin'=>true] : [];

    $base = rtrim(UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
    $rel  = ($folder === 'root') ? '' : ($folder . '/');
    $dir  = realpath($base . $rel) ?: ($base . $rel);
    if (strpos($dir, realpath($base)) !== 0) { $this->ooLog('error', 'path escape'); echo '{"error":6}'; return; }

    // Save-on statuses: 2/6/7
    if (in_array($status, [2,6,7], true)) {
        if (!$actor || !\ACL::canEdit($actor, $perms, $folder)) {
            $this->ooLog('error', "ACL deny edit: actor='$actor' folder='$folder'");
            echo '{"error":6}'; return;
        }
        $saveUrl = (string)($body['url'] ?? '');
        if ($saveUrl === '') { $this->ooLog('error', "no url for status=$status"); echo '{"error":6}'; return; }

        // fetch saved file
        $data = null; $curlErr=''; $httpCode=0;
        if (function_exists('curl_init')) {
            $ch = curl_init($saveUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT        => 45,
                CURLOPT_HTTPHEADER     => ['Accept: */*','User-Agent: FileRise-ONLYOFFICE-Callback'],
            ]);
            $data = curl_exec($ch);
            if ($data === false) $curlErr = curl_error($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($data === false || $httpCode >= 400) {
                $this->ooLog('error', "curl get failed ($httpCode) url=$saveUrl err=" . ($curlErr ?: 'n/a'));
                $data = null;
            }
        }
        if ($data === null) {
            $ctx = stream_context_create(['http'=>['method'=>'GET','timeout'=>45,'header'=>"Accept: */*\r\n"]]);
            $data = @file_get_contents($saveUrl, false, $ctx);
            if ($data === false) { $this->ooLog('error', "stream get failed url=$saveUrl"); echo '{"error":6}'; return; }
        }

        if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
        $dest = rtrim($dir, "/\\") . DIRECTORY_SEPARATOR . $file;
        if (@file_put_contents($dest, $data) === false) { $this->ooLog('error', "write failed: $dest"); echo '{"error":6}'; return; }

        @touch($dest);

        // Success: debug only
        if ($this->ooDebug()) {
            $this->ooLog('debug', "saved OK by '$actor' → $dest (" . strlen($data) . " bytes, status=$status)");
        }
        echo '{"error":0}'; return;
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
        if ($secret === '') { http_response_code(403); return; }

        $tok = $_GET['tok'] ?? '';
        if (!$tok || strpos($tok, '.') === false) { http_response_code(400); return; }
        [$b64data, $b64sig] = explode('.', $tok, 2);
        $data = $this->b64uDec($b64data);
        $sig  = $this->b64uDec($b64sig);
        if ($data === false || $sig === false) { http_response_code(400); return; }

        $calc = hash_hmac('sha256', $data, $secret, true);
        if (!hash_equals($calc, $sig)) { http_response_code(403); return; }

        $payload = json_decode($data, true);
        if (!$payload || !isset($payload['f'],$payload['n'],$payload['exp'])) { http_response_code(400); return; }
        if (time() > (int)$payload['exp']) { http_response_code(403); return; }

        $folder = trim(str_replace('\\','/',$payload['f']),"/ \t\r\n");
        if ($folder === '' || $folder === 'root') $folder = 'root';
        $file   = basename((string)$payload['n']);

        $base = rtrim(UPLOAD_DIR, "/\\") . DIRECTORY_SEPARATOR;
        $rel  = ($folder === 'root') ? '' : ($folder . '/');
        $abs  = realpath($base . $rel . $file);
        if (!$abs || !is_file($abs)) { http_response_code(404); return; }
        if (strpos($abs, realpath($base)) !== 0) { http_response_code(400); return; }

        $mime = mime_content_type($abs) ?: 'application/octet-stream';
        header('Content-Type: '.$mime);
        header('Content-Length: '.filesize($abs));
        header('Content-Disposition: inline; filename="' . rawurlencode($file) . '"');
        readfile($abs);
    }
}