<?php
declare(strict_types=1);

// getFileTag.php

require_once 'config.php';

// Set security and content headers
header('Content-Type: application/json; charset=utf-8');

$metadataPath = META_DIR . 'createdTags.json';

// Check if the metadata file exists and is readable
if (!file_exists($metadataPath) || !is_readable($metadataPath)) {
    error_log('Metadata file does not exist or is not readable: ' . $metadataPath);
    http_response_code(200); // Return empty array with HTTP 200 so the client can handle it gracefully
    echo json_encode([]);
    exit;
}

$data = file_get_contents($metadataPath);
if ($data === false) {
    error_log('Failed to read metadata file: ' . $metadataPath);
    http_response_code(500);
    echo json_encode(["error" => "Unable to read metadata file."]);
    exit;
}

// Decode the JSON data to check for validity
$jsonData = json_decode($data, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    error_log('Invalid JSON in metadata file: ' . $metadataPath . ' Error: ' . json_last_error_msg());
    http_response_code(500);
    echo json_encode(["error" => "Metadata file contains invalid JSON."]);
    exit;
}

// Output the re-encoded JSON to ensure well-formed output
echo json_encode($jsonData);
exit;