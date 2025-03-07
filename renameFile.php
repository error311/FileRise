<?php
require_once 'config.php';
header('Content-Type: application/json');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// Ensure user is authenticated
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data['folder']) || !isset($data['oldName']) || !isset($data['newName'])) {
    echo json_encode(["error" => "Invalid input"]);
    exit;
}

$folder = trim($data['folder']) ?: 'root';
$oldName = basename(trim($data['oldName']));
$newName = basename(trim($data['newName']));

if ($folder !== 'root') {
    $directory = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
} else {
    $directory = UPLOAD_DIR;
}

$oldPath = $directory . $oldName;
$newPath = $directory . $newName;

if (!file_exists($oldPath)) {
    echo json_encode(["error" => "File does not exist"]);
    exit;
}

if (file_exists($newPath)) {
    echo json_encode(["error" => "A file with the new name already exists"]);
    exit;
}

$metadataFile = META_DIR . META_FILE;

if (rename($oldPath, $newPath)) {
    // Update metadata.
    if (file_exists($metadataFile)) {
        $metadata = json_decode(file_get_contents($metadataFile), true);
        // Build the keys.
        $oldKey = ($folder !== 'root') ? $folder . "/" . $oldName : $oldName;
        $newKey = ($folder !== 'root') ? $folder . "/" . $newName : $newName;
        if (isset($metadata[$oldKey])) {
            $metadata[$newKey] = $metadata[$oldKey];
            unset($metadata[$oldKey]);
            file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT));
        }
    }
    echo json_encode(["success" => "File renamed successfully"]);
} else {
    echo json_encode(["error" => "Error renaming file"]);
}
?>
