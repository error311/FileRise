<?php
/**
 * scan_uploads.php
 * Rebuild/repair per-folder metadata used by FileRise models.
 * - Uses UPLOAD_DIR / META_DIR / DATE_TIME_FORMAT from config.php
 * - Per-folder metadata naming matches FileModel/FolderModel:
 *     "root" -> root_metadata.json
 *     "<sub/dir>" -> str_replace(['/', '\\', ' '], '-', '<sub/dir>') . '_metadata.json'
 */

require_once __DIR__ . '/../config/config.php';

// ---------- helpers that mirror model behavior ----------

/** Compute the metadata JSON path for a folder key (e.g., "root", "invoices/2025"). */
function folder_metadata_path(string $folderKey): string {
    if (strtolower(trim($folderKey)) === 'root' || trim($folderKey) === '') {
        return rtrim(META_DIR, '/\\') . '/root_metadata.json';
    }
    $safe = str_replace(['/', '\\', ' '], '-', trim($folderKey));
    return rtrim(META_DIR, '/\\') . '/' . $safe . '_metadata.json';
}

/** Turn an absolute path under UPLOAD_DIR into a folder key (“root” or relative with slashes). */
function to_folder_key(string $absPath): string {
    $base = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
    if (realpath($absPath) === realpath(rtrim(UPLOAD_DIR, '/\\'))) {
        return 'root';
    }
    $rel = ltrim(str_replace('\\', '/', substr($absPath, strlen($base))), '/');
    return $rel;
}

/** List immediate files in a directory (no subdirs). */
function list_files(string $dir): array {
    $out = [];
    $entries = @scandir($dir);
    if ($entries === false) return $out;
    foreach ($entries as $name) {
        if ($name === '.' || $name === '..') continue;
        $p = $dir . DIRECTORY_SEPARATOR . $name;
        if (is_file($p)) $out[] = $name;
    }
    sort($out, SORT_NATURAL | SORT_FLAG_CASE);
    return $out;
}

/** Recursively list subfolders (relative folder keys), skipping trash/. */
function list_all_folders(string $root): array {
    $root = rtrim($root, '/\\');
    $folders = ['root'];
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($it as $path => $info) {
        if ($info->isDir()) {
            // relative key like "foo/bar"
            $rel = ltrim(str_replace(['\\'], '/', substr($path, strlen($root) + 1)), '/');
            if ($rel === '') continue;
            // skip trash subtree
            if (strpos($rel, 'trash/') === 0 || $rel === 'trash') continue;
            // obey the app’s folder-name regex to stay consistent
            if (preg_match(REGEX_FOLDER_NAME, basename($rel))) {
                $folders[] = $rel;
            }
        }
    }
    // de-dup and sort
    $folders = array_values(array_unique($folders));
    sort($folders, SORT_NATURAL | SORT_FLAG_CASE);
    return $folders;
}

// ---------- main ----------

$uploads = rtrim(UPLOAD_DIR, '/\\');
$metaDir = rtrim(META_DIR, '/\\');

// Ensure metadata dir exists
if (!is_dir($metaDir)) {
    @mkdir($metaDir, 0775, true);
}

$now = date(DATE_TIME_FORMAT);
$folders = list_all_folders($uploads);

$totalCreated = 0;
$totalPruned  = 0;

foreach ($folders as $folderKey) {
    $absFolder = ($folderKey === 'root')
        ? $uploads
        : $uploads . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $folderKey);

    if (!is_dir($absFolder)) continue;

    $files = list_files($absFolder);

    $metaPath = folder_metadata_path($folderKey);
    $metadata = [];
    if (is_file($metaPath)) {
        $decoded = json_decode(@file_get_contents($metaPath), true);
        if (is_array($decoded)) $metadata = $decoded;
    }

    // Build a quick lookup of existing entries
    $existing = array_keys($metadata);

    // ADD missing files
    foreach ($files as $name) {
        // Keep same filename validation used in FileModel
        if (!preg_match(REGEX_FILE_NAME, $name)) continue;

        if (!isset($metadata[$name])) {
            $metadata[$name] = [
                'uploaded' => $now,
                'modified' => $now,
                'uploader' => 'Imported'
            ];
            $totalCreated++;
            echo "Indexed: " . ($folderKey === 'root' ? '' : $folderKey . '/') . $name . PHP_EOL;
        }
    }

    // PRUNE stale metadata entries for files that no longer exist
    foreach ($existing as $name) {
        if (!in_array($name, $files, true)) {
            unset($metadata[$name]);
            $totalPruned++;
        }
    }

    // Ensure parent dir exists and write metadata
    @mkdir(dirname($metaPath), 0775, true);
    if (@file_put_contents($metaPath, json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
        fwrite(STDERR, "Failed to write metadata for folder: {$folderKey}\n");
    }
}

echo "Done. Created {$totalCreated} entr" . ($totalCreated === 1 ? "y" : "ies") .
     ", pruned {$totalPruned}.\n";
