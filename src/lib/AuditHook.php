<?php

require_once __DIR__ . '/../FileRise/Support/AuditHook.php';

$original = '\FileRise\Support\AuditHook';
$alias = 'AuditHook';
if (!class_exists($alias, false) && !interface_exists($alias, false)) {
    if (class_exists($original, false) || interface_exists($original, false)) {
        class_alias($original, $alias);
    }
}
