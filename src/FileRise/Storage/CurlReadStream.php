<?php

declare(strict_types=1);

namespace FileRise\Storage;

final class CurlReadStream
{
    private const TEMP_STREAM = 'php://temp/maxmemory:524288';

    /** @var resource|null */
    private $buffer;

    /** @var \CurlMultiHandle|null */
    private $multiHandle;

    /** @var \CurlHandle|null */
    private $easyHandle;

    private int $readOffset = 0;
    private int $writeOffset = 0;
    private bool $done = false;
    private bool $closed = false;
    private bool $failed = false;
    private string $error = '';

    /** @var callable|null */
    private $errorHandler;

    private function __construct()
    {
    }

    public static function open(
        string $url,
        array $headers = [],
        bool $verifyTls = true,
        int $connectTimeout = 10,
        int $stallTimeout = 0,
        ?callable $errorHandler = null
    ): self|false {
        $stream = new self();
        $stream->errorHandler = $errorHandler;
        $stream->buffer = @fopen(self::TEMP_STREAM, 'w+b');
        if ($stream->buffer === false) {
            $stream->buffer = null;
            $stream->fail('Unable to allocate WebDAV read buffer.');
            return false;
        }

        $easy = curl_init();
        $multi = curl_multi_init();
        if ($easy === false || $multi === false) {
            if (is_resource($stream->buffer)) {
                @fclose($stream->buffer);
            }
            if ($easy !== false) {
                curl_close($easy);
            }
            if ($multi !== false) {
                curl_multi_close($multi);
            }
            $stream->buffer = null;
            $stream->fail('Unable to initialize WebDAV read request.');
            return false;
        }

        $stream->easyHandle = $easy;
        $stream->multiHandle = $multi;

        $curlHeaders = [];
        foreach ($headers as $key => $value) {
            if (is_int($key)) {
                $curlHeaders[] = (string)$value;
            } else {
                $curlHeaders[] = $key . ': ' . $value;
            }
        }

        $options = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPGET => true,
            CURLOPT_WRITEFUNCTION => [$stream, 'handleWrite'],
            CURLOPT_NOSIGNAL => true,
        ];
        if ($curlHeaders !== []) {
            $options[CURLOPT_HTTPHEADER] = $curlHeaders;
        }
        if ($connectTimeout > 0) {
            $options[CURLOPT_CONNECTTIMEOUT] = $connectTimeout;
        }
        if ($stallTimeout > 0) {
            $options[CURLOPT_LOW_SPEED_LIMIT] = 1;
            $options[CURLOPT_LOW_SPEED_TIME] = $stallTimeout;
        }
        if (!$verifyTls) {
            $options[CURLOPT_SSL_VERIFYPEER] = false;
            $options[CURLOPT_SSL_VERIFYHOST] = 0;
        }

        curl_setopt_array($easy, $options);
        curl_multi_add_handle($multi, $easy);

