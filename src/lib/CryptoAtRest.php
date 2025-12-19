<?php
// src/lib/CryptoAtRest.php

require_once PROJECT_ROOT . '/config/config.php';

/**
 * Streaming encryption-at-rest helper for files.
 *
 * Format (v1):
 *   - "FRCE" (4)
 *   - version (1)
 *   - flags (1) [reserved]
 *   - plaintext_size (8, uint64 BE; 0 means unknown)
 *   - secretstream header (24)
 *   - frames...:
 *       - frame_len (4, uint32 BE)
 *       - frame_bytes (frame_len)
 *
 * Frames are secretstream push messages; a FINAL empty frame is always appended.
 */
class CryptoAtRest
{
    private const MAGIC = "FRCE";
    private const VERSION = 1;
    private const FLAGS = 0;

    private const HEADER_LEN = 4 + 1 + 1 + 8 + 24;
    private const CHUNK_SIZE = 1048576; // 1 MiB plaintext chunks
    private const MAX_FRAME_BYTES = 8388608; // 8 MiB safety cap

    private static ?string $cachedKey = null;

    public static function isAvailable(): bool
    {
        return function_exists('sodium_crypto_secretstream_xchacha20poly1305_init_push')
            && function_exists('sodium_crypto_secretstream_xchacha20poly1305_init_pull')
            && function_exists('sodium_crypto_secretstream_xchacha20poly1305_push')
            && function_exists('sodium_crypto_secretstream_xchacha20poly1305_pull')
            && defined('SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES')
            && defined('SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES');
    }

