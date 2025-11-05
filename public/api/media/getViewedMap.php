<?php
// public/api/media/getViewedMap.php
require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/MediaController.php';

$ctl = new MediaController();
$ctl->getViewedMap();