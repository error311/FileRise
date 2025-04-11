<?php
require_once 'config.php';
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");
header('Content-Type: application/json');

// Check authentication.
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    echo json_encode(["error" => "Unauthorized"]);
    http_response_code(401);
    exit;
}

// CSRF Protection: validate token from header.
$headers = getallheaders();
if (!isset($headers['X-CSRF-Token']) || $headers['X-CSRF-Token'] !== $_SESSION['csrf_token']) {
    echo json_encode(["error" => "Invalid CSRF token."]);
    http_response_code(403);
    exit;
}

$username = $_SESSION['username'] ?? '';
$userPermissions = loadUserPermissions($username);
if ($username) {
    $userPermissions = loadUserPermissions($username);
    if (isset($userPermissions['readOnly']) && $userPermissions['readOnly'] === true) {
        echo json_encode(["error" => "Read-only users are not allowed to file tags"]);
        exit();
    }
}

// Retrieve and sanitize input.
$data = json_decode(file_get_contents('php://input'), true);
$file = isset($data['file']) ? trim($data['file']) : '';
$folder = isset($data['folder']) ? trim($data['folder']) : 'root';
$tags = isset($data['tags']) ? $data['tags'] : [];

// Basic validation.
if ($file === '') {
    echo json_encode(["error" => "No file specified."]);
    exit;
}

$globalTagsFile = META_DIR . "createdTags.json";

// If file is "global", update the global tags only.
if ($file === "global") {
    if (!file_exists($globalTagsFile)) {
        if (file_put_contents($globalTagsFile, json_encode([], JSON_PRETTY_PRINT)) === false) {
            echo json_encode(["error" => "Failed to create global tags file."]);
            exit;
        }
    }
    $globalTags = json_decode(file_get_contents($globalTagsFile), true);
    if (!is_array($globalTags)) {
        $globalTags = [];
    }
    // If deleteGlobal flag is set and tagToDelete is provided, remove it.
    if (isset($data['deleteGlobal']) && $data['deleteGlobal'] === true && isset($data['tagToDelete'])) {
        $tagToDelete = strtolower($data['tagToDelete']);
        $globalTags = array_values(array_filter($globalTags, function($globalTag) use ($tagToDelete) {
            return strtolower($globalTag['name']) !== $tagToDelete;
        }));
    } else {
        // Otherwise, merge new tags.
        foreach ($tags as $tag) {
            $found = false;
            foreach ($globalTags as &$globalTag) {
                if (strtolower($globalTag['name']) === strtolower($tag['name'])) {
                    $globalTag['color'] = $tag['color'];
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $globalTags[] = $tag;
            }
        }
    }
    if (file_put_contents($globalTagsFile, json_encode($globalTags, JSON_PRETTY_PRINT)) === false) {
        echo json_encode(["error" => "Failed to save global tags."]);
        exit;
    }
    echo json_encode(["success" => "Global tags updated successfully.", "globalTags" => $globalTags]);
    exit;
}

// Validate folder name.
if ($folder !== 'root' && !preg_match('/^[\p{L}\p{N}_\-\s\/\\\\]+$/u', $folder)) {
    echo json_encode(["error" => "Invalid folder name."]);
    exit;
}

function getMetadataFilePath($folder) {
    if (strtolower($folder) === 'root' || $folder === '') {
        return META_DIR . "root_metadata.json";
    }
    return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
}

$metadataFile = getMetadataFilePath($folder);
$metadata = file_exists($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : [];

if (!isset($metadata[$file])) {
    $metadata[$file] = [];
}
$metadata[$file]['tags'] = $tags;

if (file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT)) === false) {
    echo json_encode(["error" => "Failed to save tag data."]);
    exit;
}

// Now update the global tags file as well.
if (!file_exists($globalTagsFile)) {
    if (file_put_contents($globalTagsFile, json_encode([], JSON_PRETTY_PRINT)) === false) {
        echo json_encode(["error" => "Failed to create global tags file."]);
        exit;
    }
}

$globalTags = json_decode(file_get_contents($globalTagsFile), true);
if (!is_array($globalTags)) {
    $globalTags = [];
}

foreach ($tags as $tag) {
    $found = false;
    foreach ($globalTags as &$globalTag) {
        if (strtolower($globalTag['name']) === strtolower($tag['name'])) {
            $globalTag['color'] = $tag['color'];
            $found = true;
            break;
        }
    }
    if (!$found) {
        $globalTags[] = $tag;
    }
}

if (file_put_contents($globalTagsFile, json_encode($globalTags, JSON_PRETTY_PRINT)) === false) {
    echo json_encode(["error" => "Failed to save global tags."]);
    exit;
}

echo json_encode(["success" => "Tag data saved successfully.", "tags" => $tags, "globalTags" => $globalTags]);
?>