<?php
// public/webdav.php

// ─── 0) Forward Basic auth into PHP_AUTH_* for every HTTP verb ─────────────
if (
    empty($_SERVER['PHP_AUTH_USER'])
 && !empty($_SERVER['HTTP_AUTHORIZATION'])
 && preg_match('#Basic\s+(.*)$#i', $_SERVER['HTTP_AUTHORIZATION'], $m)
) {
    [$u, $p] = explode(':', base64_decode($m[1]), 2) + ['', ''];
    $_SERVER['PHP_AUTH_USER'] = $u;
    $_SERVER['PHP_AUTH_PW']   = $p;
}

// ─── 1) Bootstrap & load models ─────────────────────────────────────────────
require_once __DIR__ . '/../config/config.php';        // UPLOAD_DIR, META_DIR, loadUserPermissions(), etc.
require_once __DIR__ . '/../vendor/autoload.php';      // Composer & SabreDAV
require_once __DIR__ . '/../src/models/AuthModel.php'; // AuthModel::authenticate(), getUserRole()
require_once __DIR__ . '/../src/models/AdminModel.php';// AdminModel::getConfig()
require_once __DIR__ . '/../src/lib/ACL.php';          // ACL checks
require_once __DIR__ . '/../src/webdav/CurrentUser.php';

// ─── 1.1) Global WebDAV feature toggle ──────────────────────────────────────
$adminConfig  = AdminModel::getConfig();
$enableWebDAV = isset($adminConfig['enableWebDAV']) && $adminConfig['enableWebDAV'];
if (!$enableWebDAV) {
    header('HTTP/1.1 403 Forbidden');
    echo 'WebDAV access is currently disabled by administrator.';
    exit;
}

// ─── 2) Load WebDAV directory implementation (ACL-aware) ────────────────────
require_once __DIR__ . '/../src/webdav/FileRiseDirectory.php';

use Sabre\DAV\Server;
use Sabre\DAV\Auth\Backend\BasicCallBack;
use Sabre\DAV\Auth\Plugin          as AuthPlugin;
use Sabre\DAV\Locks\Plugin         as LocksPlugin;
use Sabre\DAV\Locks\Backend\File   as LocksFileBackend;
use FileRise\WebDAV\FileRiseDirectory;
use FileRise\WebDAV\CurrentUser;

// ─── 3) HTTP-Basic backend (delegates to your AuthModel) ────────────────────
$authBackend = new BasicCallBack(function(string $user, string $pass) {
    return \AuthModel::authenticate($user, $pass) !== false;
});
$authPlugin = new AuthPlugin($authBackend, 'FileRise');

// ─── 4) Resolve authenticated user + perms ──────────────────────────────────
$user = $_SERVER['PHP_AUTH_USER'] ?? '';
if ($user === '') {
    header('HTTP/1.1 401 Unauthorized');
    header('WWW-Authenticate: Basic realm="FileRise"');
    echo 'Authentication required.';
    exit;
}

$perms   = is_callable('loadUserPermissions') ? (loadUserPermissions($user) ?: []) : [];
$isAdmin = (\AuthModel::getUserRole($user) === '1');

// set for metadata attribution in WebDAV writes
CurrentUser::set($user);

// ─── 5) Mount the real uploads root; ACL filters everything at node level ───
$rootPath = rtrim(UPLOAD_DIR, '/\\');

$server = new Server([
    new FileRiseDirectory($rootPath, $user, $isAdmin, $perms),
]);

// Auth + Locks
$server->addPlugin($authPlugin);
$server->addPlugin(
    new LocksPlugin(
        new LocksFileBackend(sys_get_temp_dir() . '/sabre-locksdb')
    )
);

// Base URI (adjust if you serve from a subdir or rewrite rule)
$server->setBaseUri('/webdav.php/');

// Execute
$server->exec();