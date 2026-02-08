<?php

require_once __DIR__ . '/../FileRise/Storage/StorageRegistry.php';

$original = '\FileRise\Storage\StorageRegistry';
$alias = 'StorageRegistry';
if (!class_exists($alias, false) && !interface_exists($alias, false)) {
    if (class_exists($original, false) || interface_exists($original, false)) {
        class_alias($original, $alias);
    }
}
