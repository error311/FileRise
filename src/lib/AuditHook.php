<?php
// src/lib/AuditHook.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

final class AuditHook
{
    private const SOURCES = ['web', 'webdav', 'share', 'portal'];

    public static function log(string $action, array $fields = []): void
    {
        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) return;
        if (!class_exists('ProAudit')) return;
        if ($action === '') return;

        $fields['source'] = self::normalizeSource($fields['source'] ?? self::detectSource());
        if (class_exists('SourceContext')) {
            if (!array_key_exists('storageId', $fields)) {
                $fields['storageId'] = SourceContext::getActiveId();
            }
            if (!array_key_exists('storageName', $fields)) {
                $src = SourceContext::getActiveSource();
                $name = is_array($src) ? (string)($src['name'] ?? '') : '';
                if ($name !== '') {
                    $fields['storageName'] = $name;
                } elseif (!empty($fields['storageId'])) {
                    $fields['storageName'] = (string)$fields['storageId'];
                }
            }
        }
        $fields['ip'] = $fields['ip'] ?? self::clientIp();
        $fields['ua'] = $fields['ua'] ?? self::userAgent();

        try {
            ProAudit::log($action, $fields);
        } catch (\Throwable $e) {
            // best-effort only; never block core ops
        }
    }

    public static function normalizeSource(string $raw): string
    {
        $raw = strtolower(trim($raw));
        return in_array($raw, self::SOURCES, true) ? $raw : 'web';
    }

    private static function detectSource(): string
    {
        $raw = $_SERVER['HTTP_X_FR_SOURCE'] ?? '';
        if ($raw === '' && isset($_GET['source'])) {
            $raw = (string)$_GET['source'];
        }
        if ($raw === '' && isset($_POST['source'])) {
            $raw = (string)$_POST['source'];
        }
        return self::normalizeSource((string)$raw);
    }

    public static function clientIp(): string
    {
        $candidates = [];
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xff !== '') {
            $parts = array_map('trim', explode(',', $xff));
            $candidates = array_merge($candidates, $parts);
        }
        if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
            $candidates[] = (string)$_SERVER['HTTP_X_REAL_IP'];
        }
        if (!empty($_SERVER['REMOTE_ADDR'])) {
            $candidates[] = (string)$_SERVER['REMOTE_ADDR'];
        }

        foreach ($candidates as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
        return '';
    }

    public static function userAgent(): string
    {
        $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
        $ua = str_replace(["\r", "\n"], ' ', $ua);
        if (strlen($ua) > 512) {
            $ua = substr($ua, 0, 512);
        }
        return $ua;
    }
}
