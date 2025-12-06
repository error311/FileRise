<?php
// src/controllers/PortalController.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/src/controllers/AdminController.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

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
     *   'uploadOnly'         => bool,   // stored flag (legacy name)
     *   'allowDownload'      => bool,   // stored flag
     *   'expiresAt'          => string,
     *   'title'              => string,
     *   'introText'          => string,
     *   'requireForm'        => bool,
     *   'brandColor'         => string,
     *   'footerText'         => string,
     *   'formDefaults'       => array,
     *   'formRequired'       => array,
     *   'formLabels'         => array,
     *   'formVisible'        => array,
     *   'logoFile'           => string,
     *   'logoUrl'            => string,
     *   'uploadMaxSizeMb'    => int,
     *   'uploadExtWhitelist' => string,
     *   'uploadMaxPerDay'    => int,
     *   'showThankYou'       => bool,
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

        // Upload rules / thank-you behavior
        $uploadMaxSizeMb    = isset($p['uploadMaxSizeMb']) ? (int)$p['uploadMaxSizeMb'] : 0;
        $uploadExtWhitelist = trim((string)($p['uploadExtWhitelist'] ?? ''));
        $uploadMaxPerDay    = isset($p['uploadMaxPerDay']) ? (int)$p['uploadMaxPerDay'] : 0;
        $showThankYou       = !empty($p['showThankYou']);
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

        if ($user !== '') {
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
        }

        return [
            'slug'               => $slug,
            'label'              => $label,
            'folder'             => $folder,
            'clientEmail'        => $clientEmail,
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
            'formDefaults'       => $formDefaults,
            'formRequired'       => $formRequired,
            'formLabels'         => $formLabels,
            'formVisible'        => $formVisible,
            'logoFile'           => $logoFile,
            'logoUrl'            => $logoUrl,
            'uploadMaxSizeMb'    => $uploadMaxSizeMb,
            'uploadExtWhitelist' => $uploadExtWhitelist,
            'uploadMaxPerDay'    => $uploadMaxPerDay,
            'showThankYou'       => $showThankYou,
            'thankYouText'       => $thankYouText,
            // New ACL-aware caps for portal.js
            'canUpload'          => $canUpload,
            'canDownload'        => $canDownload,
        ];
    }
}