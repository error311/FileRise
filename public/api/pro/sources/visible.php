<?php

// public/api/pro/sources/visible.php
declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProSourcesApiService.php';

try {
    fr_pro_guard_auth(false, false);

    $ctx = fr_pro_current_user_context();
    fr_pro_emit_result(
        \FileRise\Domain\ProSourcesApiService::visibleSources(
            $ctx['username'],
            $ctx['permissions']
        )
    );
} catch (Throwable $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 599) {
        $status = 500;
    }

    fr_pro_json($status, [
        'ok' => false,
        'error' => 'Error loading sources',
    ]);
}
