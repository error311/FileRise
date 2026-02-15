<?php

declare(strict_types=1);

namespace FileRise\Storage;

use Sabre\DAV\Client;
use Sabre\DAV\Xml\Property\ResourceType;
use Throwable;

require_once PROJECT_ROOT . '/src/lib/StorageAdapterInterface.php';

final class WebDavAdapter implements StorageAdapterInterface
{
    private const WRITE_FALLBACK_MAX_BYTES = 5242880; // 5 MB

    private Client $client;
    private string $baseUri;
    private string $basePath;
    private string $username;
    private string $password;
    private string $localRoot;
    private bool $verifyTls;
    private int $timeout;
    private string $lastError = '';
    /** @var array<string, array{ts:int, children:array<string, array{type:string,size:int,mtime:int,mode:int}>>> */
    private array $listCache = [];
    private int $listCacheTtl = 5;

    private function __construct(
        string $baseUri,
        string $username,
        string $password,
        string $localRoot,
        bool $verifyTls,
        int $timeout
    ) {
        $this->baseUri = rtrim($baseUri, '/');
        $basePath = (string)(parse_url($this->baseUri, PHP_URL_PATH) ?? '');
        $this->basePath = rtrim($basePath, '/');
        $this->username = $username;
        $this->password = $password;
        $this->localRoot = rtrim(str_replace('\\', '/', $localRoot), '/');
        $this->verifyTls = $verifyTls;
        $this->timeout = $timeout;

        $settings = [
            'baseUri' => $this->baseUri . '/',
            'userName' => $username,
            'password' => $password,
        ];

        $this->client = new Client($settings);
        if (!$verifyTls) {
            $this->client->addCurlSetting(CURLOPT_SSL_VERIFYPEER, false);
            $this->client->addCurlSetting(CURLOPT_SSL_VERIFYHOST, 0);
        }
        if ($timeout > 0) {
            $this->client->addCurlSetting(CURLOPT_TIMEOUT, $timeout);
            $this->client->addCurlSetting(CURLOPT_CONNECTTIMEOUT, min(10, $timeout));
        }
    }

    public static function fromConfig(array $cfg, string $root): ?self
    {
        self::ensureSabreLoaded();
        $baseUrl = trim((string)($cfg['baseUrl'] ?? $cfg['url'] ?? ''));
        $username = trim((string)($cfg['username'] ?? ''));
        if ($baseUrl === '' || $username === '') {
            return null;
        }
        $password = (string)($cfg['password'] ?? '');
        $rootPath = trim((string)($cfg['root'] ?? $cfg['path'] ?? ''));
        $verifyTls = !isset($cfg['verifyTls']) || $cfg['verifyTls'] !== false;
        $timeout = (int)($cfg['timeout'] ?? 20);
        if ($timeout <= 0) {
            $timeout = 20;
        }

        $baseUri = self::buildBaseUri($baseUrl, $rootPath);
        return new self($baseUri, $username, $password, $root, $verifyTls, $timeout);
    }

    public function isLocal(): bool
    {
        return false;
    }

    public function testConnection(): bool
    {
        $status = $this->request('PROPFIND', $this->buildUrlForRelative(''), null, ['Depth' => '0']);
        if ($status >= 200 && $status < 300) {
            $this->lastError = '';
            return true;
        }
        if ($status === 401 || $status === 403) {
            $this->lastError = 'Auth failed (HTTP ' . $status . ')';
        } elseif ($status > 0) {
            $this->lastError = 'HTTP ' . $status;
        } elseif ($this->lastError === '') {
            $this->lastError = 'Connection failed';
        }
        return false;
    }

    public function getLastError(): string
    {
        return trim($this->lastError);
    }

    public function list(string $path): array
    {
        $props = $this->propFind($path, 1);
        if (!$props) return [];
        $parentRel = trim($this->relativePath($path), '/');
        $items = [];
        $children = [];
        foreach ($props as $href => $prop) {
            $rel = trim($this->hrefToRelative((string)$href), '/');
            if ($rel === '' || $rel === $parentRel) continue;
            $name = basename($rel);
            if ($name === '' || $name === '.' || $name === '..') continue;
            $items[] = $name;
            $children[$name] = $this->propsToStat($prop);
        }
        $this->storeListCache($parentRel, $children);
        return array_values(array_unique($items));
    }

    public function stat(string $path): ?array
    {
        $rel = $this->relativePath($path);
        if ($rel !== '') {
            $parentRel = trim(str_replace('\\', '/', dirname($rel)), '/');
            if ($parentRel === '.' || $parentRel === '') {
                $parentRel = '';
            }
            $base = basename($rel);
            $cached = $this->getListCache($parentRel);
            if ($cached !== null && isset($cached[$base])) {
                return $cached[$base];
            }
        }

        $props = $this->propFind($path, 0);
        if (!$props) return null;

        return $this->propsToStat($props);
    }

