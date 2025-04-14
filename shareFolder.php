<?php
// shareFolder.php

require_once 'config.php';

// Retrieve token and optional password from GET.
$token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
$providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);
$page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
if ($page === false || $page < 1) {
    $page = 1;
}

if (empty($token)) {
    http_response_code(400);
    echo json_encode(["error" => "Missing token."]);
    exit;
}

// Load share folder records securely.
$shareFile = META_DIR . "share_folder_links.json";
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

// If password protection is enabled and no password is provided, show password form.
if (!empty($record['password']) && empty($providedPass)) {
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Enter Password</title>
        <style>
            body {
                background-color: #f7f7f7;
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 400px;
                margin: 80px auto;
                background: #fff;
                padding: 20px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            h2 {
                margin-top: 0;
                font-size: 1.5rem;
                text-align: center;
                color: #333;
            }
            label, input, button {
                display: block;
                width: 100%;
            }
            input[type="password"] {
                padding: 10px;
                margin: 10px 0;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            button {
                background-color: #007BFF;
                border: none;
                color: #fff;
                padding: 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 1rem;
            }
            button:hover {
                background-color: #0056b3;
            }
        </style>
    </head>
    <body>
    <div class="container">
        <h2>Folder Protected</h2>
        <p>This folder is protected by a password.</p>
        <form method="get" action="shareFolder.php">
            <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
            <label for="pass">Password:</label>
            <input type="password" name="pass" id="pass" required>
            <button type="submit">Submit</button>
        </form>
    </div>
    </body>
    </html>
    <?php
    exit;
}

// Validate the provided password if required.
if (!empty($record['password'])) {
    if (!password_verify($providedPass, $record['password'])) {
        http_response_code(403);
        echo json_encode(["error" => "Invalid password."]);
        exit;
    }
}

// Determine the folder path.
$folder = trim($record['folder'], "/\\ ");
$folderPath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $folder;
$realFolderPath = realpath($folderPath);
$uploadDirReal = realpath(UPLOAD_DIR);

// Validate that the folder exists and is within UPLOAD_DIR.
if ($realFolderPath === false || strpos($realFolderPath, $uploadDirReal) !== 0 || !is_dir($realFolderPath)) {
    http_response_code(404);
    echo json_encode(["error" => "Folder not found."]);
    exit;
}

// Scan and sort files.
$allFiles = array_values(array_filter(scandir($realFolderPath), function($item) use ($realFolderPath) {
    return is_file($realFolderPath . DIRECTORY_SEPARATOR . $item);
}));
sort($allFiles);

// Pagination variables — limits the number of files (and thus images) per page.
$itemsPerPage = 10;
$totalFiles = count($allFiles);
$totalPages = max(1, ceil($totalFiles / $itemsPerPage));
$currentPage = min($page, $totalPages);
$startIndex = ($currentPage - 1) * $itemsPerPage;
$filesOnPage = array_slice($allFiles, $startIndex, $itemsPerPage);

/**
 * Convert file size in bytes into a human-readable string.
 *
 * @param int $bytes The file size in bytes.
 * @return string The formatted size string.
 */
function formatBytes($bytes) {
    if ($bytes < 1024) {
        return $bytes . " B";
    } elseif ($bytes < 1024 * 1024) {
        return round($bytes / 1024, 2) . " KB";
    } elseif ($bytes < 1024 * 1024 * 1024) {
        return round($bytes / (1024 * 1024), 2) . " MB";
    } else {
        return round($bytes / (1024 * 1024 * 1024), 2) . " GB";
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Shared Folder: <?php echo htmlspecialchars($folder, ENT_QUOTES, 'UTF-8'); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            background: #f2f2f2;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0;
            font-size: 2rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
            border-radius: 4px;
            padding: 20px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }
        /* Toggle button */
        .toggle-btn {
            margin-bottom: 20px;
            padding: 8px 16px;
            background: #007BFF;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .toggle-btn:hover {
            background: #0056b3;
        }
        /* List view table styles */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
            text-align: left;
        }
        th {
            background: #007BFF;
            color: #fff;
            font-weight: normal;
        }
        tr:hover {
            background: #f9f9f9;
        }
        a {
            color: #007BFF;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .download-icon {
            margin-left: 8px;
            font-weight: bold;
            color: #007BFF;
        }
        /* Pagination styles - placed outside the view containers. */
        .pagination {
            text-align: center;
            margin-top: 20px;
        }
        .pagination a, .pagination span {
            margin: 0 5px;
            padding: 8px 12px;
            text-decoration: none;
            background: #007BFF;
            color: #fff;
            border-radius: 4px;
        }
        .pagination span.current {
            background: #0056b3;
        }
        /* Gallery view styles */
        .shared-gallery-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
            padding: 10px 0;
        }
        .shared-gallery-card {
            border: 1px solid #ccc;
            padding: 5px;
            text-align: center;
        }
        .shared-gallery-card img {
            max-width: 100%;
            display: block;
            margin: 0 auto;
        }
        /* Upload container */
        .upload-container {
            margin-top: 30px;
            text-align: center;
        }
        .upload-container h3 {
            font-size: 1.4rem;
            margin-bottom: 10px;
        }
        .upload-container form {
            display: inline-block;
            margin-top: 10px;
        }
        .upload-container button {
            background-color: #28a745;
            border: none;
            color: #fff;
            padding: 10px 20px;
            font-size: 1rem;
            border-radius: 4px;
            cursor: pointer;
        }
        .upload-container button:hover {
            background-color: #218838;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 0.9rem;
            color: #777;
        }
    </style>
</head>
<body>
<div class="header">
    <h1>Shared Folder: <?php echo htmlspecialchars($folder, ENT_QUOTES, 'UTF-8'); ?></h1>
</div>
<div class="container">
    <!-- Toggle Button -->
    <button id="toggleBtn" class="toggle-btn" onclick="toggleViewMode()">Switch to Gallery View</button>
    
    <!-- View Containers -->
    <div id="listViewContainer">
        <?php if (empty($filesOnPage)): ?>
            <p style="text-align:center;">This folder is empty.</p>
        <?php else: ?>
            <table>
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($filesOnPage as $file):
                        $filePath = $realFolderPath . DIRECTORY_SEPARATOR . $file;
                        $fileSize = formatBytes(filesize($filePath));
                        // Build download link using share token and file name.
                        $downloadLink = "downloadSharedFile.php?token=" . urlencode($token) . "&file=" . urlencode($file);
                    ?>
                    <tr>
                        <td>
                            <a href="<?php echo htmlspecialchars($downloadLink, ENT_QUOTES, 'UTF-8'); ?>">
                                <?php echo htmlspecialchars($file, ENT_QUOTES, 'UTF-8'); ?>
                                <span class="download-icon">&#x21E9;</span>
                            </a>
                        </td>
                        <td><?php echo $fileSize; ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
    
    <!-- Gallery View Container (hidden by default) -->
    <div id="galleryViewContainer" style="display:none;"></div>
    
    <!-- Pagination Controls (always visible) -->
    <div class="pagination">
        <?php if ($currentPage > 1): ?>
            <a href="shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage - 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Prev</a>
        <?php else: ?>
            <span>Prev</span>
        <?php endif; ?>

        <?php
        $startPage = max(1, $currentPage - 2);
        $endPage = min($totalPages, $currentPage + 2);
        for ($i = $startPage; $i <= $endPage; $i++): ?>
            <?php if ($i == $currentPage): ?>
                <span class="current"><?php echo $i; ?></span>
            <?php else: ?>
                <a href="shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $i; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>"><?php echo $i; ?></a>
            <?php endif; ?>
        <?php endfor; ?>

        <?php if ($currentPage < $totalPages): ?>
            <a href="shareFolder.php?token=<?php echo urlencode($token); ?>&page=<?php echo $currentPage + 1; ?><?php echo !empty($providedPass) ? "&pass=" . urlencode($providedPass) : ""; ?>">Next</a>
        <?php else: ?>
            <span>Next</span>
        <?php endif; ?>
    </div>
    
    <?php if ($record['allowUpload']) : ?>
        <div class="upload-container">
            <h3>Upload File (50mb max size)</h3>
            <form action="uploadToSharedFolder.php" method="post" enctype="multipart/form-data">
                <!-- Passing token so the upload endpoint can verify the share link. -->
                <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="file" name="fileToUpload" required>
                <br><br>
                <button type="submit">Upload</button>
            </form>
        </div>
    <?php endif; ?>
</div>
<div class="footer">
    &copy; <?php echo date("Y"); ?> FileRise. All rights reserved.
</div>

<script>
// Global variables
var viewMode = 'list';
window.imageCache = window.imageCache || {};

// File data for the gallery view (current page file names)
// Since the server-side pagination limits the files per page, gallery view shows the same files.
var filesData = <?php echo json_encode($filesOnPage); ?>;
// Define the relative URL for this shared folder's files.
var filesUrlBase = "uploads/<?php echo htmlspecialchars($folder, ENT_QUOTES, 'UTF-8'); ?>";

// Helper function to cache image URLs.
function cacheImage(imgElem, key) {
    window.imageCache[key] = imgElem.src;
}

// Render gallery view using filesData.
function renderGalleryView() {
    var galleryContainer = document.getElementById("galleryViewContainer");
    var html = '<div class="shared-gallery-container">';
    filesData.forEach(function(file) {
        var fileUrl = filesUrlBase + "/" + encodeURIComponent(file);
        var ext = file.split('.').pop().toLowerCase();
        var thumbnail = "";
        if (['jpg','jpeg','png','gif','bmp','webp','svg','ico'].indexOf(ext) >= 0) {
            var cacheKey = fileUrl;
            if (window.imageCache[cacheKey]) {
                thumbnail = '<img src="'+window.imageCache[cacheKey]+'" alt="'+file+'">';
            } else {
                var imageUrl = fileUrl + '?t=' + new Date().getTime();
                thumbnail = '<img src="'+imageUrl+'" onload="cacheImage(this, \''+cacheKey+'\')" alt="'+file+'">';
            }
        } else {
            thumbnail = '<span class="material-icons">insert_drive_file</span>';
        }
        html += '<div class="shared-gallery-card">';
        html += '<div class="gallery-preview" onclick="window.location.href=\''+fileUrl+'\'" style="cursor:pointer;">'+ thumbnail +'</div>';
        html += '<div class="gallery-info"><span class="gallery-file-name">'+file+'</span></div>';
        html += '</div>';
    });
    html += '</div>';
    galleryContainer.innerHTML = html;
}

// Toggle between list and gallery views.
function toggleViewMode() {
    if (viewMode === 'list') {
        viewMode = 'gallery';
        document.getElementById("listViewContainer").style.display = "none";
        renderGalleryView();
        document.getElementById("galleryViewContainer").style.display = "block";
        document.getElementById("toggleBtn").textContent = "Switch to List View";
    } else {
        viewMode = 'list';
        document.getElementById("galleryViewContainer").style.display = "none";
        document.getElementById("listViewContainer").style.display = "block";
        document.getElementById("toggleBtn").textContent = "Switch to Gallery View";
    }
}
</script>
</body>
</html>