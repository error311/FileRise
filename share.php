<?php
// share.php
require_once 'config.php';

// Get token and password (if provided)
$token = isset($_GET['token']) ? $_GET['token'] : '';
$providedPass = isset($_GET['pass']) ? $_GET['pass'] : '';

if (empty($token)) {
    http_response_code(400);
    echo json_encode(["error" => "Missing token."]);
    exit;
}

// Load share links.
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

// If a password is required and none is provided, show a simple form.
if (!empty($record['password']) && empty($providedPass)) {
    ?>
    <!DOCTYPE html>
    <html>
    <head>
        <title>Enter Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>This file is protected by a password.</h2>
        <form method="get" action="share.php">
            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token); ?>">
            <label for="pass">Password:</label>
            <input type="password" name="pass" id="pass" required>
            <button type="submit">Submit</button>
        </form>
    </body>
    </html>
    <?php
    exit;
}

// If a password was set, validate it.
if (!empty($record['password'])) {
    if (!password_verify($providedPass, $record['password'])) {
        http_response_code(403);
        echo json_encode(["error" => "Invalid password."]);
        exit;
    }
}

// Build file path.
$folder = trim($record['folder'], "/\\ ");
$file = $record['file'];
$filePath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
if (!empty($folder) && strtolower($folder) !== 'root') {
    $filePath .= $folder . DIRECTORY_SEPARATOR;
}
$filePath .= $file;

if (!file_exists($filePath)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found."]);
    exit;
}

// Serve the file.
$mimeType = mime_content_type($filePath);
header("Content-Type: " . $mimeType);

// Determine extension and set disposition accordingly.
$ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
if (in_array($ext, ['jpg','jpeg','png','gif','bmp','webp','svg','ico'])) {
    header('Content-Disposition: inline; filename="' . basename($filePath) . '"');
} else {
    header('Content-Disposition: attachment; filename="' . basename($filePath) . '"');
}

readfile($filePath);
exit;
?>