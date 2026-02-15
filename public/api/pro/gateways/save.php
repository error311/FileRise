<?php
// public/api/pro/gateways/save.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    \FileRise\Http\Controllers\AdminController::requireAuth();
    \FileRise\Http\Controllers\AdminController::requireAdmin();
    \FileRise\Http\Controllers\AdminController::requireCsrf();

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProGateways')) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Pro is not active']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
        exit;
    }

    $gw = $body['gateway'] ?? $body;
    if (!is_array($gw)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing gateway payload']);
        exit;
    }

    $sourceId = trim((string)($gw['sourceId'] ?? 'local'));
    if (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
        if ($sourceId !== '' && strcasecmp($sourceId, 'local') !== 0) {
            $src = SourceContext::getSourceById($sourceId);
            if (!$src) {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => 'Invalid sourceId']);
                exit;
            }
        }
    } else {
        if ($sourceId !== '' && strcasecmp($sourceId, 'local') !== 0) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Sources are not enabled (only local sourceId is supported)']);
            exit;
        }
    }

    $actor = isset($_SESSION['username']) ? trim((string)$_SESSION['username']) : '';

    $res = ProGateways::upsertGateway($gw, $actor);
    if (empty($res['ok'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => (string)($res['error'] ?? 'Failed to save gateway share')]);
        exit;
    }

    $gateway = $res['gateway'] ?? null;
    $id = is_array($gateway) ? trim((string)($gateway['id'] ?? '')) : '';
    $snippets = $id !== '' ? ProGateways::buildSnippets($id, false) : null;
    $cmd = is_array($snippets) ? ($snippets['startCommand'] ?? null) : ($id !== '' ? ProGateways::buildStartCommand($id, false) : null);

    echo json_encode([
        'ok' => true,
        'gateway' => $gateway,
        'startCommand' => $cmd,
        'dockerCompose' => is_array($snippets) ? ($snippets['dockerCompose'] ?? null) : null,
        'systemd' => is_array($snippets) ? ($snippets['systemd'] ?? null) : null,
        'snippets' => [
            'startCommand' => $cmd,
            'dockerCompose' => is_array($snippets) ? ($snippets['dockerCompose'] ?? null) : null,
            'systemd' => is_array($snippets) ? ($snippets['systemd'] ?? null) : null,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error saving gateway share'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