    public static function masterKeyIsConfigured(): bool
    {
        try {
            return (self::getMasterKeyOrNull() !== null);
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function parseKeyString(string $raw): ?string
    {
        $s = trim($raw);
        if ($s === '') return null;

        // base64:... convenience
        if (stripos($s, 'base64:') === 0) {
            $b = substr($s, 7);
            $bin = base64_decode($b, true);
            if (is_string($bin) && strlen($bin) === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES) {
                return $bin;
            }
            return null;
        }

        // hex key (64 hex chars => 32 bytes)
        if (preg_match('/^[a-f0-9]{64}$/i', $s)) {
            $bin = hex2bin($s);
            if (is_string($bin) && strlen($bin) === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES) {
                return $bin;
            }
            return null;
        }

        // raw (unlikely via env); accept only exact key length
        if (strlen($s) === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES) {
            return $s;
        }

        return null;
    }

    /**
     * Decode a key string without persisting it.
     *
     * Accepted formats:
     * - 64 hex chars (32 bytes)
     * - base64:... (32 bytes after decode)
     * - raw 32-byte string (advanced)
     *
     * Returns the binary 32-byte key or null if invalid/unusable.
     */
    public static function decodeKeyString(string $raw): ?string
    {
        if (!self::isAvailable()) return null;
        return self::parseKeyString($raw);
    }

    private static function keyFilePath(): string
    {
        return rtrim((string)META_DIR, "/\\") . DIRECTORY_SEPARATOR . 'encryption_master.key';
    }

    public static function getMasterKeyOrNull(): ?string
    {
        if (!self::isAvailable()) return null;
        if (self::$cachedKey !== null) return self::$cachedKey;

        $env = getenv('FR_ENCRYPTION_MASTER_KEY');
        if (is_string($env) && $env !== '') {
            $k = self::parseKeyString($env);
            if ($k !== null) {
                self::$cachedKey = $k;
                return $k;
            }
        }

        $kf = self::keyFilePath();
        if (is_file($kf)) {
            $bin = @file_get_contents($kf);
            if (is_string($bin) && strlen($bin) === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES) {
                self::$cachedKey = $bin;
                return $bin;
            }
        }

        return null;
    }

    public static function requireMasterKey(): string
    {
        $k = self::getMasterKeyOrNull();
        if ($k === null) {
            throw new \RuntimeException('Encryption master key missing. Set FR_ENCRYPTION_MASTER_KEY or provide META_DIR/encryption_master.key (32 bytes).');
        }
        return $k;
    }

    private static function packU64BE(int $n): string
    {
        // Pack unsigned 64-bit big-endian using two uint32s.
        $hi = ($n >> 32) & 0xFFFFFFFF;
        $lo = $n & 0xFFFFFFFF;
        return pack('N2', $hi, $lo);
    }

    private static function unpackU64BE(string $b): int
    {
        $u = unpack('Nhi/Nlo', $b);
        $hi = (int)($u['hi'] ?? 0);
        $lo = (int)($u['lo'] ?? 0);
        return ($hi << 32) | $lo;
    }

    public static function isEncryptedFile(string $path): bool
    {
        $h = @fopen($path, 'rb');
        if ($h === false) return false;
        $magic = @fread($h, 4);
        if (!is_string($magic) || strlen($magic) !== 4) {
            @fclose($h);
            return false;
        }
        if ($magic !== self::MAGIC) {
            @fclose($h);
            return false;
        }
        $ver = @fread($h, 1);
        @fclose($h);
        return (is_string($ver) && $ver !== '' && ord($ver) === self::VERSION);
    }

    /**
     * @return array{plainSize:int, header:string}|null
     */
    public static function readHeader(string $path): ?array
    {
        $h = @fopen($path, 'rb');
        if ($h === false) return null;

        $hdr = @fread($h, self::HEADER_LEN);
        @fclose($h);
        if (!is_string($hdr) || strlen($hdr) !== self::HEADER_LEN) return null;

        if (substr($hdr, 0, 4) !== self::MAGIC) return null;
        if (ord($hdr[4]) !== self::VERSION) return null;

        $plainSize = self::unpackU64BE(substr($hdr, 6, 8));
        $ssHeader = substr($hdr, 14, 24);

        if (strlen($ssHeader) !== SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES) return null;

        return ['plainSize' => $plainSize, 'header' => $ssHeader];
    }

    public static function encryptFileInPlace(string $path): void
    {
        if (!self::isAvailable()) {
            throw new \RuntimeException('libsodium secretstream is not available on this PHP build.');
        }
        if (!is_file($path)) {
            throw new \RuntimeException('File not found for encryption.');
        }
        if (self::isEncryptedFile($path)) {
            return;
        }

        $key = self::requireMasterKey();

        $dir = dirname($path);
        $base = basename($path);
        $tmp = $dir . DIRECTORY_SEPARATOR . '.' . $base . '.frtmp.' . bin2hex(random_bytes(6));

        $in = @fopen($path, 'rb');
        if ($in === false) {
            throw new \RuntimeException('Unable to open file for encryption.');
        }

        $out = @fopen($tmp, 'wb');
        if ($out === false) {
            @fclose($in);
            throw new \RuntimeException('Unable to open temp file for encryption.');
        }

        try {
            $plainSize = @filesize($path);
            if (!is_int($plainSize) || $plainSize < 0) $plainSize = 0;

            $init = sodium_crypto_secretstream_xchacha20poly1305_init_push($key);
            if (!is_array($init) || count($init) < 2) {
                throw new \RuntimeException('Failed to initialize secretstream (push).');
            }
            $state  = $init[0];
            $header = $init[1];

            // Write header
            fwrite($out, self::MAGIC);
            fwrite($out, chr(self::VERSION));
            fwrite($out, chr(self::FLAGS));
            fwrite($out, self::packU64BE((int)$plainSize));
            fwrite($out, $header);

            while (!feof($in)) {
                $chunk = fread($in, self::CHUNK_SIZE);
                if ($chunk === '' || $chunk === false) {
                    break;
                }
                $cipher = sodium_crypto_secretstream_xchacha20poly1305_push(
                    $state,
                    $chunk,
                    '',
                    SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_MESSAGE
                );
                $len = strlen($cipher);
                fwrite($out, pack('N', $len));
                fwrite($out, $cipher);
            }

            // Always finalize with an empty FINAL frame
            $final = sodium_crypto_secretstream_xchacha20poly1305_push(
                $state,
                '',
                '',
                SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL
            );
            fwrite($out, pack('N', strlen($final)));
            fwrite($out, $final);
        } catch (\Throwable $e) {
            @fclose($in);
            @fclose($out);
            @unlink($tmp);
            throw $e;
        }

        @fclose($in);
        @fclose($out);

        $mode = @fileperms($path);
        @rename($tmp, $path);
        if (is_int($mode) && $mode > 0) {
            @chmod($path, $mode & 0777);
        }
    }

    public static function decryptFileToPath(string $srcPath, string $destPath): void
    {
        $out = @fopen($destPath, 'wb');
        if ($out === false) {
            throw new \RuntimeException('Unable to open destination file for decryption.');
        }
        try {
            self::streamDecrypted($srcPath, $out);
        } finally {
            @fclose($out);
        }
    }

    public static function decryptFileInPlace(string $path): void
    {
        if (!self::isAvailable()) {
            throw new \RuntimeException('libsodium secretstream is not available on this PHP build.');
        }
        if (!is_file($path)) {
            throw new \RuntimeException('File not found for decryption.');
        }
        if (!self::isEncryptedFile($path)) {
            return;
        }

        $dir = dirname($path);
        $base = basename($path);
        $tmp = $dir . DIRECTORY_SEPARATOR . '.' . $base . '.frtmpdec.' . bin2hex(random_bytes(6));

        self::decryptFileToPath($path, $tmp);

        $mode = @fileperms($path);
        @rename($tmp, $path);
        if (is_int($mode) && $mode > 0) {
            @chmod($path, $mode & 0777);
        }
    }

    /**
     * Stream-decrypt an encrypted file into an output stream resource.
     *
     * @param resource $out
     */
    public static function streamDecrypted(string $path, $out): void
    {
        if (!self::isAvailable()) {
            throw new \RuntimeException('libsodium secretstream is not available on this PHP build.');
        }
        $key = self::requireMasterKey();

        $in = @fopen($path, 'rb');
        if ($in === false) {
            throw new \RuntimeException('Unable to open encrypted file.');
        }

        try {
            $hdr = fread($in, self::HEADER_LEN);
            if (!is_string($hdr) || strlen($hdr) !== self::HEADER_LEN) {
                throw new \RuntimeException('Invalid encrypted file header.');
            }
            if (substr($hdr, 0, 4) !== self::MAGIC || ord($hdr[4]) !== self::VERSION) {
                throw new \RuntimeException('Invalid encrypted file magic/version.');
            }

            $ssHeader = substr($hdr, 14, 24);
            $state = sodium_crypto_secretstream_xchacha20poly1305_init_pull($ssHeader, $key);

            $written = 0;

            while (!feof($in)) {
                $lenBytes = fread($in, 4);
                if ($lenBytes === '' || $lenBytes === false) break;
                if (strlen($lenBytes) !== 4) {
                    throw new \RuntimeException('Corrupt encrypted file framing.');
                }
                $u = unpack('Nlen', $lenBytes);
                $len = (int)($u['len'] ?? 0);
                if ($len <= 0 || $len > self::MAX_FRAME_BYTES) {
                    throw new \RuntimeException('Invalid encrypted frame length.');
                }

                $cipher = '';
                $remaining = $len;
                while ($remaining > 0 && !feof($in)) {
                    $buf = fread($in, min(65536, $remaining));
                    if ($buf === '' || $buf === false) break;
                    $cipher .= $buf;
                    $remaining -= strlen($buf);
                }
                if (strlen($cipher) !== $len) {
                    throw new \RuntimeException('Truncated encrypted frame.');
                }

                $res = sodium_crypto_secretstream_xchacha20poly1305_pull($state, $cipher, '');
                $msg = $res[0] ?? '';
                $tag = $res[2] ?? null;

                if ($msg !== '') {
                    fwrite($out, $msg);
                    $written += strlen($msg);
                }

                if ($tag === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL) {
                    break;
                }
            }
        } finally {
            @fclose($in);
        }
    }
}
