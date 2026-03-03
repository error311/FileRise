<?php

// public/api/pro/sources/delete.php
declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProSourcesApiService.php';

try {
    fr_pro_guard_method('POST');
    fr_pro_guard_auth(true, true);
    fr_pro_emit_result(\FileRise\Domain\ProSourcesApiService::deleteSource(fr_pro_read_json()));
} catch (Throwable $e) {
    fr_pro_json(500, ['ok' => false, 'error' => 'Error deleting source']);
}
