<?php

declare(strict_types=1);

use FileRise\Domain\AuthModel;
use FileRise\Support\TotpAttemptLimiter;

$baseDir = dirname(__DIR__, 2);

if (isset($argv[1])) {
    $case = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
    putenv('FR_TRUSTED_PROXIES=' . $case['trust']);
    putenv('FR_IP_HEADER=' . $case['header']);
    session_save_path((string)getenv('FR_PROXY_TEST_SESSIONS'));
    require $baseDir . '/config/config.php';
    echo json_encode([
        'ip' => AuthModel::getClientIp($case['server']),
        'proxy' => AuthModel::isRequestFromTrustedProxy($case['server']),
    ]);
    exit;
}

function proxyIpCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

function proxyIpRemove(string $path): void
{
    if (is_file($path) || is_link($path)) {
        unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $name) {
        proxyIpRemove($path . '/' . $name);
    }
    rmdir($path);
}

$tmp = sys_get_temp_dir() . '/fr-proxy-ip-' . bin2hex(random_bytes(6));
foreach (['users', 'uploads', 'metadata', 'sessions'] as $dir) {
    mkdir($tmp . '/' . $dir, 0700, true);
}
try {
    foreach (['USERS' => 'users', 'UPLOAD' => 'uploads', 'META' => 'metadata'] as $key => $dir) {
        putenv('FR_TEST_' . $key . '_DIR=' . $tmp . '/' . $dir);
    }
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    putenv('FR_PROXY_TEST_SESSIONS=' . $tmp . '/sessions');
    $cases = [
        // name, trusted proxies, header setting, socket peer, header value, expected client, trusted peer?
        ['direct', '', 'X-Forwarded-For', '203.0.113.20', '198.51.100.9', '203.0.113.20', false],
        ['untrusted', '10.0.0.2', 'X-Forwarded-For', '203.0.113.20', '198.51.100.9', '203.0.113.20', false],
        ['single proxy', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '203.0.113.20', '203.0.113.20', true],
        ['spoofed first hop', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, 203.0.113.20', '203.0.113.20', true],
        ['multiple trusted hops', '10.0.0.0/24', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, 203.0.113.20, 10.0.0.3', '203.0.113.20', true],
        ['untrusted intermediary', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, 10.0.0.3', '10.0.0.3', true],
        ['all hops trusted', '10.0.0.0/24', 'X-Forwarded-For', '10.0.0.2', '10.0.0.4, 10.0.0.3', '10.0.0.4', true],
        ['IPv6 chain', '2001:db8:1::/64', 'X-Forwarded-For', '2001:db8:1::2', '198.51.100.9, 2001:db8:2::20, 2001:db8:1::3', '2001:db8:2::20', true],
        ['mixed address families', '2001:db8:1::/64,10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, 203.0.113.20, 2001:db8:1::3', '203.0.113.20', true],
        ['IPv6 range cannot trust IPv4', '::/0', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9', '10.0.0.2', false],
        ['invalid nearest hop', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, invalid', '10.0.0.2', true],
        ['empty nearest hop', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, ', '10.0.0.2', true],
        ['unknown intermediate hop', '10.0.0.0/24', 'X-Forwarded-For', '10.0.0.2', '198.51.100.9, , 10.0.0.3', '10.0.0.2', true],
        ['untrusted prefix ignored', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', 'invalid, 203.0.113.20', '203.0.113.20', true],
        ['absent header', '10.0.0.2', 'X-Forwarded-For', '10.0.0.2', '', '10.0.0.2', true],
        ['normalized header setting', '10.0.0.2', 'HTTP_X_FORWARDED_FOR', '10.0.0.2', '198.51.100.9, 203.0.113.20', '203.0.113.20', true],
        ['X-Real-IP', '10.0.0.2', 'X-Real-IP', '10.0.0.2', '203.0.113.20', '203.0.113.20', true],
        ['CF-Connecting-IP', '10.0.0.2', 'CF-Connecting-IP', '10.0.0.2', '2001:db8:2::20', '2001:db8:2::20', true],
        ['malformed single-IP header', '10.0.0.2', 'X-Real-IP', '10.0.0.2', '198.51.100.9, 203.0.113.20', '10.0.0.2', true],
        ['REMOTE_ADDR setting', '10.0.0.2', 'REMOTE_ADDR', '10.0.0.2', '10.0.0.2', '10.0.0.2', true],
    ];
    foreach ($cases as [$name, $trust, $header, $remote, $value, $expected, $trustedPeer]) {
        $key = strtoupper(str_replace('-', '_', $header));
        if ($key !== 'REMOTE_ADDR' && !str_starts_with($key, 'HTTP_')) {
            $key = 'HTTP_' . $key;
        }
        $case = ['trust' => $trust, 'header' => $header, 'server' => ['REMOTE_ADDR' => $remote, $key => $value]];
        $proc = proc_open([PHP_BINARY, '-d', 'display_errors=stderr', __FILE__, json_encode($case)], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        proxyIpCheck(is_resource($proc), 'Could not start child');
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proxyIpCheck(proc_close($proc) === 0, $name . ': ' . $err);
        $result = json_decode($out, true);
        proxyIpCheck(($result['ip'] ?? '') === $expected, $name . ': wrong client IP');
        proxyIpCheck(($result['proxy'] ?? null) === $trustedPeer, $name . ': wrong immediate-peer trust');
    }

    putenv('FR_TRUSTED_PROXIES=10.0.0.2');
    putenv('FR_IP_HEADER=X-Forwarded-For');
    session_save_path($tmp . '/sessions');
    require $baseDir . '/config/config.php';
    for ($i = 1; $i <= 51; $i++) {
        $ip = AuthModel::getClientIp(['REMOTE_ADDR' => '10.0.0.2', 'HTTP_X_FORWARDED_FOR' => '198.51.100.' . $i . ', 203.0.113.40']);
        $result = TotpAttemptLimiter::beginAttempt('user' . $i, $ip);
        proxyIpCheck($result['allowed'] === ($i <= 50), 'TOTP source limiter accepted spoof rotation');
    }
    for ($i = 1; $i <= 6; $i++) {
        $result = TotpAttemptLimiter::beginAttempt('sameaccount', '192.0.2.' . $i);
        proxyIpCheck($result['allowed'] === ($i <= 5), 'TOTP account-wide protection changed');
    }
    echo 'Proxy client IP regressions passed (' . count($cases) . " resolution cases plus TOTP limits)\n";
} finally {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_abort();
    }
    proxyIpRemove($tmp);
}