    public function read(string $path, ?int $length = null, int $offset = 0): string|false
    {
        $stream = $this->openReadStream($path, $length, $offset);
        if ($stream === false) {
            return false;
        }

        if (is_resource($stream)) {
            $data = ($length !== null)
                ? stream_get_contents($stream, $length)
                : stream_get_contents($stream);
            fclose($stream);
            return ($data === false) ? false : $data;
        }

        if (is_object($stream) && method_exists($stream, 'read')) {
            $data = $stream->read($length ?? 0);
            if (method_exists($stream, 'close')) {
                $stream->close();
            }
            return $data;
        }

        return false;
    }

    public function openReadStream(string $path, ?int $length = null, int $offset = 0)
    {
        $url = $this->buildUrlForPath($path);
        if ($url === '') return false;

        $headers = [];
        if ($this->username !== '') {
            $headers[] = 'Authorization: Basic ' . base64_encode($this->username . ':' . $this->password);
        }
        if ($offset > 0 || $length !== null) {
            $end = ($length !== null && $length > 0) ? ($offset + $length - 1) : '';
            $headers[] = 'Range: bytes=' . $offset . '-' . $end;
        }

        $opts = [
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'ignore_errors' => true,
                'timeout' => $this->timeout,
            ],
        ];
        if (!$this->verifyTls) {
            $opts['ssl'] = [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ];
        }

