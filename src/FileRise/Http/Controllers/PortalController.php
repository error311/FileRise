<?php

declare(strict_types=1);

namespace FileRise\Http\Controllers;

use FileRise\Support\ACL;
use FileRise\Support\FS;
use FileRise\Storage\StorageAdapterInterface;
use FileRise\Storage\SourceContext;
use FileRise\Storage\StorageRegistry;
use FileRise\Http\Controllers\AdminController;
use InvalidArgumentException;
use RuntimeException;
use ProPortals;

// src/controllers/PortalController.php
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/lib/FS.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';

final class PortalController
{
    /**
     * Look up a portal by slug from the Pro bundle.
     *
     * Returns:
     * [
     *   'slug'               => string,
     *   'label'              => string,
     *   'folder'             => string,
     *   'clientEmail'        => string,
     *   'sourceId'           => string,
     *   'uploadOnly'         => bool,   // stored flag (legacy name)
     *   'allowDownload'      => bool,   // stored flag
     *   'expiresAt'          => string,
     *   'title'              => string,
     *   'introText'          => string,
     *   'requireForm'        => bool,
     *   'brandColor'         => string,
     *   'footerText'         => string,
     *   'theme'              => array,
     *   'formDefaults'       => array,
     *   'formRequired'       => array,
     *   'formLabels'         => array,
     *   'formVisible'        => array,
     *   'logoFile'           => string,
     *   'logoUrl'            => string,
     *   'uploadMaxSizeMb'    => int,
     *   'uploadExtWhitelist' => string,
     *   'uploadMaxPerDay'    => int,
     *   'allowSubfolders'    => bool,
     *   'showThankYou'       => bool,
     *   'thankYouShowRef'    => bool,
     *   'thankYouText'       => string,
     *   'canUpload'          => bool, // ACL + portal flags
     *   'canDownload'        => bool, // ACL + portal flags
     * ]
     */
    public static function getPortalBySlug(string $slug): array
    {
        $slug = trim($slug);
        if ($slug === '') {
            throw new InvalidArgumentException('Missing portal slug.');
        }

        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE) {
            throw new RuntimeException('FileRise Pro is not active.');
        }
        if (!defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            throw new RuntimeException('Pro bundle directory not configured.');
        }

        $proPortalsPath = rtrim((string)FR_PRO_BUNDLE_DIR, "/\\") . '/ProPortals.php';
        if (!is_file($proPortalsPath)) {
            throw new RuntimeException('ProPortals.php not found in Pro bundle.');
        }

        require_once $proPortalsPath;

        $store   = new ProPortals(FR_PRO_BUNDLE_DIR);
        $portals = $store->listPortals();

        if (!isset($portals[$slug]) || !is_array($portals[$slug])) {
            throw new RuntimeException('Portal not found.');
        }

        $p = $portals[$slug];

