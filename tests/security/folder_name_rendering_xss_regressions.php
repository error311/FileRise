<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$fileListPath = $baseDir . '/public/js/fileListView.js';
$domUtilsPath = $baseDir . '/public/js/domUtils.js';
$adminStoragePath = $baseDir . '/public/js/adminStorage.js';
$fileListSource = file_get_contents($fileListPath);
$domUtilsSource = file_get_contents($domUtilsPath);
$adminStorageSource = file_get_contents($adminStoragePath);

if ($fileListSource === false || $domUtilsSource === false || $adminStorageSource === false) {
    fwrite(STDERR, "Unable to read folder-rendering JavaScript sources\n");
    exit(1);
}

$errors = [];

$stripStart = strpos($fileListSource, 'function renderFolderStripPaged(');
$stripEnd = $stripStart === false
    ? false
    : strpos($fileListSource, 'function _trimLabel(', $stripStart);

if ($stripStart === false || $stripEnd === false || $stripEnd <= $stripStart) {
    $errors[] = 'Unable to locate the shallow folder-strip renderer.';
    $stripRenderer = '';
} else {
    $stripRenderer = substr($fileListSource, $stripStart, $stripEnd - $stripStart);
}

if (!str_contains($stripRenderer, 'data-folder="${escapeHTML(sf.full)}"')) {
    $errors[] = 'The shallow folder strip does not HTML-encode its data-folder value.';
}

if (str_contains($stripRenderer, 'data-folder="${sf.full}"')) {
    $errors[] = 'The shallow folder strip still interpolates the raw folder path.';
}

foreach (
    [
        '.replace(/&/g, "&amp;")',
        '.replace(/</g, "&lt;")',
        '.replace(/>/g, "&gt;")',
        '.replace(/"/g, "&quot;")',
        '.replace(/\'/g, "&#039;")',
    ] as $encoding
) {
    if (!str_contains($domUtilsSource, $encoding)) {
        $errors[] = 'The core HTML encoder is missing required character handling: ' . $encoding;
    }
}

$rowsStart = strpos($adminStorageSource, 'const topRows = displayTopFolders.map(');
$rowsEnd = $rowsStart === false
    ? false
    : strpos($adminStorageSource, '  // --- Volumes metrics block', $rowsStart);

if ($rowsStart === false || $rowsEnd === false || $rowsEnd <= $rowsStart) {
    $errors[] = 'Unable to locate the Pro Top Folders renderer.';
    $topFoldersRenderer = '';
} else {
    $topFoldersRenderer = substr($adminStorageSource, $rowsStart, $rowsEnd - $rowsStart);
}

foreach (
    [
        'const safeFolder = escapeHtml(f.folder);',
        'const safeLabel = escapeHtml(label);',
        'data-folder="${safeFolder}"',
        '<code>${safeLabel}</code>',
    ] as $snippet
) {
    if (!str_contains($topFoldersRenderer, $snippet)) {
        $errors[] = 'The Pro Top Folders renderer is missing safe output handling: ' . $snippet;
    }
}

foreach (
    [
        'data-folder="${f.folder}"',
        '<code>${label}</code>',
    ] as $snippet
) {
    if (str_contains($topFoldersRenderer, $snippet)) {
        $errors[] = 'The Pro Top Folders renderer still uses raw folder metadata: ' . $snippet;
    }
}

foreach (
    [
        ".replace(/&/g, '&amp;')",
        ".replace(/</g, '&lt;')",
        ".replace(/>/g, '&gt;')",
        ".replace(/\"/g, '&quot;')",
        ".replace(/'/g, '&#39;')",
    ] as $encoding
) {
    if (!str_contains($adminStorageSource, $encoding)) {
        $errors[] = 'The Pro HTML encoder is missing required character handling: ' . $encoding;
    }
}

if ($errors) {
    fwrite(STDERR, "Folder-name rendering XSS regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Folder-name rendering XSS regressions passed\n";
