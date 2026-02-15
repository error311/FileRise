<?php
// public/api/pro/sources/test.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/StorageFactory.php';
require_once PROJECT_ROOT . '/src/lib/SourcesConfig.php';

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

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
        exit;
    }

    $id = trim((string)($body['id'] ?? ''));
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing source id']);
        exit;
    }

    $source = SourcesConfig::getSource($id);
    if (!$source) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Source not found']);
        exit;
    }

    $type = strtolower((string)($source['type'] ?? 'local'));
    if ($type === 'local') {
        $cfg = isset($source['config']) && is_array($source['config']) ? $source['config'] : [];
        $path = trim((string)($cfg['path'] ?? $cfg['root'] ?? ''));
        if ($path === '') {
            $path = (string)UPLOAD_DIR;
        }
        $path = rtrim($path, "/\\");
        if ($path === '') {
            $path = (string)UPLOAD_DIR;
        }
        if (!is_dir($path)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Local path not found']);
            exit;
        }
        if (!is_readable($path)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Local path not readable']);
            exit;
        }
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $adapter = StorageFactory::createAdapterFromSourceConfig($source, false);
    if (!$adapter) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Adapter unavailable']);
        exit;
    }

    if (!method_exists($adapter, 'testConnection')) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Adapter does not support testing']);
        exit;
    }

    $ok = (bool)$adapter->testConnection();
    if (!$ok) {
        $detail = '';
        if (method_exists($adapter, 'getLastError')) {
            $detail = trim((string)$adapter->getLastError());
        }
        $msg = $detail !== '' ? $detail : 'Connection test failed';
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => $msg]);
        exit;
    }

    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error testing source'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
