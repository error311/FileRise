<?php
// public/api.php
require_once __DIR__ . '/../config/config.php'; 

if (empty($_SESSION['authenticated'])) {
  header('Location: /index.html?redirect=/api.php');
  exit;
}

if (isset($_GET['spec'])) {
  header('Content-Type: application/json');
  readfile(__DIR__ . '/../openapi.json.dist');
  exit;
}

?><!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>FileRise API Docs</title>

  <!-- Local ReDoc bundle -->
  <script defer src="/vendor/redoc/redoc.standalone.js?v=dev"></script>

  <!-- Your init (also local) -->
  <script defer src="/js/redoc-init.js?v=dev"></script>
</head>
<body>
  <redoc spec-url="/api.php?spec=1"></redoc>
  <div id="redoc-container"></div>
</body>
</html>