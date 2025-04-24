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
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"
          integrity="sha384-4vOjrBu7SuDWXcAw1qFznVLA/sKL+0l4nn+J1HY8w7cpa6twQEYuh4b0Cwuo7CyX"
          crossorigin="anonymous"></script>
</head>
<body>
  <redoc spec-url="api.php?spec=1"></redoc>
  <div id="redoc-container"></div>
  <script>
    if (!customElements.get('redoc')) {
      Redoc.init('api.php?spec=1', {}, document.getElementById('redoc-container'));
    }
  </script>
</body>
</html>