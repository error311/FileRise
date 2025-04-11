<?php
require_once 'config.php';
header('Content-Type: application/json');

// --- CSRF Protection for Uploads ---
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$receivedToken = isset($headers['x-csrf-token']) ? trim($headers['x-csrf-token']) : '';

if ($receivedToken !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token"]);
    http_response_code(403);
    exit;
}

// Ensure user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

$username = $_SESSION['username'] ?? '';
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['disableUpload']) && $userPermissions['disableUpload'] === true) {
        http_response_code(403);  // Return a 403 Forbidden status.
        echo json_encode(["error" => "Disabled upload users are not allowed to upload."]);
        exit;
    }
}

/*
 * Handle test chunk requests.
 * When testChunks is enabled in Resumable.js, the client sends GET requests with a "resumableTest" parameter.
 */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['resumableTest'])) {
    $chunkNumber = intval($_GET['resumableChunkNumber']);
    $resumableIdentifier = $_GET['resumableIdentifier'];
    $folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';
    // Determine the base upload directory.
    $baseUploadDir = UPLOAD_DIR;
    if ($folder !== 'root') {
        $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
    }
    $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
    $chunkFile = $tempDir . $chunkNumber;
    if (file_exists($chunkFile)) {
        http_response_code(200);
    } else {
        http_response_code(404);
    }
    exit;
}

