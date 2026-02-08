<?php

if (!function_exists('fr_shim_warn')) {
    function fr_shim_warn(string $shimPath): void
    {
        $env = getenv('FR_SHIM_WARN');
        if ($env === false || $env === '' || $env === '0') {
            return;
        }

        static $seen = [];
        static $registered = false;
        if (!isset($seen[$shimPath])) {
            $seen[$shimPath] = $shimPath;
        }

        if ($registered) {
            return;
        }

        $registered = true;
        register_shutdown_function(function () use (&$seen): void {
            if (!$seen) {
                return;
            }
            $list = array_values($seen);
            $suffix = '';
            $max = 20;
            if (count($list) > $max) {
                $suffix = ' (+' . (count($list) - $max) . ' more)';
                $list = array_slice($list, 0, $max);
            }
            error_log('FileRise legacy shims used: ' . implode(', ', $list) . $suffix);
        });
    }
}
