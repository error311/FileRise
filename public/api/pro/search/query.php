<?php
declare(strict_types=1);
// Pro Search Everywhere query endpoint

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../../config/config.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$username = (string)($_SESSION['username'] ?? '');
$perms = [
    'role'        => $_SESSION['role']        ?? null,
    'admin'       => $_SESSION['admin']       ?? null,
    'isAdmin'     => $_SESSION['isAdmin']     ?? null,
    'folderOnly'  => $_SESSION['folderOnly']  ?? null,
    'readOnly'    => $_SESSION['readOnly']    ?? null,
];
@session_write_close();

// Pro-only gate
if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProSearch')) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'FileRise Pro is not active.']);
    exit;
}

$qRaw   = isset($_GET['q']) ? (string)$_GET['q'] : '';
$limit  = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
$force  = (!empty($_GET['force']) && ACL::isAdmin($perms));

$result = ProSearch::query($qRaw, $limit, $username, $perms, $force);

if (empty($result['ok'])) {
    $code = 400;
    if (($result['error'] ?? '') === 'disabled') $code = 503;
    http_response_code($code);
}

echo json_encode($result, JSON_UNESCAPED_SLASHES);