        return $stream;
    }

    public function read(int $length)
    {
        if ($this->closed) {
            return '';
        }

        if ($length <= 0) {
            while (!$this->done) {
                $this->pump(1);
            }
            return $this->consumeAvailable(null);
        }

        if ($this->availableBytes() <= 0 && !$this->done) {
            $this->pump(1);
        }

        return $this->consumeAvailable($length);
    }

    public function close(): void
    {
        $this->closed = true;
        $this->closeCurlHandles();
        if (is_resource($this->buffer)) {
            @fclose($this->buffer);
            $this->buffer = null;
        }
    }

    public function eof(): bool
    {
        return $this->done && $this->availableBytes() <= 0;
    }

    public function getError(): string
    {
        return $this->error;
    }

    public function handleWrite($curlHandle, string $chunk): int
    {
        if ($this->closed || !is_resource($this->buffer)) {
            return 0;
        }

        $len = strlen($chunk);
        if ($len === 0) {
            return 0;
        }

        if (@fseek($this->buffer, $this->writeOffset) !== 0) {
            $this->fail('Unable to seek WebDAV read buffer.');
            return 0;
        }

        $written = @fwrite($this->buffer, $chunk);
        if ($written === false || $written !== $len) {
            $this->fail('Unable to write WebDAV read buffer.');
            return 0;
        }

        $this->writeOffset += $written;
        return $written;
    }

    private function pump(int $desiredBytes): void
    {
        while (!$this->done && !$this->closed && $this->availableBytes() < $desiredBytes) {
            $running = 0;
            do {
                $status = curl_multi_exec($this->multiHandle, $running);
            } while ($status === CURLM_CALL_MULTI_PERFORM);

            if ($status !== CURLM_OK) {
                $this->fail('WebDAV read failed to progress.');
                return;
            }

            $this->collectCompletedTransfers();
            if ($this->done || $this->availableBytes() >= $desiredBytes) {
                break;
            }

            if ($running <= 0) {
                $this->done = true;
                $this->closeCurlHandles();
                break;
            }

            $selected = curl_multi_select($this->multiHandle, 1.0);
            if ($selected === -1) {
                usleep(10000);
            }
        }
    }

    private function collectCompletedTransfers(): void
    {
        if ($this->multiHandle === null || $this->easyHandle === null) {
            return;
        }

        while (($info = curl_multi_info_read($this->multiHandle)) !== false) {
            if (($info['handle'] ?? null) !== $this->easyHandle) {
                continue;
            }

            $errno = curl_errno($this->easyHandle);
            $errmsg = trim((string)curl_error($this->easyHandle));
            $httpCodeInfo = defined('CURLINFO_RESPONSE_CODE') ? CURLINFO_RESPONSE_CODE : CURLINFO_HTTP_CODE;
            $httpCode = (int)curl_getinfo($this->easyHandle, $httpCodeInfo);

            $this->done = true;
            if ($errno !== 0) {
                $this->fail($errmsg !== '' ? $errmsg : 'WebDAV read request failed.');
            } elseif ($httpCode >= 400) {
                $this->fail('HTTP ' . $httpCode);
            }

            $this->closeCurlHandles();
            break;
        }
    }

    private function consumeAvailable(?int $length)
    {
        $available = $this->availableBytes();
        if ($available <= 0) {
            return $this->failed ? false : '';
        }

        $toRead = ($length === null || $length <= 0) ? $available : min($length, $available);
        if ($toRead <= 0 || !is_resource($this->buffer)) {
            return $this->failed ? false : '';
        }

        if (@fseek($this->buffer, $this->readOffset) !== 0) {
            $this->fail('Unable to seek WebDAV read buffer.');
            return false;
        }

        $data = @fread($this->buffer, $toRead);
        if ($data === false) {
            $this->fail('Unable to read WebDAV buffer.');
            return false;
        }

        $this->readOffset += strlen($data);
        if ($this->readOffset >= $this->writeOffset) {
            $this->resetBufferIfDrained();
        }

        return $data;
    }

    private function availableBytes(): int
    {
        return $this->writeOffset - $this->readOffset;
    }

    private function resetBufferIfDrained(): void
    {
        if (!is_resource($this->buffer) || $this->readOffset < $this->writeOffset) {
            return;
        }

        @ftruncate($this->buffer, 0);
        @rewind($this->buffer);
        $this->readOffset = 0;
        $this->writeOffset = 0;
    }

    private function closeCurlHandles(): void
    {
        if ($this->multiHandle !== null && $this->easyHandle !== null) {
            @curl_multi_remove_handle($this->multiHandle, $this->easyHandle);
        }
        if ($this->easyHandle !== null) {
            curl_close($this->easyHandle);
            $this->easyHandle = null;
        }
        if ($this->multiHandle !== null) {
            curl_multi_close($this->multiHandle);
            $this->multiHandle = null;
        }
    }

    private function fail(string $message): void
    {
        $this->failed = true;
        $this->done = true;
        $message = trim($message);
        if ($message === '') {
            $message = 'WebDAV read failed.';
        }
        $this->error = $message;

        if (is_callable($this->errorHandler)) {
            ($this->errorHandler)($message);
        }
    }
}
