<?php
// uploadToSharedFolder.php

require_once 'config.php';

// Only accept POST requests.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed."]);
    exit;
}

// Ensure the share token is provided.
if (empty($_POST['token'])) {
    http_response_code(400);
    echo json_encode(["error" => "Missing share token."]);
    exit;
}

$token = trim($_POST['token']);

// Load the share folder records.
$shareFile = META_DIR . "share_folder_links.json";
if (!file_exists($shareFile)) {
    http_response_code(404);
    echo json_encode(["error" => "Share record not found."]);
    exit;
}

$shareLinks = json_decode(file_get_contents($shareFile), true);
if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
    http_response_code(404);
    echo json_encode(["error" => "Invalid share token."]);
    exit;
}

$record = $shareLinks[$token];

// Check if the share link is expired.
if (time() > $record['expires']) {
    http_response_code(403);
    echo json_encode(["error" => "This share link has expired."]);
    exit;
}

// Ensure that uploads are allowed for this share.
if (empty($record['allowUpload']) || $record['allowUpload'] != 1) {
    http_response_code(403);
    echo json_encode(["error" => "File uploads are not allowed for this share."]);
    exit;
}

// Check that a file was uploaded.
if (!isset($_FILES['fileToUpload'])) {
    http_response_code(400);
    echo json_encode(["error" => "No file was uploaded."]);
    exit;
}

$fileUpload = $_FILES['fileToUpload'];

// Check for upload errors.
if ($fileUpload['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(["error" => "File upload error. Code: " . $fileUpload['error']]);
    exit;
}

// Enforce a maximum file size (e.g. 50MB).
$maxSize = 50 * 1024 * 1024; // 50MB
if ($fileUpload['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(["error" => "File size exceeds allowed limit."]);
    exit;
}

// Define allowed file extensions.
$allowedExtensions = ['jpg','jpeg','png','gif','pdf','doc','docx','txt','xls','xlsx','ppt','pptx','mp4','webm','mp3'];
$uploadedName = basename($fileUpload['name']);
$ext = strtolower(pathinfo($uploadedName, PATHINFO_EXTENSION));
if (!in_array($ext, $allowedExtensions)) {
    http_response_code(400);
    echo json_encode(["error" => "File type not allowed."]);
    exit;
}

// Determine the target folder from the share record.
$folder = trim($record['folder'], "/\\");
$targetFolder = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
$realTargetFolder = realpath($targetFolder);
$uploadDirReal = realpath(UPLOAD_DIR);

if ($realTargetFolder === false || strpos($realTargetFolder, $uploadDirReal) !== 0 || !is_dir($realTargetFolder)) {
    http_response_code(404);
    echo json_encode(["error" => "Shared folder not found."]);
    exit;
}

// Generate a new filename to avoid collisions.
// A unique prefix (using uniqid) is prepended to help with uniqueness and traceability.
$newFilename = uniqid() . "_" . preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $uploadedName);
$targetPath = $realTargetFolder . DIRECTORY_SEPARATOR . $newFilename;

// Move the uploaded file securely.
if (!move_uploaded_file($fileUpload['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(["error" => "Failed to move the uploaded file."]);
    exit;
}

// --- Metadata Update for Shared Upload ---
$metadataKey = ($folder === '' || $folder === 'root') ? "root" : $folder;
// Sanitize the metadata file name.
$metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
$metadataFile = META_DIR . $metadataFileName;

// Load existing metadata if available.
$metadataCollection = [];
if (file_exists($metadataFile)) {
    $data = file_get_contents($metadataFile);
    $metadataCollection = json_decode($data, true);
    if (!is_array($metadataCollection)) {
        $metadataCollection = [];
    }
}

// Set upload date using your defined format.
$uploadedDate = date(DATE_TIME_FORMAT);

// Since there is no logged-in user for public share uploads,
$uploader = "Outside Share";

// Update metadata for the new file.
if (!isset($metadataCollection[$newFilename])) {
    $metadataCollection[$newFilename] = [
        "uploaded" => $uploadedDate,
        "uploader" => $uploader
    ];
}

// Save the metadata.
file_put_contents($metadataFile, json_encode($metadataCollection, JSON_PRETTY_PRINT));
// --- End Metadata Update ---

// Optionally, set a flash message in session.
$_SESSION['upload_message'] = "File uploaded successfully.";

// Redirect back to the shared folder view, refreshing the file listing.
header("Location: shareFolder.php?token=" . urlencode($token));
exit;
?>