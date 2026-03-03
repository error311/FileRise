<?php

// public/api/pro/sources/test.php
declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProSourcesApiService.php';

try {
    fr_pro_guard_method('POST');
    fr_pro_guard_auth(true, true);
    fr_pro_emit_result(\FileRise\Domain\ProSourcesApiService::testSource(fr_pro_read_json()));
} catch (RuntimeException $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 599) {
        $status = 500;
    }

    fr_pro_json($status, ['ok' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    fr_pro_json(500, ['ok' => false, 'error' => 'Error testing source']);
}
