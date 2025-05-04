<?php
// public/api/getUsers.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/UserController.php';

$userController = new UserController();
$userController->getUsers(); // This will output the JSON response