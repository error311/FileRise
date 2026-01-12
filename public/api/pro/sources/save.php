<?php
// public/api/pro/sources/save.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/models/AdminModel.php';
require_once PROJECT_ROOT . '/src/lib/StorageFactory.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    AdminController::requireAuth();
    AdminController::requireAdmin();
    AdminController::requireCsrf();

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProSources') || !fr_pro_api_level_at_least(FR_PRO_API_REQUIRE_SOURCES)) {
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

    $didWrite = false;
    $resultSource = null;

    if (array_key_exists('enabled', $body)) {
        $enabled = (bool)$body['enabled'];
        $ok = ProSources::saveEnabled($enabled);
        if (!$ok) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Failed to save sources setting']);
            exit;
        }
        $didWrite = true;
    }

    if (isset($body['source']) && is_array($body['source'])) {
        $res = ProSources::upsertSource($body['source']);
        if (empty($res['ok'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => $res['error'] ?? 'Failed to save source']);
            exit;
        }
        $resultSource = $res['source'] ?? null;
        $didWrite = true;
    }

    if (!$didWrite) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'No changes provided']);
        exit;
    }

    $autoTested = false;
    $autoTestOk = null;
    $autoTestError = '';
    $autoDisabled = false;
    $autoDisableFailed = false;

    if ($resultSource && !empty($resultSource['enabled'])) {
        $autoTested = true;
        $sourceId = trim((string)($resultSource['id'] ?? ''));
        $sourceForTest = $sourceId !== '' ? ProSources::getSource($sourceId) : null;
        $autoTestOk = false;

        if (!$sourceForTest) {
            $autoTestError = 'Source not found after save';
        } else {
            $type = strtolower((string)($sourceForTest['type'] ?? 'local'));
            if ($type === 'local') {
                $cfg = isset($sourceForTest['config']) && is_array($sourceForTest['config'])
                    ? $sourceForTest['config']
                    : [];
                $path = trim((string)($cfg['path'] ?? $cfg['root'] ?? ''));
                if ($path === '') {
                    $path = (string)UPLOAD_DIR;
                }
                $path = rtrim($path, "/\\");
                if ($path === '') {
                    $path = (string)UPLOAD_DIR;
                }
                if (!is_dir($path)) {
                    $autoTestError = 'Local path not found';
                } elseif (!is_readable($path)) {
                    $autoTestError = 'Local path not readable';
                } else {
                    $autoTestOk = true;
                }
            } else {
                $adapter = null;
                try {
                    $adapter = StorageFactory::createAdapterFromSourceConfig($sourceForTest, false);
                } catch (Throwable $e) {
                    $autoTestError = 'Adapter error';
                }
                if (!$adapter) {
                    if ($autoTestError === '') {
                        $autoTestError = 'Adapter unavailable';
                    }
                } elseif (!method_exists($adapter, 'testConnection')) {
                    $autoTestError = 'Adapter does not support testing';
                } else {
                    try {
                        $autoTestOk = (bool)$adapter->testConnection();
                    } catch (Throwable $e) {
                        $autoTestOk = false;
                        if ($autoTestError === '') {
                            $autoTestError = 'Connection test error';
                        }
                    }
                    if (!$autoTestOk && $autoTestError === '') {
                        if (method_exists($adapter, 'getLastError')) {
                            $autoTestError = trim((string)$adapter->getLastError());
                        }
                        if ($autoTestError === '') {
                            $autoTestError = 'Connection test failed';
                        }
                    }
                }
            }
        }

        if ($autoTestOk !== true) {
            if ($autoTestError === '') {
                $autoTestError = 'Connection test failed';
            }
            $disableSource = $sourceForTest;
            if (!$disableSource && isset($body['source']) && is_array($body['source'])) {
                $disableSource = $body['source'];
            }
            if (is_array($disableSource)) {
                $disableSource['enabled'] = false;
                $resDisable = ProSources::upsertSource($disableSource);
                if (empty($resDisable['ok'])) {
                    $autoDisableFailed = true;
                } else {
                    $autoDisabled = true;
                    $resultSource = $resDisable['source'] ?? $resultSource;
                }
            } else {
                $autoDisableFailed = true;
            }
        }
    }

    $cfg = AdminModel::getConfig();
    if (!isset($cfg['error'])) {
        $public = AdminModel::buildPublicSubset($cfg);
        AdminModel::writeSiteConfig($public);
    }

    echo json_encode([
        'ok' => true,
        'source' => $resultSource,
        'autoTested' => $autoTested,
        'autoTestOk' => $autoTestOk,
        'autoTestError' => $autoTestError,
        'autoDisabled' => $autoDisabled,
        'autoDisableFailed' => $autoDisableFailed,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error saving source'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
