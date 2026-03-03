<?php

// public/api/pro/portals/listEntries.php
/**
 * List portal entries (folders + files) with pagination.
 */

declare(strict_types=1);

require_once __DIR__ . '/../_common.php';
require_once PROJECT_ROOT . '/src/FileRise/Domain/ProPortalsApiService.php';

try {
    fr_pro_guard_method('GET');
    fr_pro_guard_auth(false, false);
    fr_pro_emit_result(\FileRise\Domain\ProPortalsApiService::listEntries($_GET));
} catch (Throwable $e) {
    fr_pro_json(500, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
