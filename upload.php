<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection for Uploads ---
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    http_response_code(403);
    echo json_encode(["error" => "Invalid CSRF token"]);
    exit;
}

// Ensure user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$username = $_SESSION['username'] ?? '';
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (!empty($userPermissions['disableUpload'])) {
        http_response_code(403);
        echo json_encode(["error" => "Upload disabled for this user."]);
        exit;
    }
}

/*
 * Handle test chunk requests.
 */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['resumableTest'])) {
    $chunkNumber = intval($_GET['resumableChunkNumber']);
    $resumableIdentifier = $_GET['resumableIdentifier'] ?? '';
    $folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';
    $baseUploadDir = UPLOAD_DIR;
    if ($folder !== 'root') {
        $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    }
    $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
    $chunkFile = $tempDir . $chunkNumber;
    echo json_encode(["status" => file_exists($chunkFile) ? "found" : "not found"]);
    http_response_code(file_exists($chunkFile) ? 200 : 404);
    exit;
}

// ---------------------
// Chunked upload handling (POST requests)
// ---------------------
if (isset($_POST['resumableChunkNumber'])) {
    $chunkNumber         = intval($_POST['resumableChunkNumber']);
    $totalChunks         = intval($_POST['resumableTotalChunks']);
    $chunkSize           = intval($_POST['resumableChunkSize']);
    $totalSize           = intval($_POST['resumableTotalSize']);
    $resumableIdentifier = $_POST['resumableIdentifier'] ?? '';
    $resumableFilename   = urldecode(basename($_POST['resumableFilename']));
    
    if (!preg_match(REGEX_FILE_NAME, $resumableFilename)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid file name: $resumableFilename"]);
        exit;
    }
    
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';
    if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid folder name"]);
        exit;
    }

    // Determine the base upload directory.
    $baseUploadDir = UPLOAD_DIR;
    if ($folder !== 'root') {
        $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    }
    if (!is_dir($baseUploadDir) && !mkdir($baseUploadDir, 0775, true)) {
        http_response_code(500);
        echo json_encode(["error" => "Failed to create upload directory"]);
        exit;
    }
    
    // Use a temporary directory for the chunks.
    $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
    if (!is_dir($tempDir) && !mkdir($tempDir, 0775, true)) {
        http_response_code(500);
        echo json_encode(["error" => "Failed to create temporary chunk directory"]);
        exit;
    }
    
    // Ensure there is no PHP upload error.
    if (!isset($_FILES["file"]) || $_FILES["file"]["error"] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(["error" => "Upload error on chunk $chunkNumber"]);
        exit;
    }
    
    // Save the current chunk.
    $chunkFile = $tempDir . $chunkNumber;
    if (!move_uploaded_file($_FILES["file"]["tmp_name"], $chunkFile)) {
        http_response_code(500);
        echo json_encode(["error" => "Failed to move uploaded chunk $chunkNumber"]);
        exit;
    }
    
    // Check if all chunks have been uploaded by verifying each expected chunk.
    $allChunksPresent = true;
    for ($i = 1; $i <= $totalChunks; $i++) {
        if (!file_exists($tempDir . $i)) {
            $allChunksPresent = false;
            break;
        }
    }
    if (!$allChunksPresent) {
        echo json_encode(["status" => "chunk uploaded"]);
        exit;
    }
    
    // All chunks are present. Merge the chunks.
    $targetPath = $baseUploadDir . $resumableFilename;
    if (!$out = fopen($targetPath, "wb")) {
        http_response_code(500);
        echo json_encode(["error" => "Failed to open target file for writing"]);
        exit;
    }
    for ($i = 1; $i <= $totalChunks; $i++) {
        $chunkPath = $tempDir . $i;
        if (!file_exists($chunkPath)) {
            fclose($out);
            http_response_code(500);
            echo json_encode(["error" => "Chunk $i missing during merge"]);
            exit;
        }
        if (!$in = fopen($chunkPath, "rb")) {
            fclose($out);
            http_response_code(500);
            echo json_encode(["error" => "Failed to open chunk $i"]);
            exit;
        }
        while ($buff = fread($in, 4096)) {
            fwrite($out, $buff);
        }
        fclose($in);
    }
    fclose($out);
    
    // --- Metadata Update for Chunked Upload ---
    $folderPath = $folder;
    $metadataKey = ($folderPath === '' || $folderPath === 'root') ? "root" : $folderPath;
    $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
    $metadataFile = META_DIR . $metadataFileName;
    $uploadedDate = date(DATE_TIME_FORMAT);
    $uploader = $_SESSION['username'] ?? "Unknown";
    
    $metadataCollection = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
    if (!is_array($metadataCollection)) {
        $metadataCollection = [];
    }
    if (!isset($metadataCollection[$resumableFilename])) {
        $metadataCollection[$resumableFilename] = [
            "uploaded" => $uploadedDate,
            "uploader" => $uploader
        ];
        file_put_contents($metadataFile, json_encode($metadataCollection, JSON_PRETTY_PRINT));
    }
    // --- End Metadata Update ---
    
    // Cleanup: use a robust recursive function.
    function rrmdir($dir) {
        if (!is_dir($dir)) return;
        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($items as $item) {
            $item->isDir() ? rmdir($item->getRealPath()) : unlink($item->getRealPath());
        }
        rmdir($dir);
    }
    rrmdir($tempDir);
    
    echo json_encode(["success" => "File uploaded successfully"]);
    exit;
} else {
    // ------------- Full Upload (Non-chunked) -------------
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';
    if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid folder name"]);
        exit;
    }
    
    $baseUploadDir = UPLOAD_DIR;
    if ($folder !== 'root') {
        $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    }
    if (!is_dir($baseUploadDir) && !mkdir($baseUploadDir, 0775, true)) {
        http_response_code(500);
        echo json_encode(["error" => "Failed to create upload directory"]);
        exit;
    }
    
    $metadataCollection = [];
    $metadataChanged = [];
    $safeFileNamePattern = REGEX_FILE_NAME;
    
    foreach ($_FILES["file"]["name"] as $index => $fileName) {
        $safeFileName = trim(urldecode(basename($fileName)));
        if (!preg_match($safeFileNamePattern, $safeFileName)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid file name: " . $fileName]);
            exit;
        }
        $relativePath = '';
        if (isset($_POST['relativePath'])) {
            $relativePath = is_array($_POST['relativePath']) ? $_POST['relativePath'][$index] ?? '' : $_POST['relativePath'];
        }
        $folderPath = $folder;
        $uploadDir = $baseUploadDir;
        if (!empty($relativePath)) {
            $subDir = dirname($relativePath);
            if ($subDir !== '.' && $subDir !== '') {
                $folderPath = ($folder === 'root') ? $subDir : $folder . "/" . $subDir;
                $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folderPath) . DIRECTORY_SEPARATOR;
            }
            $safeFileName = basename($relativePath);
        }
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true)) {
            http_response_code(500);
            echo json_encode(["error" => "Failed to create subfolder"]);
            exit;
        }
        $targetPath = $uploadDir . $safeFileName;
        if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $targetPath)) {
            $metadataKey = ($folderPath === '' || $folderPath === 'root') ? "root" : $folderPath;
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
            $metadataFile = META_DIR . $metadataFileName;
            if (!isset($metadataCollection[$metadataKey])) {
                $metadataCollection[$metadataKey] = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];
                if (!is_array($metadataCollection[$metadataKey])) {
                    $metadataCollection[$metadataKey] = [];
                }
                $metadataChanged[$metadataKey] = false;
            }
            if (!isset($metadataCollection[$metadataKey][$safeFileName])) {
                $uploadedDate = date(DATE_TIME_FORMAT);
                $uploader = $_SESSION['username'] ?? "Unknown";
                $metadataCollection[$metadataKey][$safeFileName] = [
                    "uploaded" => $uploadedDate,
                    "uploader" => $uploader
                ];
                $metadataChanged[$metadataKey] = true;
            }
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Error uploading file"]);
            exit;
        }
    }
    
    foreach ($metadataCollection as $folderKey => $data) {
        if ($metadataChanged[$folderKey]) {
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $folderKey) . '_metadata.json';
            $metadataFile = META_DIR . $metadataFileName;
            file_put_contents($metadataFile, json_encode($data, JSON_PRETTY_PRINT));
        }
    }
    
    echo json_encode(["success" => "Files uploaded successfully"]);
}
?>