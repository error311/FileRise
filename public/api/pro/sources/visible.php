<?php
// public/api/pro/sources/visible.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

try {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();

    $username = (string)($_SESSION['username'] ?? '');
    $perms = [];
    try {
        if (function_exists('loadUserPermissions')) {
            $p = loadUserPermissions($username);
            $perms = is_array($p) ? $p : [];
        } elseif (class_exists(\FileRise\Domain\UserModel::class) && method_exists(\FileRise\Domain\UserModel::class, 'getUserPermissions')) {
            $all = \FileRise\Domain\UserModel::getUserPermissions();
            if (is_array($all)) {
                if (isset($all[$username])) {
                    $perms = (array)$all[$username];
                } else {
                    $lk = strtolower($username);
                    if (isset($all[$lk])) $perms = (array)$all[$lk];
                }
            }
        }
    } catch (Throwable $e) { /* ignore */ }

    $activeId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';
    $proActive = defined('FR_PRO_ACTIVE')
        && FR_PRO_ACTIVE
        && class_exists('ProSources')
        && fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SOURCES);
    if (!$proActive) {
        echo json_encode([
            'ok' => true,
            'enabled' => false,
            'sources' => [],
            'activeId' => $activeId,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $cfg = ProSources::getPublicConfig();
    $enabled = !empty($cfg['enabled']);
    $sources = isset($cfg['sources']) && is_array($cfg['sources']) ? $cfg['sources'] : [];

    if (!$enabled || !$sources) {
        echo json_encode([
            'ok' => true,
            'enabled' => (bool)$enabled,
            'sources' => [],
            'activeId' => $activeId,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $visible = [];
    $originalId = $activeId;
    foreach ($sources as $src) {
        if (!is_array($src)) continue;
        $id = (string)($src['id'] ?? '');
        if ($id === '') continue;

        if (class_exists('SourceContext')) {
            SourceContext::setActiveId($id, false);
        }
        if (ACL::userHasAnyAccess($username, $perms, 'root')) {
            $visible[] = $src;
        }
    }
    if (class_exists('SourceContext') && $originalId !== '') {
        SourceContext::setActiveId($originalId, false);
    }

    echo json_encode([
        'ok' => true,
        'enabled' => (bool)$enabled,
        'sources' => $visible,
        'activeId' => $activeId,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Error loading sources',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
