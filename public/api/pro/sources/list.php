<?php

// public/api/pro/sources/list.php
declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProSourcesApiService.php';

try {
    fr_pro_guard_method('GET');
    fr_pro_guard_auth(true, false);
    fr_pro_emit_result(\FileRise\Domain\ProSourcesApiService::listSources());
} catch (Throwable $e) {
    fr_pro_json(500, ['ok' => false, 'error' => 'Error loading sources']);
}
