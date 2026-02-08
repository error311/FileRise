<?php

if (!defined('PROJECT_ROOT')) {
    define('PROJECT_ROOT', dirname(__DIR__, 2));
}

require_once __DIR__ . '/../FileRise/Domain/UserModel.php';

$shimWarn = getenv('FR_SHIM_WARN');
if ($shimWarn !== false && $shimWarn !== '' && $shimWarn !== '0') {
    require_once __DIR__ . '/../shim_warn.php';
    fr_shim_warn(__FILE__);
}


$original = '\FileRise\\Domain\\UserModel';
$aliases = ['UserModel', 'userModel'];
foreach ($aliases as $alias) {
    if (!class_exists($alias, false) && !interface_exists($alias, false)) {
        if (class_exists($original, false) || interface_exists($original, false)) {
            class_alias($original, $alias);
        }
    }
}