        $context = stream_context_create($opts);
        $fp = @fopen($url, 'rb', false, $context);
        return $fp ?: false;
    }

    public function write(string $path, string $data, int $flags = 0): bool
    {
        if (!$this->ensureParentExists($path)) return false;
        $url = $this->buildUrlForPath($path);
        if ($url === '') return false;
        $status = $this->request('PUT', $url, $data, []);
        return $status >= 200 && $status < 300;
    }

    public function writeStream(string $path, $stream, ?int $length = null, ?string $mimeType = null): bool
    {
        if (!is_resource($stream)) return false;
        if (!$this->ensureParentExists($path)) return false;
        $url = $this->buildUrlForPath($path);
        if ($url === '') return false;
        $headers = [];
        if ($mimeType) {
            $headers['Content-Type'] = $mimeType;
        }
        $meta = @stream_get_meta_data($stream);
        $seekable = is_array($meta) && !empty($meta['seekable']);
        if ($length === null) {
            $stat = @fstat($stream);
            if (is_array($stat) && isset($stat['size'])) {
                $length = (int)$stat['size'];
            }
        }
        if ($length !== null && $length >= 0) {
            $headers['Content-Length'] = (string)$length;
        }
        if ($seekable) {
            @rewind($stream);
        }
        $status = $this->request('PUT', $url, $stream, $headers);
        if ($status >= 200 && $status < 300) {
            return true;
        }

        if ($seekable && $length !== null && $length <= self::WRITE_FALLBACK_MAX_BYTES) {
            @rewind($stream);
            $data = stream_get_contents($stream);
            if ($data !== false) {
                $status = $this->request('PUT', $url, $data, $headers);
                return $status >= 200 && $status < 300;
            }
        }

        return false;
    }

    public function move(string $from, string $to): bool
    {
        $src = $this->buildUrlForPath($from);
        $dst = $this->buildUrlForPath($to);
        if ($src === '' || $dst === '') return false;
        $status = $this->request('MOVE', $src, null, [
            'Destination' => $dst,
            'Overwrite' => 'T',
        ]);
        return $status >= 200 && $status < 300;
    }

    public function copy(string $from, string $to): bool
    {
        $src = $this->buildUrlForPath($from);
        $dst = $this->buildUrlForPath($to);
        if ($src === '' || $dst === '') return false;
        $status = $this->request('COPY', $src, null, [
            'Destination' => $dst,
            'Overwrite' => 'T',
        ]);
        return $status >= 200 && $status < 300;
    }

    public function delete(string $path): bool
    {
        $url = $this->buildUrlForPath($path);
        if ($url === '') return false;
        $status = $this->request('DELETE', $url, null, []);
        return $status >= 200 && $status < 300;
    }

    public function mkdir(string $path, int $mode = 0775, bool $recursive = true): bool
    {
        $rel = trim($this->relativePath($path), '/');
        if ($rel === '') return true;
        $parts = array_values(array_filter(explode('/', $rel), fn($p) => $p !== ''));
        if (!$parts) return true;

        $acc = '';
        foreach ($parts as $part) {
            $acc = ($acc === '') ? $part : ($acc . '/' . $part);
            if (!$recursive && $acc !== $rel) continue;
            $url = $this->buildUrlForRelative($acc);
            $status = $this->request('MKCOL', $url, null, []);
            if ($status >= 200 && $status < 300) {
                continue;
            }
            if ($status === 405) {
                continue;
            }
            return false;
        }
        return true;
    }

    private static function ensureSabreLoaded(): void
    {
        if (!class_exists(Client::class)) {
            $autoload = PROJECT_ROOT . '/vendor/autoload.php';
            if (is_file($autoload)) {
                require_once $autoload;
            }
        }
    }

    private static function buildBaseUri(string $baseUrl, string $rootPath): string
    {
        $base = rtrim($baseUrl, '/');
        $root = trim($rootPath, '/');
        if ($root === '') {
            return $base;
        }
        $encoded = self::encodePath($root);
        return $base . '/' . $encoded;
    }

    private static function encodePath(string $path): string
    {
        $trimmed = trim($path, '/');
        if ($trimmed === '') return '';
        $parts = array_map('rawurlencode', explode('/', $trimmed));
        return implode('/', $parts);
    }

    private function buildUrlForRelative(string $rel): string
    {
        $rel = trim($rel, '/');
        if ($rel === '') {
            return $this->baseUri;
        }
        return $this->baseUri . '/' . self::encodePath($rel);
    }

    private function buildUrlForPath(string $path): string
    {
        $rel = $this->relativePath($path);
        return $this->buildUrlForRelative($rel);
    }

    private function relativePath(string $path): string
    {
        $p = str_replace('\\', '/', $path);
        $root = $this->localRoot;
        if ($root !== '' && str_starts_with($p, $root)) {
            $p = substr($p, strlen($root));
        }
        return ltrim($p, '/');
    }

    private function hrefToRelative(string $href): string
    {
        $path = (string)(parse_url($href, PHP_URL_PATH) ?? '');
        $path = rawurldecode($path);
        $base = $this->basePath;
        if ($base !== '' && $base !== '/' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base));
        }
        return ltrim($path, '/');
    }

    private function propFind(string $path, int $depth): array
    {
        $url = $this->buildUrlForPath($path);
        if ($url === '') return [];
        try {
            return $this->client->propFind($url, [
                '{DAV:}displayname',
                '{DAV:}resourcetype',
                '{DAV:}getcontentlength',
                '{DAV:}getlastmodified',
            ], $depth);
        } catch (Throwable $e) {
            return [];
        }
    }

    private function getListCache(string $rel): ?array
    {
        if (!isset($this->listCache[$rel])) {
            return null;
        }
        $entry = $this->listCache[$rel];
        $ts = (int)($entry['ts'] ?? 0);
        if ($ts <= 0 || (time() - $ts) > $this->listCacheTtl) {
            unset($this->listCache[$rel]);
            return null;
        }
        $children = $entry['children'] ?? null;
        return is_array($children) ? $children : null;
    }

    private function storeListCache(string $rel, array $children): void
    {
        $this->listCache[$rel] = [
            'ts' => time(),
            'children' => $children,
        ];
    }

    private function propsToStat(array $props): array
    {
        $type = 'file';
        $resType = $props['{DAV:}resourcetype'] ?? null;
        if ($this->isCollection($resType)) {
            $type = 'dir';
        }

        $size = isset($props['{DAV:}getcontentlength']) ? (int)$props['{DAV:}getcontentlength'] : 0;
        $mtimeRaw = (string)($props['{DAV:}getlastmodified'] ?? '');
        $mtime = $mtimeRaw !== '' ? (int)(strtotime($mtimeRaw) ?: 0) : 0;

        return [
            'type'  => $type,
            'size'  => $size,
            'mtime' => $mtime,
            'mode'  => 0,
        ];
    }

    private function request(string $method, string $url, $body = null, array $headers = []): int
    {
        try {
            $resp = $this->client->request($method, $url, $body, $headers);
            $status = (int)($resp['statusCode'] ?? 0);
            if ($status < 200 || $status >= 300) {
                $msg = trim((string)($resp['body'] ?? ''));
                if ($msg !== '') {
                    $msg = preg_replace('/\\s+/', ' ', $msg);
                    if (strlen($msg) > 240) {
                        $msg = substr($msg, 0, 240) . '...';
                    }
                }
                $this->lastError = $msg !== '' ? ('HTTP ' . $status . ': ' . $msg) : ('HTTP ' . $status);
            } else {
                $this->lastError = '';
            }
            return $status;
        } catch (Throwable $e) {
            $msg = trim($e->getMessage());
            if ($msg !== '') {
                $msg = preg_replace('/(https?:\\/\\/)([^\\s@]+@)/i', '$1', $msg);
                $this->lastError = $msg;
            } else {
                $this->lastError = 'WebDAV request failed';
            }
            return 0;
        }
    }

    private function isCollection($value): bool
    {
        if ($value instanceof ResourceType) {
            return $value->is('{DAV:}collection');
        }
        if (is_array($value)) {
            return in_array('{DAV:}collection', $value, true);
        }
        if (is_string($value)) {
            return stripos($value, 'collection') !== false;
        }
        return false;
    }

    private function ensureParentExists(string $path): bool
    {
        $rel = trim($this->relativePath($path), '/');
        if ($rel === '') return true;
        $parent = trim(str_replace('\\', '/', dirname($rel)), '/');
        if ($parent === '' || $parent === '.') {
            return true;
        }
        $parentPath = $this->localRoot !== '' ? ($this->localRoot . '/' . $parent) : $parent;
        return $this->mkdir($parentPath, 0775, true);
    }
}
