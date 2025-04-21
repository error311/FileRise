<?php
// public/webdav.php

if (
    empty($_SERVER['PHP_AUTH_USER'])
 && !empty($_SERVER['HTTP_AUTHORIZATION'])
 && preg_match('#Basic\s+(.*)$#i', $_SERVER['HTTP_AUTHORIZATION'], $m)
) {
    [$u, $p] = explode(':', base64_decode($m[1]), 2) + ['', ''];
    $_SERVER['PHP_AUTH_USER'] = $u;
    $_SERVER['PHP_AUTH_PW']   = $p;
}

require_once __DIR__ . '/../config/config.php';        // UPLOAD_DIR, META_DIR, DATE_TIME_FORMAT
require_once __DIR__ . '/../vendor/autoload.php';      // Composer & SabreDAV
require_once __DIR__ . '/../src/models/AuthModel.php'; // AuthModel::authenticate(), getUserRole(), loadFolderPermission()

// ─── 3) Load your WebDAV directory implementation ──────────────────────────
require_once __DIR__ . '/../src/webdav/FileRiseDirectory.php';
use Sabre\DAV\Server;
use Sabre\DAV\Auth\Backend\BasicCallBack;
use Sabre\DAV\Auth\Plugin          as AuthPlugin;
use Sabre\DAV\Browser\Plugin       as BrowserPlugin;
use Sabre\DAV\Locks\Plugin         as LocksPlugin;
use Sabre\DAV\Locks\Backend\File   as LocksFileBackend;
use FileRise\WebDAV\FileRiseDirectory;

$authBackend = new BasicCallBack(function(string $user, string $pass) {
    return \AuthModel::authenticate($user, $pass) !== false;
});
$authPlugin = new AuthPlugin($authBackend, 'FileRise');

$user       = $_SERVER['PHP_AUTH_USER'] ?? '';
$isAdmin    = (\AuthModel::getUserRole($user) === '1');
$folderOnly = (bool)\AuthModel::loadFolderPermission($user);

if ($isAdmin || !$folderOnly) {
    // admins or unrestricted users see the full /uploads
    $rootPath = rtrim(UPLOAD_DIR, '/\\');
} else {
    // folder‑only users see only /uploads/{username}
    $rootPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $user;
    if (!is_dir($rootPath)) {
        mkdir($rootPath, 0755, true);
    }
}

$server = new Server([
    new FileRiseDirectory($rootPath, $user, $folderOnly),
]);

$server->addPlugin($authPlugin);
//$server->addPlugin(new BrowserPlugin());  // optional HTML browser UI
$server->addPlugin(
    new LocksPlugin(
        new LocksFileBackend(sys_get_temp_dir() . '/sabre-locksdb')
    )
);

$server->setBaseUri('/webdav.php/');
$server->exec();