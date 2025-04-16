<?php
// public/api/updateUserPanel.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/userController.php';

$userController = new UserController();
$userController->updateUserPanel();