// ---------------------
// Chunked upload handling (POST requests)
// ---------------------
if (isset($_POST['resumableChunkNumber'])) {
    // ------------- Chunked Upload Handling -------------
    $chunkNumber         = intval($_POST['resumableChunkNumber']); // current chunk (1-indexed)
    $totalChunks         = intval($_POST['resumableTotalChunks']);
    $chunkSize           = intval($_POST['resumableChunkSize']);
    $totalSize           = intval($_POST['resumableTotalSize']);
    $resumableIdentifier = $_POST['resumableIdentifier'];           // unique file identifier
    $resumableFilename   = $_POST['resumableFilename'];
    

// First, strip directory components.
$resumableFilename = urldecode(basename($_POST['resumableFilename']));
if (!preg_match(REGEX_FILE_NAME, $resumableFilename)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid file name: " . $resumableFilename]);
    exit;
}
    
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';
    if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        echo json_encode(["error" => "Invalid folder name"]);
        exit;
    }
    // Determine the base upload directory.
    $baseUploadDir = UPLOAD_DIR;
    if ($folder !== 'root') {
        $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
        if (!is_dir($baseUploadDir)) {
            mkdir($baseUploadDir, 0775, true);
        }
    } else {
        if (!is_dir($baseUploadDir)) {
            mkdir($baseUploadDir, 0775, true);
        }
    }
    
    // Use a temporary directory for the chunks.
    $tempDir = $baseUploadDir . 'resumable_' . $resumableIdentifier . DIRECTORY_SEPARATOR;
    if (!is_dir($tempDir)) {
        mkdir($tempDir, 0775, true);
    }
    
    // Save the current chunk.
    $chunkFile = $tempDir . $chunkNumber; // store chunk using its number as filename
    if (!move_uploaded_file($_FILES["file"]["tmp_name"], $chunkFile)) {
        echo json_encode(["error" => "Failed to move uploaded chunk"]);
        exit;
    }
    
    // Check if all chunks have been uploaded.
    $uploadedChunks = glob($tempDir . "*");
    if (count($uploadedChunks) < $totalChunks) {
        // More chunks remain – respond and let the client continue.
        echo json_encode(["status" => "chunk uploaded"]);
        exit;
    }
    
    // All chunks are present. Merge chunks.
    $targetPath = $baseUploadDir . $resumableFilename;
    if (!$out = fopen($targetPath, "wb")) {
        echo json_encode(["error" => "Failed to open target file for writing"]);
        exit;
    }
    // Concatenate each chunk in order.
    for ($i = 1; $i <= $totalChunks; $i++) {
        $chunkPath = $tempDir . $i;
        if (!$in = fopen($chunkPath, "rb")) {
            fclose($out);
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
    // For chunked uploads, assume no relativePath; so folderPath is simply $folder.
    $folderPath = $folder;
    $metadataKey = ($folderPath === '' || $folderPath === 'root') ? "root" : $folderPath;
    // Generate a metadata file name based on the folder path.
    $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
    $metadataFile = META_DIR . $metadataFileName;
    
    $uploadedDate = date(DATE_TIME_FORMAT);
    $uploader = $_SESSION['username'] ?? "Unknown";
    
    // Load existing metadata, if any.
    if (file_exists($metadataFile)) {
        $metadataCollection = json_decode(file_get_contents($metadataFile), true);
        if (!is_array($metadataCollection)) {
            $metadataCollection = [];
        }
    } else {
        $metadataCollection = [];
    }
    
    // Add metadata for this file if not already present.
    if (!isset($metadataCollection[$resumableFilename])) {
        $metadataCollection[$resumableFilename] = [
            "uploaded" => $uploadedDate,
            "uploader" => $uploader
        ];
        file_put_contents($metadataFile, json_encode($metadataCollection, JSON_PRETTY_PRINT));
    }
    // --- End Metadata Update ---
    
    // Cleanup: remove the temporary directory and its chunks.
    array_map('unlink', glob("$tempDir*"));
    rmdir($tempDir);
    
    echo json_encode(["success" => "File uploaded successfully"]);
    exit;
    
} else {
    // ------------- Full Upload (Non-chunked) -------------
    // Validate folder name input.
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : 'root';
    if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
        echo json_encode(["error" => "Invalid folder name"]);
        exit;
    }
    
    // Determine the base upload directory.
    $baseUploadDir = UPLOAD_DIR;
    if ($folder !== 'root') {
        $baseUploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR;
        if (!is_dir($baseUploadDir)) {
            mkdir($baseUploadDir, 0775, true);
        }
    } else {
        if (!is_dir($baseUploadDir)) {
            mkdir($baseUploadDir, 0775, true);
        }
    }
    
    // Prepare a collection to hold metadata for each folder.
    $metadataCollection = []; // key: folder path, value: metadata array
    $metadataChanged = [];    // key: folder path, value: boolean
    
    // Use a Unicode-enabled pattern to allow special characters.
    $safeFileNamePattern = REGEX_FILE_NAME
    
    foreach ($_FILES["file"]["name"] as $index => $fileName) {
        // First, ensure we only work with the base filename to avoid traversal issues.
        $safeFileName = trim(urldecode(basename($fileName)));
        if (!preg_match($safeFileNamePattern, $safeFileName)) {
            echo json_encode(["error" => "Invalid file name: " . $fileName]);
            exit;
        }
        
        // --- Minimal Folder/Subfolder Logic ---
        $relativePath = '';
        if (isset($_POST['relativePath'])) {
            if (is_array($_POST['relativePath'])) {
                $relativePath = $_POST['relativePath'][$index] ?? '';
            } else {
                $relativePath = $_POST['relativePath'];
            }
        }
        
        // Determine the complete folder path for upload and for metadata.
        $folderPath = $folder; // Base folder as provided ("root" or a subfolder)
        $uploadDir = $baseUploadDir; // Start with the base upload directory
        if (!empty($relativePath)) {
            $subDir = dirname($relativePath);
            if ($subDir !== '.' && $subDir !== '') {
                $folderPath = ($folder === 'root') ? $subDir : $folder . "/" . $subDir;
                $uploadDir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR 
                            . str_replace('/', DIRECTORY_SEPARATOR, $folderPath) . DIRECTORY_SEPARATOR;
            }
            // Reapply basename to the relativePath to get the final safe file name.
            $safeFileName = basename($relativePath);
        }
        // --- End Minimal Folder/Subfolder Logic ---
        
        // Make sure the final upload directory exists.
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }
        
        $targetPath = $uploadDir . $safeFileName;
        
        if (move_uploaded_file($_FILES["file"]["tmp_name"][$index], $targetPath)) {
            // Generate a unique metadata file name based on the folder path.
            $metadataKey = ($folderPath === '' || $folderPath === 'root') ? "root" : $folderPath;
            $metadataFileName = str_replace(['/', '\\', ' '], '-', $metadataKey) . '_metadata.json';
            $metadataFile = META_DIR . $metadataFileName;
            
            if (!isset($metadataCollection[$metadataKey])) {
                if (file_exists($metadataFile)) {
                    $metadataCollection[$metadataKey] = json_decode(file_get_contents($metadataFile), true);
                } else {
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
            echo json_encode(["error" => "Error uploading file"]);
            exit;
        }
    }
    
    // After processing all files, write out metadata files for folders that changed.
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