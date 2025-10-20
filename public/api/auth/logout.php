<?php
// public/api/auth/logout.php

    /**
     * @OA\Post(
     *     path="/api/auth/logout.php",
     *     summary="Logout user",
     *     description="Clears the session, removes persistent login tokens, and redirects the user to the login page.",
     *     operationId="logoutUser",
     *     tags={"Auth"},
     *     @OA\Response(
     *         response=302,
     *         description="Redirects to the login page with a logout flag."
     *     ),
     *     @OA\Response(
     *         response=401,
     *         description="Unauthorized"
     *     )
     * )
     *
     * Logs the user out by clearing session data, removing persistent tokens, and destroying the session.
     *
     * @return void Redirects to index.html with a logout flag.
     */

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/controllers/AuthController.php';

$authController = new AuthController();
$authController->logout();