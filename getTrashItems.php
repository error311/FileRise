<?php
require_once 'config.php';
header('Content-Type: application/json');

// Ensure user is authenticated.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// Define the trash directory and trash metadata file.
$trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
$trashMetadataFile = $trashDir . "trash.json";

// Helper: Generate the metadata file path for a given folder.
// For "root", returns "root_metadata.json". Otherwise, replaces slashes, backslashes, and spaces with dashes and appends "_metadata.json".
function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

// Read the trash metadata.
$trashItems = [];
if (file_exists($trashMetadataFile)) {
    $json = file_get_contents($trashMetadataFile);
    $trashItems = json_decode($json, true);
    if (!is_array($trashItems)) {
        $trashItems = [];
    }
}

// Enrich each trash record.
foreach ($trashItems as &$item) {
    // Ensure deletedBy is set and not empty.
    if (empty($item['deletedBy'])) {
        $item['deletedBy'] = "Unknown";
    }
    // Enrich with uploader and uploaded date if not already present.
    if (empty($item['uploaded']) || empty($item['uploader'])) {
        if (isset($item['originalFolder']) && isset($item['originalName'])) {
            $metadataFile = getMetadataFilePath($item['originalFolder']);
            if (file_exists($metadataFile)) {
                $metadata = json_decode(file_get_contents($metadataFile), true);
                if (is_array($metadata) && isset($metadata[$item['originalName']])) {
                    $item['uploaded'] = !empty($metadata[$item['originalName']]['uploaded']) ? $metadata[$item['originalName']]['uploaded'] : "Unknown";
                    $item['uploader'] = !empty($metadata[$item['originalName']]['uploader']) ? $metadata[$item['originalName']]['uploader'] : "Unknown";
                } else {
                    $item['uploaded'] = "Unknown";
                    $item['uploader'] = "Unknown";
                }
            } else {
                $item['uploaded'] = "Unknown";
                $item['uploader'] = "Unknown";
            }
        } else {
            $item['uploaded'] = "Unknown";
            $item['uploader'] = "Unknown";
        }
    }
}
unset($item);

echo json_encode($trashItems);
exit;
?>