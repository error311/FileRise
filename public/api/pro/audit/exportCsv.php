<?php
declare(strict_types=1);
// public/api/pro/audit/exportCsv.php

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
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

if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !class_exists('ProAudit')) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'pro_required']);
    exit;
}

$isAdmin = ACL::isAdmin($perms);

function ownsFolderOrAncestor(string $folder, string $user, array $perms): bool
{
    if (ACL::isAdmin($perms)) return true;
    $folder = ACL::normalizeFolder($folder);
    $f = $folder;
    while ($f !== '' && strtolower($f) !== 'root') {
        if (ACL::isOwner($user, $perms, $f)) return true;
        $pos = strrpos($f, '/');
        $f = ($pos === false) ? '' : substr($f, 0, $pos);
    }
    return false;
}

$folder = isset($_GET['folder']) ? (string)$_GET['folder'] : '';
$folder = trim(str_replace('\\', '/', $folder));
$folder = ($folder === '' || strcasecmp($folder, 'root') === 0) ? '' : trim($folder, '/');

if (!$isAdmin) {
    if ($folder === '') {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'folder_required']);
        exit;
    }
    if (!preg_match(REGEX_FOLDER_NAME, $folder)) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Invalid folder name.']);
        exit;
    }
    if (!(ACL::canManage($username, $perms, $folder) || ownsFolderOrAncestor($folder, $username, $perms))) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Forbidden']);
        exit;
    }
}

$filters = [
    'user'   => isset($_GET['user']) ? (string)$_GET['user'] : '',
    'action' => isset($_GET['action']) ? (string)$_GET['action'] : '',
    'source' => isset($_GET['source']) ? (string)$_GET['source'] : '',
    'folder' => $folder,
    'from'   => isset($_GET['from']) ? (string)$_GET['from'] : '',
    'to'     => isset($_GET['to']) ? (string)$_GET['to'] : '',
];

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
$limit = max(1, min(5000, $limit));

header_remove('Content-Type');
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="filerise-audit.csv"');

$result = ProAudit::exportCsv($filters, $limit);
if (empty($result['ok'])) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $result['error'] ?? 'export_failed']);
    exit;
}
