<?php
// public/api/pro/portals/submitForm.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/PortalController.php';
require_once PROJECT_ROOT . '/src/controllers/AdminController.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    // For now, portal forms still require a logged-in user
    AdminController::requireAuth();
    AdminController::requireCsrf();

    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
        return;
    }

    $slug = isset($body['slug']) ? trim((string)$body['slug']) : '';
    if ($slug === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing portal slug']);
        return;
    }

    $form = isset($body['form']) && is_array($body['form']) ? $body['form'] : [];
    $name      = trim((string)($form['name'] ?? ''));
    $email     = trim((string)($form['email'] ?? ''));
    $reference = trim((string)($form['reference'] ?? ''));
    $notes     = trim((string)($form['notes'] ?? ''));

    // Make sure portal exists and is not expired
    $portal = PortalController::getPortalBySlug($slug);

    if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
        throw new RuntimeException('FileRise Pro is not active.');
    }

    $subPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProPortalSubmissions.php';
    if (!is_file($subPath)) {
        throw new RuntimeException('ProPortalSubmissions.php not found in Pro bundle.');
    }
    require_once $subPath;

    $submittedBy = (string)($_SESSION['username'] ?? '');

    // ─────────────────────────────
    // Better client IP detection
    // ─────────────────────────────
    $ip = '';
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        // Can be a comma-separated list; use the first non-empty
        $parts = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
        foreach ($parts as $part) {
            $candidate = trim($part);
            if ($candidate !== '') {
                $ip = $candidate;
                break;
            }
        }
    } elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $ip = trim((string)$_SERVER['HTTP_X_REAL_IP']);
    } elseif (!empty($_SERVER['REMOTE_ADDR'])) {
        $ip = trim((string)$_SERVER['REMOTE_ADDR']);
    }

    $payload = [
        'slug'        => $slug,
        'portalLabel' => $portal['label'] ?? '',
        'folder'      => $portal['folder'] ?? '',
        'form'        => [
            'name'      => $name,
            'email'     => $email,
            'reference' => $reference,
            'notes'     => $notes,
        ],
        'submittedBy' => $submittedBy,
        'ip'          => $ip,
        'userAgent'   => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'createdAt'   => gmdate('c'),
    ];

    $store = new ProPortalSubmissions(FR_PRO_BUNDLE_DIR);
    $ok    = $store->store($slug, $payload);
    if (!$ok) {
        throw new RuntimeException('Failed to store portal submission.');
    }

    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $code = $e instanceof InvalidArgumentException ? 400 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}