        $sourceId = trim((string)($p['sourceId'] ?? ''));
        $sourcesEnabled = class_exists('SourceContext') && SourceContext::sourcesEnabled();
        if ($sourcesEnabled) {
            if ($sourceId === '') {
                // Legacy portals default to Local when sources are enabled.
                $sourceId = 'local';
            } elseif (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sourceId)) {
                throw new RuntimeException('Portal misconfigured: invalid source id.');
            } else {
                $src = SourceContext::getSourceById($sourceId);
                if (!$src) {
                    throw new RuntimeException('Portal misconfigured: invalid source.');
                }
                $permsCheck = [
                    'role'    => $_SESSION['role']    ?? null,
                    'admin'   => $_SESSION['admin']   ?? null,
                    'isAdmin' => $_SESSION['isAdmin'] ?? null,
                ];
                if (empty($src['enabled']) && !ACL::isAdmin($permsCheck)) {
                    throw new RuntimeException('Source is disabled.');
                }
            }
        } else {
            $sourceId = '';
        }

        // ─────────────────────────────────────────────
        // Normalize upload/download flags (old + new)
        // ─────────────────────────────────────────────
        //
        // Storage:
        //  - OLD (no allowDownload):
        //       uploadOnly=true  => upload yes, download no
        //       uploadOnly=false => upload yes, download yes
        //
        //  - NEW:
        //       "Allow upload" checkbox is stored as uploadOnly (🤮 name, but we keep it)
        //       "Allow download" checkbox is stored as allowDownload
        //
        // Normalized flags we want here:
        //  - $allowUpload   (bool)
        //  - $allowDownload (bool)
        $hasAllowDownload = array_key_exists('allowDownload', $p);
        $rawUploadOnly    = !empty($p['uploadOnly']);                 // legacy name
        $rawAllowDownload = $hasAllowDownload ? !empty($p['allowDownload']) : null;

        if ($hasAllowDownload) {
            // New JSON – trust both checkboxes exactly
            $allowUpload   = $rawUploadOnly;        // "Allow upload" in UI
            $allowDownload = (bool)$rawAllowDownload;
        } else {
            // Legacy JSON – no separate allowDownload
            // uploadOnly=true  => upload yes, download no
            // uploadOnly=false => upload yes, download yes
            $allowUpload   = true;
            $allowDownload = !$rawUploadOnly;
        }

        $label       = trim((string)($p['label'] ?? $slug));
        $folder      = trim((string)($p['folder'] ?? ''));
        $clientEmail = trim((string)($p['clientEmail'] ?? ''));

        $expiresAt = trim((string)($p['expiresAt'] ?? ''));

        // Branding + intake behavior
        $title       = trim((string)($p['title'] ?? ''));
        $introText   = trim((string)($p['introText'] ?? ''));
        $requireForm = !empty($p['requireForm']);
        $brandColor  = trim((string)($p['brandColor'] ?? ''));
        $footerText  = trim((string)($p['footerText'] ?? ''));
        $theme = isset($p['theme']) && is_array($p['theme']) ? $p['theme'] : [];
        $themeLight = isset($theme['light']) && is_array($theme['light']) ? $theme['light'] : [];
        $themeDark = isset($theme['dark']) && is_array($theme['dark']) ? $theme['dark'] : [];
        $theme = [
            'light' => [
                'bodyBg'  => trim((string)($themeLight['bodyBg'] ?? '')),
                'surface' => trim((string)($themeLight['surface'] ?? '')),
                'text'    => trim((string)($themeLight['text'] ?? '')),
                'muted'   => trim((string)($themeLight['muted'] ?? '')),
                'border'  => trim((string)($themeLight['border'] ?? '')),
                'shadow'  => trim((string)($themeLight['shadow'] ?? '')),
            ],
            'dark' => [
                'bodyBg'  => trim((string)($themeDark['bodyBg'] ?? '')),
                'surface' => trim((string)($themeDark['surface'] ?? '')),
                'text'    => trim((string)($themeDark['text'] ?? '')),
                'muted'   => trim((string)($themeDark['muted'] ?? '')),
                'border'  => trim((string)($themeDark['border'] ?? '')),
                'shadow'  => trim((string)($themeDark['shadow'] ?? '')),
            ],
        ];

        // Defaults / required
        $fd = isset($p['formDefaults']) && is_array($p['formDefaults'])
            ? $p['formDefaults']
            : [];

        $formDefaults = [
            'name'      => trim((string)($fd['name'] ?? '')),
            'email'     => trim((string)($fd['email'] ?? '')),
            'reference' => trim((string)($fd['reference'] ?? '')),
            'notes'     => trim((string)($fd['notes'] ?? '')),
        ];

        $fr = isset($p['formRequired']) && is_array($p['formRequired'])
            ? $p['formRequired']
            : [];

        $formRequired = [
            'name'      => !empty($fr['name']),
            'email'     => !empty($fr['email']),
            'reference' => !empty($fr['reference']),
            'notes'     => !empty($fr['notes']),
        ];

        // Optional formLabels
        $fl = isset($p['formLabels']) && is_array($p['formLabels'])
            ? $p['formLabels']
            : [];

        $formLabels = [
            'name'      => trim((string)($fl['name'] ?? 'Name')),
            'email'     => trim((string)($fl['email'] ?? 'Email')),
            'reference' => trim((string)($fl['reference'] ?? 'Reference / Case / Order #')),
            'notes'     => trim((string)($fl['notes'] ?? 'Notes')),
        ];

        // Optional visibility
        $fv = isset($p['formVisible']) && is_array($p['formVisible'])
            ? $p['formVisible']
            : [];

        $formVisible = [
            'name'      => !array_key_exists('name', $fv)      || !empty($fv['name']),
            'email'     => !array_key_exists('email', $fv)     || !empty($fv['email']),
            'reference' => !array_key_exists('reference', $fv) || !empty($fv['reference']),
            'notes'     => !array_key_exists('notes', $fv)     || !empty($fv['notes']),
        ];

        // Optional per-portal logo
        $logoFile = trim((string)($p['logoFile'] ?? ''));
        $logoUrl  = trim((string)($p['logoUrl']  ?? ''));
        if ($logoUrl !== '') {
            $logoUrl = fr_normalize_profile_pic_url($logoUrl);
        }
        if ($logoUrl === '' && $logoFile !== '') {
            $logoUrl = fr_profile_pic_url($logoFile);
        }

        // Upload rules / thank-you behavior
        $uploadMaxSizeMb    = isset($p['uploadMaxSizeMb']) ? (int)$p['uploadMaxSizeMb'] : 0;
        $uploadExtWhitelist = trim((string)($p['uploadExtWhitelist'] ?? ''));
        $uploadMaxPerDay    = isset($p['uploadMaxPerDay']) ? (int)$p['uploadMaxPerDay'] : 0;
        $allowSubfolders    = !empty($p['allowSubfolders']);
        $showThankYou       = !empty($p['showThankYou']);
        $thankYouShowRef    = !empty($p['thankYouShowRef']);
        $thankYouText       = trim((string)($p['thankYouText'] ?? ''));

        if ($folder === '') {
            throw new RuntimeException('Portal misconfigured: empty folder.');
        }

        // Expiry check
        if ($expiresAt !== '') {
            $ts = strtotime($expiresAt . ' 23:59:59');
            if ($ts !== false && $ts < time()) {
                throw new RuntimeException('This portal has expired.');
            }
        }

        // ──────────────────────────────
        // Capability flags (portal + ACL)
        // ──────────────────────────────
        //
        // Base from portal config:
        $canUpload   = (bool)$allowUpload;
        $canDownload = (bool)$allowDownload;

        // Refine with ACL for the current logged-in user (if any)
        $user  = (string)($_SESSION['username'] ?? '');
        $perms = [
            'role'    => $_SESSION['role']    ?? null,
            'admin'   => $_SESSION['admin']   ?? null,
            'isAdmin' => $_SESSION['isAdmin'] ?? null,
        ];

        $withSourceContext = function (callable $fn) use ($sourceId, $perms) {
            if ($sourceId === '' || !class_exists('SourceContext') || !SourceContext::sourcesEnabled()) {
                return $fn();
            }
            $prev = SourceContext::getActiveId();
            $allowDisabled = ACL::isAdmin($perms);
            SourceContext::setActiveId($sourceId, false, $allowDisabled);
            try {
                return $fn();
            } finally {
                SourceContext::setActiveId($prev, false);
            }
        };

        if ($user !== '') {
            [$canUpload, $canDownload] = $withSourceContext(function () use ($user, $perms, $folder, $canUpload, $canDownload) {
                // Upload: must also pass folder-level ACL
                if ($canUpload && !ACL::canUpload($user, $perms, $folder)) {
                    $canUpload = false;
                }

                // Download: require read or read_own
                if (
                    $canDownload
                    && !ACL::canRead($user, $perms, $folder)
                    && !ACL::canReadOwn($user, $perms, $folder)
                ) {
                    $canDownload = false;
                }
                return [$canUpload, $canDownload];
            });
        }

        return [
            'slug'               => $slug,
            'label'              => $label,
            'folder'             => $folder,
            'clientEmail'        => $clientEmail,
            'sourceId'           => $sourceId,
            // Store flags as-is so old code / JSON stay compatible
            'uploadOnly'         => (bool)$rawUploadOnly,
            'allowDownload'      => $hasAllowDownload
                ? (bool)$rawAllowDownload
                : $allowDownload,
            'expiresAt'          => $expiresAt,
            'title'              => $title,
            'introText'          => $introText,
            'requireForm'        => $requireForm,
            'brandColor'         => $brandColor,
            'footerText'         => $footerText,
            'theme'              => $theme,
            'formDefaults'       => $formDefaults,
            'formRequired'       => $formRequired,
            'formLabels'         => $formLabels,
            'formVisible'        => $formVisible,
            'logoFile'           => $logoFile,
            'logoUrl'            => $logoUrl,
            'uploadMaxSizeMb'    => $uploadMaxSizeMb,
            'uploadExtWhitelist' => $uploadExtWhitelist,
            'uploadMaxPerDay'    => $uploadMaxPerDay,
            'allowSubfolders'    => $allowSubfolders,
            'showThankYou'       => $showThankYou,
            'thankYouShowRef'    => $thankYouShowRef,
            'thankYouText'       => $thankYouText,
            // New ACL-aware caps for portal.js
            'canUpload'          => $canUpload,
            'canDownload'        => $canDownload,
        ];
    }

    /**
     * List portal entries (folders + files) with pagination.
     *
     * @return array<string,mixed>
     */
    public static function listPortalEntries(
        string $slug,
        string $path = '',
        int $page = 1,
        int $perPage = 50,
        bool $includeAllFiles = false
    ): array {
        try {
            $portal = self::getPortalBySlug($slug);
        } catch (\Throwable $e) {
            return ['error' => $e->getMessage(), 'status' => 404];
        }

        if (empty($portal['canDownload'])) {
            return ['error' => 'Downloads are disabled for this portal.', 'status' => 403];
        }

        $allowSubfolders = !empty($portal['allowSubfolders']);
        [$normalizedPath, $pathErr] = self::normalizePortalPath($path);
        if ($pathErr) {
            return ['error' => $pathErr, 'status' => 400];
        }
        if ($normalizedPath !== '' && !$allowSubfolders) {
            return ['error' => 'Subfolder access is not enabled for this portal.', 'status' => 403];
        }

        $portalFolder = ACL::normalizeFolder((string)($portal['folder'] ?? 'root'));
        if ($portalFolder === '') {
            $portalFolder = 'root';
        }

        $targetFolder = $portalFolder;
        if ($normalizedPath !== '') {
            $targetFolder = ($portalFolder === 'root' || $portalFolder === '')
                ? $normalizedPath
                : ($portalFolder . '/' . $normalizedPath);
        }

        $perPage = max(1, min(200, (int)$perPage));
        $page = max(1, (int)$page);

        $sourceId = (string)($portal['sourceId'] ?? '');
        $perms = [
            'role'    => $_SESSION['role']    ?? null,
            'admin'   => $_SESSION['admin']   ?? null,
            'isAdmin' => $_SESSION['isAdmin'] ?? null,
        ];

        $runner = function () use ($targetFolder, $normalizedPath, $allowSubfolders, $page, $perPage, $includeAllFiles) {
            $storage = StorageRegistry::getAdapter();
            $uploadRoot = class_exists('SourceContext')
                ? SourceContext::uploadRoot()
                : (string)UPLOAD_DIR;
            $uploadRoot = rtrim($uploadRoot, "/\\");

            $dirPath = ($targetFolder === 'root' || $targetFolder === '')
                ? $uploadRoot
                : $uploadRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $targetFolder);

            if ($storage->isLocal()) {
                $baseReal = realpath($uploadRoot);
                if ($baseReal === false) {
                    return ['error' => 'Uploads directory not found.', 'status' => 500];
                }
                if ($targetFolder === 'root' || $targetFolder === '') {
                    $dirPath = $baseReal;
                } else {
                    $safe = FS::safeReal($baseReal, $dirPath);
                    if ($safe === null || !is_dir($safe)) {
                        return ['error' => 'Folder not found.', 'status' => 404];
                    }
                    $dirPath = $safe;
                }
            } else {
                $dirStat = $storage->stat($dirPath);
                if ($dirStat === null || ($dirStat['type'] ?? '') !== 'dir') {
                    return ['error' => 'Folder not found.', 'status' => 404];
                }
            }

            $entries = self::scanPortalEntries($storage, $dirPath, $targetFolder);
            if (!$allowSubfolders) {
                $entries = array_values(array_filter($entries, function (array $entry): bool {
                    return ($entry['type'] ?? '') === 'file';
                }));
            }

            $totalEntries = count($entries);
            $totalFiles = 0;
            $totalFolders = 0;
            foreach ($entries as $entry) {
                if (($entry['type'] ?? '') === 'file') {
                    $totalFiles++;
                }
                if (($entry['type'] ?? '') === 'folder') {
                    $totalFolders++;
                }
            }

            $totalPages = max(1, (int)ceil($totalEntries / max(1, $perPage)));
            $page = min($page, $totalPages);
            $startIndex = ($page - 1) * $perPage;
            $entriesPage = array_slice($entries, $startIndex, $perPage);

            $payload = [
                'entries'       => $entriesPage,
                'path'          => $normalizedPath,
                'folder'        => $targetFolder,
                'allowSubfolders' => $allowSubfolders ? 1 : 0,
                'totalEntries'  => $totalEntries,
                'totalFiles'    => $totalFiles,
                'totalFolders'  => $totalFolders,
                'currentPage'   => $page,
                'totalPages'    => $totalPages,
                'perPage'       => $perPage,
            ];

            if ($includeAllFiles) {
                $files = [];
                foreach ($entries as $entry) {
                    if (($entry['type'] ?? '') === 'file' && !empty($entry['name'])) {
                        $files[] = (string)$entry['name'];
                    }
                }
                $payload['files'] = $files;
            }

            return $payload;
        };

        if ($sourceId !== '' && class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $prev = SourceContext::getActiveId();
            $allowDisabled = ACL::isAdmin($perms);
            SourceContext::setActiveId($sourceId, false, $allowDisabled);
            try {
                return $runner();
            } finally {
                SourceContext::setActiveId($prev, false);
            }
        }

        return $runner();
    }

    /**
     * @return array{0:string,1:?string} [normalizedPath, error]
     */
    private static function normalizePortalPath(string $path): array
    {
        $path = str_replace('\\', '/', trim($path));
        $path = trim($path, '/');
        if ($path === '') {
            return ['', null];
        }

        $parts = array_filter(explode('/', $path), fn($p) => $p !== '');
        $clean = [];
        foreach ($parts as $seg) {
            if ($seg === '.' || $seg === '..') {
                return ['', 'Invalid folder name.'];
            }
            if (!FS::isSafeSegment($seg)) {
                return ['', 'Invalid folder name.'];
            }
            if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                return ['', 'Invalid folder name.'];
            }
            $clean[] = $seg;
        }

        return [implode('/', $clean), null];
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    private static function scanPortalEntries(StorageAdapterInterface $storage, string $dirPath, string $relPath): array
    {
        $folders = [];
        $files = [];

        $items = $storage->list($dirPath);
        $skip = FS::SKIP();
        $sep = $storage->isLocal() ? DIRECTORY_SEPARATOR : '/';
        $base = $storage->isLocal() ? rtrim($dirPath, "/\\") : rtrim(str_replace('\\', '/', $dirPath), '/');

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            if ($item === '' || $item[0] === '.') {
                continue;
            }
            if (FS::shouldIgnoreEntry($item, $relPath)) {
                continue;
            }
            if (!FS::isSafeSegment($item)) {
                continue;
            }

            $lower = strtolower($item);
            if (in_array($lower, $skip, true)) {
                continue;
            }

            $fullPath = $base . $sep . $item;
            $stat = $storage->stat($fullPath);
            if ($stat === null) {
                continue;
            }

            $type = $stat['type'] ?? '';
            if ($type === 'dir') {
                if (!preg_match(REGEX_FOLDER_NAME, $item)) {
                    continue;
                }
                $folders[] = [
                    'type'     => 'folder',
                    'name'     => $item,
                    'size'     => null,
                    'modified' => self::extractStatMtime($stat),
                ];
                continue;
            }
            if ($type === 'file') {
                if (!preg_match(REGEX_FILE_NAME, $item)) {
                    continue;
                }
                $files[] = [
                    'type'     => 'file',
                    'name'     => $item,
                    'size'     => array_key_exists('size', $stat) ? (int)$stat['size'] : null,
                    'modified' => self::extractStatMtime($stat),
                ];
            }
        }

        $sortByName = function (array $a, array $b): int {
            return strnatcasecmp($a['name'] ?? '', $b['name'] ?? '');
        };
        usort($folders, $sortByName);
        usort($files, $sortByName);

        return array_merge($folders, $files);
    }

    private static function extractStatMtime(array $stat): ?int
    {
        $raw = $stat['mtime'] ?? $stat['modified'] ?? $stat['lastModified'] ?? null;
        if (is_int($raw)) {
            return $raw;
        }
        if (is_numeric($raw)) {
            return (int)$raw;
        }
        if (is_string($raw) && $raw !== '') {
            $ts = strtotime($raw);
            if ($ts !== false) {
                return $ts;
            }
        }
        return null;
    }
}
