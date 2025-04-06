<?php
// share.php

require_once 'config.php';

// Retrieve and sanitize input
$token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
$providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);

if (empty($token)) {
    http_response_code(400);
    echo json_encode(["error" => "Missing token."]);
    exit;
}

// Load share links from file
$shareFile = META_DIR . "share_links.json";
if (!file_exists($shareFile)) {
    http_response_code(404);
    echo json_encode(["error" => "Share link not found."]);
    exit;
}

$shareLinks = json_decode(file_get_contents($shareFile), true);
if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
    http_response_code(404);
    echo json_encode(["error" => "Share link not found."]);
    exit;
}

$record = $shareLinks[$token];

// Check expiration.
if (time() > $record['expires']) {
    http_response_code(403);
    echo json_encode(["error" => "This link has expired."]);
    exit;
}

// If a password is required and none is provided, show a password form.
if (!empty($record['password']) && empty($providedPass)) {
    ?>
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Enter Password</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 20px;
                background-color: #f4f4f4;
                color: #333;
            }
            form {
                max-width: 400px;
                margin: 40px auto;
                background: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            input[type="password"] {
                width: 100%;
                padding: 10px;
                margin: 10px 0;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            button {
                padding: 10px 20px;
                background: #007BFF;
                border: none;
                border-radius: 4px;
                color: #fff;
                cursor: pointer;
            }
            button:hover {
                background: #0056b3;
            }
        </style>
    </head>
    <body>
        <h2>This file is protected by a password.</h2>
        <form method="get" action="share.php">
            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
            <label for="pass">Password:</label>
            <input type="password" name="pass" id="pass" required>
            <button type="submit">Submit</button>
        </form>
    </body>
    </html>
    <?php
    exit;
}

// Validate provided password if set.
if (!empty($record['password'])) {
    if (!password_verify($providedPass, $record['password'])) {
        http_response_code(403);
        echo json_encode(["error" => "Invalid password."]);
        exit;
    }
}

// Build file path securely.
$folder = trim($record['folder'], "/\\ ");
$file = $record['file'];
$filePath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
if (!empty($folder) && strtolower($folder) !== 'root') {
    $filePath .= $folder . DIRECTORY_SEPARATOR;
}
$filePath .= $file;

// Resolve the real path and ensure it's within the allowed directory.
$realFilePath = realpath($filePath);
$uploadDirReal = realpath(UPLOAD_DIR);
if ($realFilePath === false || strpos($realFilePath, $uploadDirReal) !== 0) {
    http_response_code(404);
    echo json_encode(["error" => "File not found."]);
    exit;
}

if (!file_exists($realFilePath)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found."]);
    exit;
}

// Serve the file.
$mimeType = mime_content_type($realFilePath);
header("Content-Type: " . $mimeType);

// Set Content-Disposition based on file type.
$ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
    header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
} else {
    header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
}

// Optionally disable caching for sensitive files.
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");

readfile($realFilePath);
exit;
?>