# Changelog

## Changes 02/09/2026 (v3.3.2)

`release(v3.3.2): PSR-4 backend migration + legacy shims`
`chore(psr4): PSR-4 backend migration + legacy shims (WIP, no release)`

**Commit message**  

```text
release(v3.3.2): PSR-4 backend migration + legacy shims

- backend: migrate core PHP to Composer PSR-4 (FileRise\\) under src/FileRise/
- entrypoints: update API/WebDAV/CLI/tests to use namespaced controllers/models (no shim includes)
- compat: restore legacy src/controllers + src/models + src/lib shims (optional FR_SHIM_WARN logging)
- api: canonical endpoints now live under /api/admin/* and /api/profile/*; legacy /api/*.php shims kept
- openapi: generate spec from the PSR-4 OpenAPI directory
- php: fix PHP 8.2+ nullable type deprecation in AuthModel::getClientIp()
- ci: harden release/changelog workflows (safe version parsing + enable workflow_run trigger)
```

**Highlights**  

- Backend is now PSR-4 namespaced and Composer-autoloaded (`FileRise\\...`) with legacy shims kept for compatibility.
- API endpoints are organized by scope (admin/profile/public) while preserving legacy URLs.

**Changed**  

- **PSR-4 backend layout**
  - Introduced `FileRise\\` namespace with code moved under `src/FileRise/` (Domain, Controllers, Storage, Support, WebDAV).
  - `config/config.php` now loads `vendor/autoload.php` when present (logs a warning if missing).
- **Entrypoints updated**
  - Public API endpoints, WebDAV (`public/webdav.php`), CLI scripts, and tests now instantiate namespaced controllers/models directly.
- **OpenAPI generation**
  - OpenAPI generator updated to scan the PSR-4 OpenAPI directory.
  - Bump version

**Compatibility**  

- **Legacy backend shims remain**
  - `src/controllers/*`, `src/models/*`, `src/lib/*`, `src/webdav/*` forward to PSR-4 classes via `class_alias`.
  - Optional dev-only shim usage tracking via `FR_SHIM_WARN=1` (logs which shims were used per request).
- **Legacy API endpoint shims**
  - Old `/api/*.php` routes forward to canonical endpoints under `/api/admin/*` and `/api/profile/*`.

**CI**  

- ShellCheck: `scripts/gen-openapi.sh` is POSIX-clean (no `pipefail`, no quote-expansion warnings).
- PHPCS job runs on PHP 8.4 (current `swagger-php` dev dependency tree requires PHP >= 8.4).
- ci: harden release/changelog workflows (safe version parsing + enable workflow_run trigger)

**Fixed**  

- **PHP deprecation warning**
  - `AuthModel::getClientIp()` now uses an explicit nullable type for the `$server` arg.

---

## Changes 02/01/2026 (v3.3.1)

`release(v3.3.1): fix non-Pro sourceId validation for move+copy & update SECURITY policy wording`

**Commit message**  

```text
release(v3.3.1): fix non-Pro sourceId validation for move+copy & update SECURITY policy wording

- sources: only validate sourceId+destSourceId when Sources are enabled (prevents non-Pro move+copy failures)
- docs(security): clarify supported versions policy wording and contact formatting
- scripts: bump manual-sync helper version string to v3.3.1
```

**Fixed**  

- **Non‑Pro move/copy “Invalid source id” bug**
  - `FileController` and `FolderController` now only parse/validate `sourceId` / `destSourceId` when Sources are enabled.
  - When Sources are disabled (Core-only installs), move/copy requests no longer fail due to stray/empty sourceId fields.

**Changed**  

- **SECURITY.md**
  - Updated wording to “latest minor release line only” and simplified version support table.
  - Normalized security contact URLs/emails and clarified the “upgrade to latest” guidance.
  - Added acknowledgement mention for `@ByteTyson` alongside earlier disclosures.
- **scripts/manual-sync.sh**
  - Updated helper comment/version string to v3.3.1.

---

## Changes 01/31/2026 (v3.3.0)

`release(v3.3.0): security hardening (tag color sanitization + restrict direct uploads access)`

**Security**  

- Hardened tag color handling to prevent HTML/CSS injection:
  - Tag colors are now sanitized server-side on save and on read.
  - Allowed formats: `#RGB` / `#RRGGBB` and simple named colors.
  - Invalid values fall back to a safe default.
- Docker default now blocks direct `/uploads/*` access:
  - File data should be accessed via authenticated API/download flows (and share links where applicable).
  - Added a constrained public endpoint for profile pictures / portal logos:
    - `GET /api/public/profilePic.php?file=<filename>`
    - Locked to `UPLOAD_DIR/profile_pics/` with realpath boundary checks
    - Image-only MIME allowlist + `X-Content-Type-Options: nosniff`

**Changed**  

- **Behavior change (security, Docker default):** Direct requests to `/uploads/...` are no longer served.
  - If you intentionally need a public file host, use share links or a separate explicitly-public directory/vhost.
- Tag APIs now accept optional `sourceId` and sanitize tags end-to-end for Sources.

**Docs/OpenAPI**  

- OpenAPI updated to reflect:
  - tag objects (`{name,color}`)
  - `sourceId` parameters for tag endpoints
  - profile picture URLs served via `/api/public/profilePic.php`

---

## Changes 01/30/2026 (v3.2.4)

`release(v3.2.4): OIDC group-claim mapping + extra scopes (Authentik & Keycloak-friendly) + sponsor list update`

**Commit message**  

```text
release(v3.2.4): OIDC group-claim mapping + extra scopes (Authentik & Keycloak-friendly) + sponsor list update

- OIDC: add configurable group claim + extra scopes (Admin + env overrides)
- OIDC: extract group tags from both userinfo and ID token, supports dot-path claims (e.g. realm_access.roles)
- Admin: surface effective & locked groupClaim + extraScopes values and include them in OIDC debug snapshot
- Docs OpenAPI: document new OIDC config fields
- Admin: add new Pro supporter name to thanks list
```

**Added**  

- **OIDC: configurable group claim name**
  - Admin setting: `oidc.groupClaim` (default behavior remains `groups`)
  - Env override: `FR_OIDC_GROUP_CLAIM` (locks Admin field when set)
  - Supports **dot-path claims** (example: `realm_access.roles`)
- **OIDC: extra scopes**
  - Admin setting: `oidc.extraScopes` (space/comma separated)
  - Env override: `FR_OIDC_EXTRA_SCOPES` (locks Admin field when set)
  - Effective scopes become: `openid profile email` + your extras
- **OIDC debug snapshot improvements**
  - `/api/admin/oidcDebugInfo.php` now shows:
    - `groupClaim` + source (`env|config|default`)
    - `extraScopes` + source (`env|config|none`)
    - final `scopes[]` list

**Changed**  

- **Group mapping reads both claim sets**
  - Group tags are extracted from:
    - Userinfo response, and
    - ID Token payload (when available from the OIDC library)
  - This improves compatibility with IdPs that only place groups/roles in one of those.

**Fixed**  

- Group mapping reliability with IdPs like Authentik/Keycloak where:
  - groups are not under the default `groups` claim, and/or
  - groups require requesting an additional scope.

**Security / Hardening**  

- `groupClaim` and `extraScopes` inputs are sanitized on save (control chars stripped + length capped).
- No user-controlled HTML is introduced; config values are escaped in the Admin UI.
- No secrets are logged or echoed back.

---

## Changes 01/29/2026 (v3.2.3)

`release(v3.2.3): resumable upload UX fixes + stale chunk cleanup + folder re-upload conflict handling (closes #100, closes #101, closes #102)`

**Commit message**  

```text
release(v3.2.3): resumable upload UX fixes + stale chunk cleanup + folder re-upload conflict handling (closes #100, closes #101, closes #102)

- uploads: fix resumable resume banner layout for long filenames + improve dismiss behavior
- uploads: add preflight check existing files flow for folder uploads (resume+skip+overwrite)
- cleanup: add resumable TTL (Admin + env) + background sweeps + admin CLI cleanup tools
- folders: allow deleting empty folders by cleaning resumable temp dirs first
- docs: update OpenAPI (uploads config, checkExisting endpoint, cleanup endpoint)
```

**Fixed**  

- **#100:** Resumable resume banner **Dismiss** button is now reliably visible even with very long filenames.
  - Wrapped banner content and forced safe word wrapping so long names don’t push the button off-screen.
- **#101:** You can now delete a folder that only contains unfinished resumable chunks (refresh → dismiss → folder looked empty but wouldn’t delete).
  - Folder delete now cleans `resumable_*` temp dirs for that folder before the “is empty” check.
- **#102:** Re-uploading a folder after an interruption no longer blindly re-uploads files that already exist.
  - New “Existing files detected” modal lets users choose: **Resume** (skip same-size), **Skip existing**, or **Overwrite**.

**Added**  

- **Upload preflight endpoint:** `POST /api/upload/checkExisting.php`
  - Checks a list of relative paths and reports which already exist (and whether size matches).
  - Supports `sourceId` when Sources is enabled.
- **Resumable cleanup controls**
  - Admin setting: **Resumable cleanup age (hours)** (`uploads.resumableTtlHours`, default 6h)
  - Admin action: **Run cleanup now** (`POST /api/admin/resumableCleanup.php`)
  - CLI tool: `src/cli/resumable_cleanup.php` (supports `--all`, `--source`, `--respect-interval`)

**Changed**  

- **Resumable drafts banner UX**
  - Banner copy now explains how to resume and that Dismiss clears partial uploads + temp files.
  - Dismiss now attempts cleanup via `removeChunks` for all pending identifiers in the current folder.
- **Resumable temp management**
  - Tracks folders with pending resumable temp dirs via a small index (`resumable_pending.json`)
  - Performs periodic TTL-based sweeps (rate-limited) to remove stale temp folders automatically.
- **Admin config / siteConfig**
  - `uploads.resumableTtlHours` is now included in config payloads.
- **OpenAPI**
  - Docs updated for uploads config, `checkExisting`, and admin cleanup endpoints.

---

## Changes 01/28/2026 (v3.2.2)

`release(v3.2.2): update OpenAPI spec to match shipped endpoints`

- OpenAPI spec (openapi.json.dist) updated to reflect current behavior
  - Archive downloads are queued jobs (JSON response) and support format: zip|7z
  - downloadZipFile now documents “archive stream” (not zip-only wording)
  - Extract endpoint docs now reflect ZIP/7Z/RAR support
  - File share supports view=1 landing page + inline=1 for safe types
  - Shared folder APIs documented for path= (subfolders) + new shared folder zip download endpoint
  - New thumbnail endpoint documented (/api/file/thumbnail.php)
- OpenAPI info.version bumped to 3.2.2

---

## Changes 01/28/2026 (v3.2.0 & v3.2.1)

`release(v3.2.1): fix asset stamper to stamp src/ templates + APP_QVER placeholders`

- stamp-assets: include src/ alongside public/ for stamping
- stamp-assets: replace {{APP_QVER}} in HTML/CSS/PHP templates and validate no placeholders remain

`release(v3.2.0): share pages revamp + portals browse/download-all + Pro branding upgrades`

**Commit message**  

```text
release(v3.2.0): share pages revamp + portals browse/download-all + Pro branding upgrades

- shares: modern Dropbox-like share UI (file + folder), safe inline previews, and optional subfolder access
- portals: subfolder browsing + pagination, list/gallery toggle, download-all zip, resumable uploads, submission IDs
- branding (Pro): meta description + favicons + theme colors + login/app backgrounds + share/portal branding
- security: sanitize footer HTML; tighten shared uploads with per-share upload token; validate share/portal paths
```

**Added**  

- **Shares (Core)**
  - **Folder shares** can optionally **include subfolders** (`allowSubfolders`) when creating the link.
  - Shared folder browsing supports `path=` for subfolder navigation (when enabled).
  - New public endpoint: **`GET /api/folder/downloadSharedFolder.php`** to download a shared folder (or subfolder) as a ZIP **(local storage only)**.
  - Shared downloads support `inline=1` for safe types (images/video/audio/pdf) and **never inline SVG**.

- **Share UI revamp (Core)**
  - New modern share layout + styles in `public/css/share.css` (folder + file share views).
  - Shared folder now supports:
    - **Download all**
    - **List/Gallery toggle**
    - **Search within the shared folder**
    - **Breadcrumbs** when subfolder browsing is enabled
    - Optional XHR upload progress UI for shared-folder uploads
  - File shares now generate a link that defaults to a landing page (`&view=1`) with metadata + preview.

- **Portals (Pro)**
  - New API: **`GET /api/pro/portals/listEntries.php`** (folders + files, pagination, optional “all files” mode).
  - Portal UI now supports:
    - **Subfolder browsing** (optional, per portal) using `?path=...`
    - **Breadcrumbs + pagination**
    - **List/Gallery toggle**
    - **Download all** (queues a ZIP via `/api/file/downloadZip.php`)
    - **Resumable uploads** for portals (with standard upload fallback)
    - Optional **Submission ID** tracking + show in thank-you screen
    - **5 New preset templates**

- **Branding upgrades (Pro)**
  - Admin branding now supports:
    - **Meta description**
    - **Favicons** (SVG/PNG/ICO), **Apple touch icon**, **Safari pinned mask icon + color**
    - **Theme color** (light/dark) for browser UI
    - **Login background** (light/dark) and **App background** (light/dark)
    - Optional **login tagline**
  - New `public/js/shareBranding.js` applies Pro branding to share pages (logo, accents, footer, icons, theme-color).
  - New `public/index.php` can serve `index.html` with branding meta/favicons applied (via `.htaccess` DirectoryIndex).

**Changed**  

- **Shared folder data model**
  - Shared folder listing now returns a unified `entries[]` array (folders + files), plus `shareRoot`, `path`, and `allowSubfolders`.
  - Shared file download supports `path=subfolder/file.ext` (with subfolder gating).

- **Shared uploads hardening**
  - Shared-folder upload POST now supports `pass` + `path` and includes a per-share **`share_upload_token`** guard (HMAC) to reduce abuse.

- **Portal uploads enforcement**
  - Portal uploads are enforced server-side:
    - Must stay within the portal’s configured folder
    - Subfolder uploads are blocked unless the portal enables them
    - Portal sourceId must match (when configured)

- **Portals admin UX**
  - Adds portal theme presets (new industries), per-portal theme override fields, and portal logo field.
  - Adds “portal user” controls (optional per-portal user + password, preset modes).

- **Branding plumbing**
  - `main.js` now applies branding meta + icons + theme color + backgrounds, and **sanitizes footer HTML** before injecting.

**Fixed**  

- Shared folder password form and file share password form now use the unified share UI and preserve `path` when prompting.
- `downloadZip` now supports passing an explicit `sourceId` (local sources) by running inside a source context.
- Various base-path issues resolved for share/portal JS/CSS includes by using `withBase()` and versioned assets.

**Security**  

- Share and portal subpaths are normalized/validated (no `..`, invalid segments).
- Shared downloads: SVG/SVGZ are always attachment-only (defense in depth).
- Footer branding HTML is sanitized (allowlist) before inserting into DOM.

**Notes**  

- `downloadSharedFolder.php` only supports **local** storage; remote adapters return a clear error.
- Portals “download all” depends on ZIP being enabled for the account + server having the needed tooling for ZIP/7z where applicable.

---

## Changes 01/24/2026 (v3.1.7)

`release(v3.1.7): fix table header select-all checkbox + Pro bundle install progress UI (closes #99)`

**Commit message**  

```text
release(v3.1.7): fix table header select-all checkbox + Pro bundle install progress UI (closes #99)

- file list fix header select-all checkbox robust click handling + sync state
- file list preserve file selections when table re-renders after folder strip loads
- admin show transfer progress for Pro bundle upload/download install actions

Closes #99
```

**Fixed**  

- **#99:** The checkbox left of the **Name** column now correctly toggles “select all” in table view.
  - Uses a stable selector (`.select-all` + `data-select-all`) and robust click handling (checkbox + header cell click).
  - Keeps the header checkbox state synced (checked/indeterminate) as individual rows change.
  - Excludes folder rows from file “select all” so only file rows are toggled.

**Changed**  

- **Selection preservation on table refresh**
  - When subfolders are loaded and the table view re-renders (inline folders above files), existing file selections are preserved.
- **Pro bundle install UX**
  - Admin “Upload Pro bundle” and “Download latest Pro bundle” actions now use the existing transfer progress UI (minimizable card) and surface success/failure cleanly.

---

## Changes 01/24/2026 (v3.1.5 & v3.1.6)

`release(v3.1.6): CodeQL fix for error handling (strip HTML safely in fileActions)`
`release(v3.1.5): Pro Sources adds OneDrive + Dropbox + source-aware UX fixes`

**Commit message**  

```text
release(v3.1.5): Pro Sources adds OneDrive + Dropbox + source-aware UX fixes

- Pro v1.6.0 adds OneDrive + Dropbox storage adapters/sources
- core wire onedrive/dropbox adapters in StorageFactory and extend remote-indexing skip list
- UI make previews/downloads/editor source-aware + add loading/busy feedback for create/delete/preview
- ACL support group grants per source (grantsBySource) incl. Group ACL modal source selector
- misc harden adapter error reporting + fix trash auto-purge + portal doc title
```

**Added**  

- **Pro v1.6.0 Sources:** **OneDrive** + **Dropbox** adapters (new source types).
- **Admin → Sources UI** fields and setup hints for OneDrive + Dropbox:
  - OneDrive: client id/secret/refresh token, tenant, driveId/siteId, optional root path
  - Dropbox: app key/secret/refresh token, optional root path + business team fields
- **Group ACL per source**
  - Group data supports `grantsBySource` to scope group folder grants to a specific source
  - Group ACL modal now includes a **Source selector** so you can edit grants per source
- **UX feedback**
  - Busy/disabled states for **Create folder** and **Create file**
  - Preview overlays show a **loading indicator** and “preview not available” error state
  - Delete flow integrates with transfer progress UI (shows totals + completion status)

**Changed**  

- **Source-aware file list metadata**
  - File list responses now include `sourceId`
  - Each file entry includes `sourceId` so frontend can build correct URLs
- **Preview/Download URLs now include `sourceId`**
  - Preview, snippet fetch, gallery thumbnails, queued downloads, and file menu actions now pass the correct source id
- **Editor improvements**
  - Editor accepts `sourceId` + `sizeBytes` hint, shows a loading pill, supports aborting previous loads, and adds a “Saving…” state
  - Remote sources skip size probing that relies on Range/HEAD when not reliable
- **Remote source performance guards**
  - Treats `ftp/sftp/webdav/smb/gdrive/onedrive/dropbox` as “slow remote sources” and skips folder stats/peek probes for them
- **FileController hardening**
  - `saveFile` is source-aware (supports `sourceId`, blocks disabled sources for non-admins, blocks read-only sources)
  - `downloadFile` ensures session is active; streaming uses `set_time_limit(0)` and improved adapter error detail messages
  - Range openReadStream now only applies offset/length when a Range is actually requested
- **S3 hints**
  - Sources hint text expanded to call out common S3-compatible providers (Wasabi/MinIO/B2/Spaces/R2)
- **Portals**
  - `portal_doc_title` changed to just `{title}` (lets the portal title stand alone)

**Fixed**  

- **Trash auto-purge** now correctly handles API responses that return `{ items: [...] }` instead of a raw array.
- **Folder tree init order:** load folder tree after the source selector finishes initializing (prevents race conditions on boot).
- **Group grants visibility** and save paths now keep `grantsBySource` intact when admin saves groups.
- **Preview stability on Sources**
  - Prevents “wrong source” previews/downloads when panes/sources differ or when file metadata lacks a direct sourceId.

**Notes**  

- OneDrive/Dropbox are **Pro Sources** (requires Pro bundle v1.6.0+).
- Some remote sources don’t support “Trash” semantics; behavior remains backend-dependent (Drive already notes permanent deletes).
- For best results, keep OneDrive/Dropbox root paths scoped (optional) so listings remain snappy.

---

## Changes 01/20/2026 (v3.1.4)

`release(v3.1.4): restore resumable upload resume checks (testChunks) + wording polish (fixes #93)`

```text
release(v3.1.4): restore resumable upload resume checks (testChunks) + wording polish (fixes #93)

- uploads: re-enable Resumable.js testChunks so interrupted uploads can resume
- admin: tweak Instance ID / renewal copy to “12-month updates” wording

Fixes #93
```

**Fixed**  

- Resumable uploads resume again (fixes #93)
- Re-enabled testChunks in Resumable.js so the uploader checks which chunks already exist and continues where it left off after an interrupted upload.

**Changed**  

- Admin Pro license UI wording
- Updated copy to say “12-month updates plans” and “Renew 12-month updates” (clarifies it’s not a forced yearly subscription).

---

## Changes 01/20/2026 (v3.1.3)

`release(v3.1.3): document VIRUS_SCAN_EXCLUDE_DIRS for ClamAV upload scanning`

`release(v3.1.3): ClamAV exclude paths (Admin + env) for upload scanning (answers #94)`

**Commit message**  

```text
release(v3.1.3): ClamAV exclude paths (Admin + env) for upload scanning (answers #94)

- add VIRUS_SCAN_EXCLUDE_DIRS (env) + Admin setting to exclude upload paths from ClamAV scanning
- support comma/newline-separated exclude paths relative to the source root
- allow per-source excludes via `sourceId:/path` prefixes (Pro Sources)
- apply excludes in UploadModel scan flow (local + shared-folder uploads) and lock Admin field when env is set
```

**Added**  

- **ClamAV exclude paths setting**
  - Admin setting: **Exclude upload paths** (`clamav.excludeDirs`)
  - Env override: `VIRUS_SCAN_EXCLUDE_DIRS` (locks the Admin field when set)
  - Input format: comma or newline-separated paths **relative to the source root**
    - Examples: `snapshot`, `tmp`
    - Pro Sources: prefix with a source id: `s3:/snapshot`, `gdrive:/tmp`

**Changed**  

- **Upload virus scan now checks excludes before running ClamAV**
  - Exclude rules are normalized (trim, normalize slashes, strip leading/trailing `/`)
  - Rules can optionally target a specific source id; otherwise they apply to the active source
- **Shared-folder uploads pass folder context into the scan**
  - Shared uploads now reuse the same exclude logic by providing the destination folder key.

**Notes**  

- Excludes match against the *destination folder path* (relative to the source root). Keep patterns simple (short paths) for predictable behavior.
- If `VIRUS_SCAN_EXCLUDE_DIRS` is set, it is treated as the source of truth and the Admin field is read-only.

---

## Changes 01/20/2026 (v3.1.2)

`release(v3.1.2): configurable ignore rules for indexing/tree + admin UX polish (fixes #91, refs #92)`

**Commit message**  

```text
release(v3.1.2): configurable ignore rules for indexing/tree + admin UX polish (fixes #91, refs #92)

- add ignoreRegex setting (admin config) with env override FR_IGNORE_REGEX to hide folders from tree/counts/indexing
- add snapshot preset helper for common NAS snapshot paths (fixes #91)
- unify ignore logic via FS::shouldIgnoreEntry across folder counts, tree listing, and disk usage scans
- admin: improve settings search UX (clear button) + smoother section header styling
- UI: polish header dock collapse/expand icon animations (landing/lift + reduced-motion support)

Fixes #91
Refs #92

Co-authored-by: nikp123 <nikp123@e.email>
```

**Added**  

- **Indexing ignore rules (regex)**:
  - Admin setting: **Ignore paths (regex)** (`ignoreRegex`) — one pattern per line.
  - Env override: `FR_IGNORE_REGEX` (locks the field when set).
  - Built-in “quick add” button for a common snapshot preset: `(^|/)(@?snapshots?)(/|$)` (helps with NAS snapshot dirs).
- **Centralized ignore helper**:
  - `FS::shouldIgnoreEntry($name, $parentRel)` applies built-in ignores plus optional regex patterns.

**Changed**  

- **Folder tree / listing / counts now share ignore logic**:
  - Replaced scattered ignore arrays with `FS::shouldIgnoreEntry(...)` in folder enumeration paths.
- **Disk usage scan now filters earlier**:
  - Uses a `RecursiveCallbackFilterIterator` so ignored entries are skipped before deeper traversal.
- **Admin Panel UX**:
  - Settings search now includes a dedicated clear (X) button that appears only when a query exists.
  - Section headers now render via a `.section-header-inner` wrapper for cleaner layout/hover/active styles.
  - Audit table area now caps height and scrolls to avoid huge modal growth.
- **Header dock polish**:
  - Adds “lift” and “land” animations for header dock icon buttons during card collapse/expand.
  - Respects `prefers-reduced-motion`.

**Fixed**  

- **#91:** Snapshot folders (e.g., `snapshot`, `@snapshots`) can now be excluded cleanly from the tree, counts, indexing, and disk usage views via ignore rules.
- Prevents “stuck landing” icon states by cleaning up animation classes/inline vars on `animationend`.

**Notes**  

- Ignore rules are applied frequently during tree/list/count operations. Keep patterns simple to avoid expensive regexes.
- Invalid regex lines are ignored safely (and won’t crash listing/indexing).

---

## Changes 01/17/2026 (v3.1.1)

`release(v3.1.1): OIDC env overrides + configurable resumable chunk size + clearer startup logs (closes #86, closes #87, closes #90)`

**Commit message**  

```text
release(v3.1.1): OIDC env overrides + configurable resumable chunk size + clearer startup logs (closes #86, closes #87, closes #90)

- config: allow env overrides for OIDC knobs (auto-create, group claim, admin group, Pro group prefix)
- uploads: add configurable Resumable.js chunk size (Admin + siteConfig) and honor it in upload.js
- uploads: improve relative-path folder uploads and remote staging/cleanup for non-local sources
- admin: add settings search + smoother section open/close animations
- admin: restrict Pro license actions to the registered/primary admin user
- remote storage: add FR_REMOTE_DIR_MARKER to preserve empty dirs; skip Trash on Google Drive sources
- UX: clearer “FileRise startup complete” log line + better long-running delete/restore/loading feedback

Closes #86
Closes #87
Closes #90
```

**Added**  

- **OIDC env overrides** (in addition to config defaults):  
  `FR_OIDC_AUTO_CREATE`, `FR_OIDC_GROUP_CLAIM`, `FR_OIDC_ADMIN_GROUP`, `FR_OIDC_PRO_GROUP_PREFIX`.
- **Upload tuning (Admin):** “Resumable chunk size (MB)” (0.5–100 MB).  
  Exported via siteConfig so the frontend can size chunks dynamically.
- **Remote folder marker:** `FR_REMOTE_DIR_MARKER` (default: `.filerise_keep`) to preserve empty remote folders (S3-style prefix backends).
- **Admin settings search:** quick filter for sections/settings in the Admin panel UI.

**Changed**  

- **Resumable uploads honor configured chunk size** (used by file picker + drag/drop when Resumable is available).
- **Upload handling for folder paths**:
  - validates and sanitizes `resumableRelativePath` / `relativePath`
  - supports subfolder uploads more consistently
  - remote sources stage chunks in meta root (`uploadtmp/`) and push via adapter, then cleanup temp folders
- **Admin Pro license visibility/actions** are restricted to the **primary/registered admin** (first admin in `users.txt` order).
- **Remote deletes / Trash behavior**:
  - Google Drive sources skip Trash (deletes are permanent)
  - remote folder “empty checks” ignore the marker file
- **Docker startup log clarity**:
  - `start.sh` prints a “startup complete” line and clarifies that further output is Apache logs.

**Fixed**  

- **#86:** OIDC behavior is now controllable via environment variables (no code/config edits required).
- **#87:** Resumable chunk size is now configurable to fit proxy limits (e.g., tunnels/CDNs).
- **#90:** Clearer startup output + better guidance for collecting logs.
- **UI responsiveness / long operations**
  - “Deleting…” busy states for file/folder delete confirmations and Trash restore/delete actions
  - “Still loading…” toast for slow remote listings, with a fallback if a folder no longer exists

**Notes**  

- `FR_REMOTE_DIR_MARKER` is best-effort and primarily intended for remote backends that treat directories as prefixes (e.g., S3).
- Google Drive sources do not support Trash semantics in the adapter; the UI notes this and deletes are permanent.
- Some Admin Panel strings still fall back to English; translations will continue to improve over time.

---

## Changes 01/16/2026 (v3.1.0)

`release(v3.1.0): default language + portal i18n + ffmpeg path config (closes #88, closes #89)`

**Commit message**  

```text
release(v3.1.0): default language + portal i18n + ffmpeg path config (closes #88, closes #89)

- Admin: add “Default language” setting (used when a user has not chosen a language yet)
- Admin: add optional FFmpeg binary path setting (env FR_FFMPEG_PATH overrides / locks)
- Thumbnails: resolve ffmpeg path from env first, then admin config, then PATH
- Portals: add language selector + apply defaultLanguage from siteConfig on first run
- Portals: fix button styling (accent-aware) + refresh button color (fixes #88)
- i18n: split locales into separate files and add Polish/Russian/Japanese; refresh German strings (fixes #89)
- UI: replace hardcoded upload/login alerts/toasts with i18n keys for better translation coverage

Closes #88
Closes #89
```

**Added**  

- **Admin setting: Default language**
  - New `display.defaultLanguage` config surfaced in Admin → Header/File List/Language section.
  - Used automatically when a user has not chosen a language yet.
- **Admin setting: FFmpeg binary path (optional)**
  - New `ffmpegPath` config for video thumbnail generation.
  - `FR_FFMPEG_PATH` remains the source of truth when set (admin field becomes read-only).
- **New locales shipped**
  - **Polish (pl)**, **Russian (ru)**, **Japanese (ja)**, plus **Simplified Chinese (zh-CN)** locale file.
- **Portal language selector**
  - Added a language dropdown to both **portal.html** and **portal-login.html**.

**Changed**  

- **FFmpeg resolution order for thumbnails**
  - `FR_FFMPEG_PATH` → admin `ffmpegPath` → fallback to `ffmpeg` from PATH (and standard locations).
  - This keeps the Docker image lean while still supporting thumbnails when ffmpeg exists on the host/container.
- **Portals now inherit default language**
  - If `localStorage.language` is missing, portals fetch `/api/siteConfig.php` and apply `display.defaultLanguage`.
- **Translations architecture**
  - Locales are now maintained in dedicated files under `public/js/i18n/locales/` lazy load instead of a giant embedded map.
  - Added missing i18n keys for upload flows and admin/pro toasts to reduce English-only strings.

**Fixed**  

- **Portal button styling / colors** (fixes #88)
  - Portal buttons now use accent-aware classes (`portal-btn-primary` / `portal-btn-outline`) and render correctly across themes.
- **German translation gaps** (fixes #89)
  - German strings were refreshed and missing UI keys were added/normalized.
- **More consistent i18n coverage**
  - Upload-related toasts and some boot/login alerts now use translation keys instead of hardcoded English.

**Notes**  

- There are still parts of the Admin Panel and some edge UI strings that may fall back to English. This release fixes the reported German issues and adds new locales, but translation coverage will continue to improve over time.
- If you want video thumbnails in Docker without bundling ffmpeg, mount a host ffmpeg binary or install it in your own derived image and set `FR_FFMPEG_PATH` (or set the path in Admin).

---

## Changes 01/15/2026 (v3.0.2)

`release(v3.0.2): ffmpeg-backed video thumbnails (Docker) + new thumbnail API (closes #79)`

**Commit message**  

```text
release(v3.0.2): ffmpeg-backed video thumbnails (Docker) + new thumbnail API (closes #79)

- Docker: ship ffmpeg so video thumbnails work out-of-the-box in container installs
- add /api/file/thumbnail.php endpoint to generate + cache JPEG thumbnails for video files
- UI: use ffmpeg-backed thumbnails for hover previews + gallery cards (fallback to movie icon)
- harden query param parsing for file endpoints (avoid array/querystring edge cases)
- docs: add FFmpeg + archive tools to THIRD_PARTY notices

Closes #79
```

**Added**  

- **Video thumbnail API endpoint:** `GET /api/file/thumbnail.php?folder=...&file=...`  
  Returns a cached **JPEG** thumbnail for supported video files.
- **Server-side thumbnail generator** (local sources only):
  - Uses `ffmpeg` to extract a frame and writes it into a meta-root cache (`thumb_cache/`).
  - Cache key includes file path + mtime + size + thumb dimensions for stable reuse.
  - Optional env tuning:
    - `FR_FFMPEG_PATH` (override ffmpeg path)
    - `FR_VIDEO_THUMB_MAX_W`, `FR_VIDEO_THUMB_MAX_H` (thumbnail max size)
- **Docker image now installs `ffmpeg`** so thumbnails work in Docker/Unraid without extra setup.

**Changed**  

- **Hover preview video thumbs** now use the thumbnail API instead of `<video preload="metadata">` seeking.
- **Gallery view video cards** now render an `<img>` thumbnail with a play overlay; falls back to the movie icon on error.
- **Thumbnail generation respects your existing “max video preview size (MB)” setting**:
  - If a video exceeds the configured cap, the thumbnail endpoint returns “too large”.
- **Source-aware behavior (when Sources is enabled):**

**Security / Hardening**  

- Thumbnails are only generated for authenticated users and still enforce:
  - ACL read rules (and read_own ownership checks where applicable)
  - no thumbnails for encrypted files
- Cache responses include `X-Content-Type-Options: nosniff` and a private cache policy.

**Docs / Compliance**  

- Updated `THIRD_PARTY.md` to mention Docker-bundled system packages:
  - FFmpeg (LGPL-2.1+; builds may include GPL components)
  - p7zip / unar (for archive handling)

---

## Changes 01/14/2026 (v3.0.1 Archive update + login focus)

`release(v3.0.1): archive create/extract upgrades (7z + RAR via unar) + login focus fix (closes #82)`

**Commit message**  

```text
release(v3.0.1): archive create/extract upgrades (7z + RAR via unar) + login focus fix (closes #82)

- add 7z archive format option for multi-file downloads (worker + download streaming)
- expand extraction to support ZIP + 7z formats via 7z, with RAR preferring unar when available
- harden archive extraction against traversal, symlinks, zip-bombs, and empty/escaped outputs
- improve archive job robustness (stale job cleanup, clearer queued/worker errors, correct MIME/filenames)
- UI: archive format selector + name normalization, better “Extract Archive” handling, i18n updates
- fix login screen focus (auto-focus username when login prompt shows)

Closes #82
```

**Added**  

- **Archive download format selector (ZIP / 7z)** in the “Download Selected Files as Archive” modal.
- **7z archive creation** support in the background worker (`zip_worker.php`) using `7zz/7z`.
- **RAR extraction prefers `unar`** when available (FOSS-friendly); falls back to `7z` when needed.
- **Archive detection helper** `isArchiveFileName()` supporting:
  - `.zip`, `.7z`, `.tar.*`, `.gz`, `.bz2`, `.xz`, `.rar`
  - RAR split parts like `.r01`, `.r02`, etc.

**Changed**  

- **“ZIP” language → “Archive” language** across UI, admin notes, and translations.
- **Archive job enqueue + download endpoint** now supports a `format` field (`zip` or `7z`):
  - download streaming sets correct extension + MIME type (`application/zip` or `application/x-7z-compressed`)
  - filename normalization strips any existing `.zip/.7z` and applies the chosen extension
- **Archive extraction** is no longer ZIP-only:
  - ZIP still uses `ZipArchive`
  - non-ZIP formats use `7z` listing (`7z l -slt`) + extraction of an allow-listed set
  - RAR parts like `.r01` map to their base `.rar` / `.part1.rar` automatically
- **Archive queue robustness**
  - stale queued/working jobs are cleaned up (PID checks + cmdline sanity where available)
  - queued jobs that never start can surface a clearer error message (“worker did not start…”)

**Fixed**  

- **Login UX:** auto-focus username field when the login prompt appears (reduces “why can’t I type?” friction).
- **Extract action visibility:** Extract button/menu now appears for supported archive formats (not just `.zip`).
- **Better extraction feedback:** extraction API returns optional `warning` text; UI shows success + warning separately when partial issues occur.

**Security / Hardening**  

- **Archive extraction safety controls**:
  - blocks absolute paths / traversal (`../`) and unsupported folder names
  - skips dotfiles (configurable) instead of extracting hidden entries by default
  - detects and skips symlinks and removes any symlinks created during extraction
  - zip-bomb limits: max uncompressed bytes + max files (configurable)
  - prunes empty outputs that indicate partial/broken extraction and removes any files that escape the extraction root

**Docker**  

- Image now installs **7zip + unar** so archive create/extract works out-of-the-box with FOSS tooling.
- Ubuntu repo components are restricted to **`main universe`** (avoids non-free repos by default).

---

## Changes 1/11/2026 (V3.0.0)

`release(v3.0.0): storage adapter seam + source-aware core (Sources-ready)`

- Display file size for items thumbnail view (closes #85)
- add StorageAdapterInterface + LocalFsAdapter and StorageFactory/StorageRegistry
- introduce SourceContext (active source, per-source upload/meta/trash roots, read-only gating)
- make core file/folder ops source-aware (uploads, downloads, shares, trash, portals, OnlyOffice)
- add cross-source copy/move for files + folders with guardrails and audit logging
- add source selector UI + visible-sources API and propagate sourceId through UI flows
- add minimizable transfer progress UI and toast severity styling
- add Pro API-level gating + bundle installer refactor + one-click Pro bundle download/install

### v3.0.0 Highlights

- **Storage adapter seam** landed in core, enabling FileRise to operate against different backends through a consistent interface.
- Core is now **source-aware end-to-end** (UI + API + backend), so Pro “Sources” can plug in cleanly while Core remains local-first by default.
- Major **performance improvements** for folder trees and listings (especially in remote/large-tree scenarios).
- **Cross-source copy/move** works for both files and folders with explicit guardrails.
- New UX polish: **transfer progress card** + **toast severity styling**.

### Core architecture

**Storage adapter layer**  

- Added a formal adapter interface and default local implementation:
  - `StorageAdapterInterface`
  - `LocalFsAdapter`
- Added adapter orchestration:
  - `StorageFactory` to instantiate adapters for the active source
  - `StorageRegistry` to cache/reuse adapter instances
- Added source/session plumbing:
  - `SourceContext` to resolve active source + per-source roots (upload/meta/trash) and carry read-only state
  - `ReadOnlyAdapter` wrapper to enforce read-only sources at the adapter boundary

**Outcome:** core file/folder operations no longer assume a single local filesystem root.

### Sources support (core plumbing + UI/APIs)

**UI**  

- Added a **Sources selector manager** (`public/js/sourceManager.js`) and wired it into the main app bootstrap so the UI can:
  - load visible sources
  - persist/restore active selection
  - notify the rest of the UI on source changes

**APIs (core-side endpoints, Pro-gated at runtime)**  

- Added/expanded source endpoints under `/api/pro/sources/`:
  - `visible.php` (what the current user can see/select)
  - `select.php` (set active source)
  - `list.php`, `save.php`, `delete.php` (admin management)
  - `test.php` (connection test action)

**Source-aware request threading**  

- Threaded `sourceId` through many UI and API flows so reads/writes execute under the correct adapter context (including inactive dual-pane reads).

### File operations

**Cross-source copy/move**  

- Implemented **cross-source file copy/move** (adapter → adapter) with safe fallbacks.
- Implemented **cross-source folder copy/move** (recursive) with explicit guardrails:
  - `FR_XCOPY_MAX_FILES`
  - `FR_XCOPY_MAX_BYTES`
  - `FR_XCOPY_MAX_DEPTH`
- Added safety rules:
  - block writes when destination is read-only
  - enforce scope/ACL/ownership rules consistently
  - block operations in encrypted folders when not supported by the active backend

**Transfers UX**  

- Added a **global, minimizable transfer progress card** (`transferProgress.js`)
  - percent + speed where size is known
  - indeterminate progress where size is unknown
  - hooks wired into copy/move modals + drag/drop flows

### Uploads / Downloads / Streaming

**Uploads**  

- Upload pipeline is now adapter-aware and source-aware.
- Enforces read-only sources and other capability limits server-side.
- Remote backends can be staged and written via adapter `writeStream()` when applicable.

**Downloads**  

- Download streaming is adapter-aware (local vs remote) and supports Range behavior where possible:
  - `Accept-Ranges`, `Content-Range`, 206/416 handling
- Shared link flows were updated to resolve files within the correct source context.

### Folder tree + listing performance

**Reduced fan-out and expensive probes**  

- Added/expanded **shallow listing paths** to avoid accidental deep scans for huge remote trees.
- Introduced optimizations to reduce per-entry stat calls when list results already provide enough metadata.
- Kept the “large tree” goal intact (no regressions intended for very large folder counts).

### Search / Pro feature gating (core-side)

**Search Everywhere integration**  

- Updated core wiring so Search Everywhere can operate in a **source-aware** manner (including “All sources” behavior when enabled).

**Pro gating by API level**  

- Added/expanded **Pro API level** gating logic (`FR_PRO_API_LEVEL`) so features can be enabled/disabled safely without brittle version-string comparisons.

**Admin + maintenance plumbing**  

- Expanded admin plumbing around Pro state, license fields, and feature availability.
- Added/updated Pro bundle management wiring (including download/install paths) to support smoother Pro updates without breaking offline installs.

**UX polish**  

- Toasts now support **severity/tone** (success / info / warning / error) and consistent styling.
- Various UI flows updated to use the improved toast semantics.

**Notes / behavioral considerations**  

- This release introduces a major internal architecture shift (adapter seam + source context).
- Many endpoints now accept `sourceId` (optional in most cases; defaults to the current/legacy local behavior).
- Remote backends may have feature limitations compared to local FS (e.g., ZIP/encryption-at-rest behaviors depending on backend support).

FileRise v3.0.0 is a major internal milestone: a new storage adapter seam + source-aware core that unlocks Pro “Sources” (multi-backend) while keeping Core local-first and fast. Expect continued iteration on adapter edge cases and remote performance tuning.

---

## Changes 1/2/2026 (v2.13.1)

`release(v2.13.1): harden Docker startup perms + explicit inline MIME mapping (see #79)`

**Fixes**  

- Prevent Docker container startup from exiting when `chown/chmod` are unsupported (exFAT/NTFS/CIFS/NFS root_squash, non-root runs). Startup now logs warnings and continues.
- Add non-fatal permission writeability hints for `/var/www/{uploads,users,metadata,sessions}` to help diagnose mount/UID issues.

**Improvements**  

- Serve inline-safe images/audio/video with explicit MIME mapping to avoid `nosniff` + `application/octet-stream` preview issues (more reliable inline previews).

**Docs**  

- Add AI disclosure section to README.

---

## Changes 12/30/2025 (v2.13.0)

`release(v2.13.0): inline rename + video preview limits + folder tree perf (see #79)`

**Added**  

- **Inline rename**:
  - File list inline rename (table view) + context-menu support
  - Folder tree inline rename (tree context menu + Rename button)
  - Keyboard shortcuts: **F2 rename**, plus **Ctrl/Cmd+Shift+N** (new folder)
- **Admin Panel setting (Display):** Hover preview max video size (MB)
  - Applies to hover previews + Gallery video thumbnails
- Folder APIs:
  - `GET /api/folder/getFolderList.php?counts=0` to skip metadata count reads (faster on large trees)
  - `GET /api/folder/listChildren.php?probe=0` to skip per-child “has subfolders / non-empty” probing (faster)

**Changed**  

- Hover previews & Gallery video thumbs:
  - Use the new video size limit setting
  - Improved “no preview available” fallback when a frame can’t be decoded quickly
- File streaming:
  - Improved HTTP Range support (incl. suffix ranges like `bytes=-500`)
  - Expanded safe inline rendering to allowlisted video/audio types when requested (`inline=1`)

**Fixed**  

- Context menus now position correctly using `clientX/clientY` (more reliable across layouts).
- Blank folder icons are repaired after drag/drop moves and dual-pane refreshes.
- Admin “Folder Access” modal help text is now collapsible (“More/Less”) for readability.

**Performance**  

- Reduced IO for large installs by:
  - Avoiding folder count reads when not needed (`counts=0`)
  - Avoiding directory iterator probes when not needed (`probe=0`)

---

## Changes 12/29/2025 (v2.12.1)

`release(v2.12.1): folder summary depth + video thumbnails + dual-pane toggle fix`

`Closes #79, #80, #81`

**Added**  

- **Admin Panel setting:** *Display → File list summary depth*  
  Limits how deep recursive folder totals (files/folders/bytes) will traverse to keep the UI fast on huge trees.
- Video thumbnails in Gallery view (best-effort frame capture with safe fallbacks for very large videos).
- Folder stats API support for depth-limited recursion (`deep=1&depth=N`).

**Changed**  

- Recursive folder counting is now depth-aware and avoids unnecessary descendant probes when depth is capped.
- Folder summary caching now keys by `(folder + depth)` and invalidates correctly after moves/changes.

**Fixed**  

- View Options dual-pane toggle now shows the active “blue” state correctly in dark mode.
- Gallery video preview initialization improved (more reliable thumb generation / preview frame selection).

---

## Changes 12/28/2025 (v2.12.0)

`release(v2.12.0): dual-pane mode + keyboard shortcuts`

**Added**  

- **Dual-pane mode** for the file list (left/right panes) with per-pane folder state, active-pane switching, and persisted last folders.
- Dual-pane toggle in **User Panel** and in the **View Options** popover.
- **Keyboard shortcuts** (ignored when a modal is open or when typing):
  - `/` focus search
  - `?` show shortcuts hint
  - `Delete` delete selected (folder delete if a folder is selected)
  - `F3` preview
  - `F4` edit (when editable)
  - `F5` copy
  - `F6` move
  - `F7` new folder
  - `F8` delete selected
- **Folder summary pill** showing folders/files/size, with optional **deep totals** (recursive) via `deep=1`.
- Modal accessibility helpers:
  - Focus trap within modals
  - Restore focus to opener when closing
  - `Escape` closes the topmost visible modal
- New i18n strings for dual-pane hints + an `filerise:i18n-applied` event to refresh UI text after locale changes.

**Changed**  

- Folder stats endpoint now supports returning **recursive totals** (folders/files/bytes) when requested (`deep=1`), computed ACL-aware and with a scan cap to avoid runaway traversal.
- Copy/Move UX in dual-pane prefers the **other pane’s folder** as the default destination when applicable.
- Dual-pane layout + file list controls are now more responsive (pane width classes, improved pagination/search wrapping).
- Breadcrumb separators adjusted for clearer spacing.

**Fixed**  

- Better correctness in multi-pane contexts:
  - Folder icons/strip refresh across both panes.
  - Hover preview resolves files using the correct pane’s file data.
  - Folder move/file move operations invalidate folder stats and refresh the right UI surfaces.
- Secondary pane is properly hidden on logout / unauthenticated state.

**Notes**  

- Deep folder totals are best-effort and may report as **truncated** for very large trees due to the scan cap (to keep the UI responsive).

---

## Changes 12/26/2025 (v2.11.4)

`release(v2.11.4): OIDC token auth method compatibility + authMethod logging (see #77)`

**Improved OIDC token auth method handling**  

- Add clearer debug output showing the configured token endpoint auth method (authMethod / library default).
- Apply tokenEndpointAuthMethod more robustly across Jumbojett/OpenIDConnectClient versions by attempting:
  - setTokenEndpointAuthMethod()
  - setTokenEndpointAuthMethodsSupported()
  - and a providerConfigParam() fallback to force token_endpoint_auth_methods_supported
  - Helps prevent provider token failures like “client id or secret not provided” when an explicit auth method is required.

---

## Changes 12/26/2025 (v2.11.3)

`release(v2.11.3): fix WebDAV baseUri + audit hook namespace; add OIDC token auth fallback (see #77)`

**Fixed**  

- WebDAV: prevent 500s after WebDAV write operations when audit logging is enabled by calling \AuditHook::log() with the correct (global) namespace from WebDAV nodes.
- WebDAV: improve compatibility with clients hitting legacy paths by auto-detecting and setting the proper SabreDAV baseUri (supports /webdav.php/ and legacy /webdav.php/uploads/ behavior depending on request + filesystem layout).

**Improved**  

- OIDC: add a fallback for older OpenIDConnectClient builds by forcing token_endpoint_auth_methods_supported when setTokenEndpointAuthMethod() isn’t available, helping providers that require an explicit token auth method (e.g., PocketID setups).

---

## Changes 12/24/2025 (v2.11.2)

`release(v2.11.2): fix PocketID OIDC token auth + harden login/WebDAV (closes #77)`

**Fixed**  

- **OIDC / PocketID compatibility:** token endpoint auth now defaults to **`client_secret_basic`** when a client secret exists, and **never attempts `client_secret_*`** when the secret is missing/blank (public client mode). *(Closes #77.)*
- **WebDAV uploads:** stop buffering entire uploads into memory; uploads now stream to a temp file and then replace the target file.
- **WebDAV path safety:** improved uploads path prefix/boundary checks (prevents edge cases like `/uploads` matching `/uploads2`).
- **WebDAV metadata:** uploader no longer defaults to `Unknown` when the WebDAV user is not set.

**Security / Hardening**  

- **Login rate limiting:** rate-limit tracking is now keyed by **IP + username** (instead of only IP) and stale counters are reset after the lockout window.
- **Trusted reverse proxy support:** client IP can be derived from a configured header (e.g. `X-Forwarded-For`) when `REMOTE_ADDR` is a trusted proxy.
- **Fail2ban-friendly logging:** failed logins are written to `users/fail2ban.log` with basic rotation.

**UI**  

- Login screen now shows a clearer tip for definitive failures (e.g., “attempts used” and lockout messaging).

**Configuration**  

- New optional env/config knobs:
  - `FR_TRUSTED_PROXIES` — comma-separated IPs/CIDRs to treat as trusted proxies
  - `FR_IP_HEADER` — header to trust for the real client IP (default: `X-Forwarded-For`)
  - `FR_WEBDAV_MAX_UPLOAD_BYTES` — WebDAV upload size limit in bytes (`0` = unlimited)

**Misc**  

- Updated sponsor list in Admin Panel.

---

## Changes 12/22/2025 (v2.11.1)

`release(v2.11.1): scope dotfile blocking to allow WebDAV dotpaths + add/revise OpenAPI annotations`

- .htaccess: allow dotpaths only for /webdav.php/* while continuing to block hidden files/dirs elsewhere (keeps .well-known exception)
- API: revise endpoints and add OpenAPI 3.0 annotations/spec updates (version 2.11.1)

---

## Changes 12/21/2025 (Core v2.11.0 & Pro v1.4.0)

`release(v2.11.0): add Pro audit logs + configurable hover preview limits`

**Added**  

- **Pro: Audit logging + activity history**
  - New audit logging configuration (enable/level/rotation limits) and a new **Admin Panel → Pro Features** section with filters and CSV export.
  - New endpoints:
    - `GET /api/pro/audit/list.php`
    - `GET /api/pro/audit/exportCsv.php`
- **Audit hooks across the app (best-effort / non-blocking)**
  - A new `AuditHook` shim records core actions when Pro Audit is available.
  - Logs key events from **Web UI**, **WebDAV**, **share links**, and **client portals** (uploads/downloads, folder ops, etc.).
- **Display setting: Hover preview max image size**
  - New `display.hoverPreviewMaxImageMb` setting (clamped) controlling hover previews + gallery thumbnails.

**Changed**  

- Admin Panel: reorganized “Search Everywhere” under **Pro Features** and added audit controls.
- Portal requests now tag downloads/uploads with `source=portal` and the portal slug for attribution.

**Fixed**  

- Folder deletion now also removes explicit ACL entries for the deleted subtree (best-effort cleanup).
- Dark mode styling: number inputs now match other input theming.
- Folder access UI: safer grants handling + improved help text and row styling.

---

## Changes 12/19/2025 (v2.10.5)

`release(v2.10.5): cleanup stale crypto jobs + tighten encryption key-file UX`

- Auto-delete crypto job JSON/lock files when a job completes successfully, preventing orphaned job artifacts.
- Treat long-stale error jobs as gone (return 404 after 7 days) and purge their job files to keep the jobs directory clean.
- Improve admin encryption key controls:
  - Disable “Generate key file” when a key file already exists or when locked by env.
  - Add clearer “force remove key file” confirmation context (why removal is blocked + scan details).

---

## Changes 12/19/2025 (v2.10.2 & v2.10.3 & v2.10.4)

`release(v2.10.4): restrict profile picture uploads to safe image MIME types`

- Validate selected profile pictures are only JPEG/PNG/GIF before preview/upload.
- Show a friendly error toast and abort on unsupported file types.

`release(v2.10.3): harden profile picture preview (blob URL validation + cleanup)`

- Validate the generated ObjectURL is a `blob:` URL before assigning to the preview image.
- Revoke the ObjectURL after the image loads to prevent memory leaks.
- Keep the same user-facing behavior while tightening security hygiene and robustness.

`release(v2.10.2): harden auth + remember-me rotation, user panel, and case-insensitive users`

- Store remember-me tokens hashed (HMAC) and rotate on use; centralize issue/consume/revoke in AuthModel and clear invalid cookies.
- Add auth security regression tests (auto-login, token rotation, expiry) + test-only env overrides for USERS/UPLOAD/META dirs; ignore tests in Docker builds.
- Make username handling case-insensitive and run a one-time users/permissions “canonical case” migration with atomic writes.
- Refactor AuthController login flow (JSON parsing, TOTP step, OIDC flow + group extraction / Pro mapping) for clarity and safer handling.
- Extract the User Panel into its own module (fixed-height modal), add “show hover preview” i18n, and reuse the toggle switch styling.

---

## Changes 12/18/2025 (v2.10.0 & 2.10.1)

`release(v2.10.1): tighten DOM safety & sanitize admin logo URL`

- Fix encrypted folder banner to avoid setting raw innerHTML,
  instead building elements with textContent for safer DOM updates.
- Improve admin panel branding logo URL handling with a
  dedicated sanitizer function that normalizes site-relative paths,
  strips CR/LF, enforces valid http/https, and respects base paths.

`release(v2.10.0): encryption at rest + firewall/proxy settings + subpath/base-path support (closes #73)`

**Added**  

- **Encryption at rest (folder-based)** using libsodium secretstream (XChaCha20-Poly1305), including:
  - Master key support via `FR_ENCRYPTION_MASTER_KEY` or `META_DIR/encryption_master.key`, plus admin UI to generate/clear the key file.
  - Folder encryption metadata tracking (`folder_crypto.json`) with inherited encryption for descendants.
  - Background **encrypt/decrypt jobs** with progress UI (minimizable) and resumable status.

- **Firewall / Proxy settings**: “Published URL” support for correct share-link/redirect generation behind reverse proxies and subpath installs:
  - `FR_PUBLISHED_URL` env override (locks admin field), or admin-config stored `publishedUrl`.

**Changed**  

- **Subpath / base-path installs** now supported end-to-end:
  - Server-side base path detection + helpers (`FR_BASE_PATH`, `X-Forwarded-Prefix`, `fr_with_base_path()`).
  - Frontend base path utilities (`basePath.js`) applied across app, portals, PWA/service worker, and asset URLs (favicons, manifest, fonts).
- Share-link generation now prefers `FR_PUBLISHED_URL_EFFECTIVE` / published URL when present; otherwise uses base-path-aware paths.

**Security / Restrictions (encryption v1 behavior)**  

- When a folder is encrypted (or within an encrypted tree), the following are **disabled/blocked** to prevent leakage of ciphertext or unsupported flows:
  - WebDAV access
  - File/folder sharing + shared-folder uploads/downloads
  - ZIP create/extract operations
  - ONLYOFFICE (editor bypassed)
- Encrypted files download via **on-the-fly decryption** (no HTTP Range support).

**Fixes / Polish**  

- Improve UI behavior in encrypted folders (hide/disable share/zip actions, banner + encrypted badge overlays).
- PWA/service worker + manifest updated to work under subpath scopes.
- Minor robustness improvements (context-menu SVG repair, better upload error toasts, throttled folder stats calls).

---

## Changes 12/17/2025 (v2.9.3)

release(v2.9.3): fix recycle bin button binding, polish trash UI, and improve card dock animations

- Recycle Bin: switch to delegated (capture-phase) click handling so the button still works after folder tree re-renders
- Recycle Bin: remove repeating poll; refresh indicator once on load and expose `refreshRecycleBinIndicator` for explicit callers
- Trash icon: refine recycle SVG “overflow” look and clip area; add deterministic crumple/wobble + new crease paths for paper balls
- Delete action: update recycle bin indicator immediately after delete-to-trash via `updateRecycleBinState(true)`
- Card dock/undock: overhaul ghost rendering to avoid smeared text and respect `--app-zoom`
- Card dock/undock: add material icon overlay during fly animations + add “rise” stage on collapse
- Card expand: reserve top-zone height before animation so the file list resizes before ghosts land; restore + relayout after
- Header UI: apply pill radius styling to header card icons (`.header-card-icon`) to match header buttons

---

## Changes 12/15/2025 (v2.9.0 / v2.9.1 / v2.9.2)

release(v2.9.0): add Pro Search Everywhere, ACL inheritance, and UI polish
release(v2.9.1): Fix selector escaping and safe entity decoding for admin folder access and search
release(v2.9.2): Decode HTML entities without DOM parsing to satisfy CodeQL

**Search Everywhere (Pro)**  

- Backend: Pro search helper builds a JSON index from folder metadata/tags/owners, stores index+manifest with locks/throttling, and enforces ACL (read vs read_own) at query time; new `/api/pro/search/query.php` endpoint for authenticated Pro users.
- Admin UI: Dedicated “Search Everywhere” section with enable toggle, default limit, Pro gating (env lock + v1.3.0+), opt-out persistence, and Pro pill/warnings when missing or outdated.
- Frontend UX: “Search Everywhere” button opens a dark-mode-aware modal; results respect limits/ACL, support reindex hint, and jumping to a hit expands the folder tree, updates breadcrumb, navigates to the folder, and auto-selects/highlights the target row (with retries/HTML entity handling).
- Config/cache: siteConfig regeneration now carries `proSearch` (and Pro status/version) even across upgrades; auto-enable for Pro v1.3.0+ unless explicitly disabled/env-locked; trims/normalizes versions and honors explicit opt-outs.

**ACL Folder Access changes**  

- ACL core (`src/lib/ACL.php`):
  - Adds inherit/explicit maps to folder ACL records, normalizes them, and memoizes `hasGrant` results with cache resets on updates.
  - Group grant checks now honor ancestor inheritance when inherit is set and stop at explicit overrides.
  - Removal/ensure routines clean up inherit entries and initialize explicit/inherit buckets.
- Admin Folder Access UI (`public/js/adminFolderAccess.js`, `public/css/styles.css`):
  - Wider Write/Modify card and denser grid; pill styling for inherit/group notes; switch styling reused for folder grants.
  - Group ACL modal rebuilt to use the shared folder-grants UI; chips for group members; collapsible group cards.
  - Layout/spacing tweaks for rows, cards, and toggles; admin rows locked visually.
- Folder ACL inheritance: explicit child overrides block inherited caps; ancestor inherit is applied only when enabled for the user/group; memoization cleared on ACL writes to avoid stale permissions.
- Group ACL inheritance: ancestor grants with inherit propagate to descendants unless explicitly blocked.

**Sponsor / Thanks section**  

- Added a themed “Thanks” card that spotlights founders/early supporters with pill chips, an anonymous shout-out, and light/dark gradients.
- Refreshed Sponsor and Ko‑fi blocks with icons, dashed highlight containers, and unified copy/open controls to match the new card.
- Kept translation-friendly labels and safe escaping; still allows future supporter list growth.

**Notes**  

- No breaking API changes were introduced; features are additive and compatible with existing configs (auto-fallback to defaults when missing).

---

## Changes 12/14/2025 (v2.8.0)

release(v2.8.0): OIDC public clients + Storage scan log/snapshot controls + sidebar zone order

**Added**  

- **OIDC “Public Client” mode** (no client secret) via new `oidc.publicClient` flag, with automatic secret clearing when enabled.
- Admin UI toggle + guidance for Public Clients (PKCE S256 / token endpoint auth method “none”).
- **Storage / Disk Usage**
  - Centralized scan log path + “tail” reader and snapshot delete helper in `DiskUsageModel`.
  - New admin endpoint: `POST /api/admin/diskUsageDeleteSnapshot.php` (admin-only, best-effort CSRF).
  - Admin Storage UI button **“Delete snapshot”** wired into the panel.

**Improved**  

- OIDC client creation:
  - Trims secrets, sets `clientSecret = null` for public clients.
  - Defaults token endpoint auth to **`none`** for public clients vs **`client_secret_basic`** for confidential clients (unless explicitly overridden).
- Storage scan UX:
  - API includes scan log tail metadata in disk usage summary responses and avoids noisy 404s when snapshot is missing.
  - Trigger scan uses the shared log path, returns `logMtime`, and falls back to a foreground run if background exec fails.
  - Polling detects stalls/timeouts and surfaces log tail/path in the UI.
- Drag/drop zones: persist **sidebar card order** (not just zone placement) + minor animation tuning.
- `FR_OIDC_DEBUG` can now be enabled via env var parsing (`1/true/yes/on`).
- Reduced console noise: `diskUsageChildren` returns HTTP 200 (`ok=false`) for `no_snapshot` instead of 404.

**UI / CSS**  

- `styles.css` cleanup with a table of contents + section headers/comments for easier navigation.

---

## Changes 12/13/2025 (v2.7.1)

release(v2.7.1): harden share endpoint headers + suppress deprecated output

- Replace deprecated FILTER_SANITIZE_STRING token/pass parsing with strict token validation
- Add nosniff + no-cache + restrictive CSP to password prompt response
- Buffer/suppress PHP notices (incl. E_DEPRECATED on PHP 8.4/Termux) in public/api/file/share.php so headers can’t be broken before streaming

---

## Changes 12/13/2025 (v2.7.0)

release(v2.7.0): fix critical SVG XSS on public share links

This release hardens FileRise public share endpoints against stored XSS via SVG files by preventing any SVG/SVGZ content from being rendered inline and by closing “renamed SVG” bypasses (e.g., `evil.png` that is actually SVG).

**Security**  

- **Public file share links (`/api/file/share.php`)**
  - Always force **SVG/SVGZ** to download (`Content-Disposition: attachment`) and serve as `application/octet-stream`
  - Treat **detected SVG MIME** (`image/svg+xml`) as unsafe even when the filename extension is not `.svg` (prevents rename-based bypass)
  - Add defense-in-depth headers on shared responses:
    - `X-Content-Type-Options: nosniff`
    - `Content-Security-Policy: sandbox; default-src 'none'; base-uri 'none'; form-action 'none'`
    - `Cache-Control: no-store, no-cache, must-revalidate`
    - `Pragma: no-cache`

- **Public shared folder downloads (`/api/folder/downloadSharedFile.php`)**
  - Always force **SVG/SVGZ** to download (attachment + octet-stream)
  - Explicit raster MIME mapping (`png/jpg/webp/...`) so gallery previews still render correctly under `nosniff`

- (`/api/file/download.php`)
  - Harden authenticated downloads: treat **.svg/.svgz** (and detected `image/svg+xml`) as unsafe and always force **attachment** with `application/octet-stream` (no inline rendering, even with `?inline=1`), while keeping inline previews limited to the raster allowlist.

**UI**  

- Shared folder gallery view no longer attempts to preview SVG via `<img>` (SVG is download-only).

---

## Changes 12/13/2025 (v2.6.2)

release(v2.6.2): no-access UI hardening + API coalescing + shared-link security

- Fix “no access” state so it **renders safely inside `#fileList`**, hides `#fileListActions`, and avoids null-DOM crashes when the list container isn’t present (root/no-target scenarios).
- Add **capabilities request caching + in-flight de-dupe** to reduce repeated `/api/folder/capabilities.php` calls.
- Improve startup/network behavior by **coalescing noisy GET API calls** (auth, permissions, folder/file lists, siteConfig, onlyoffice status) and ignoring cache-buster query keys for stable request keys.
- Cache `siteConfig` + `OnlyOffice` status with single-flight promises to prevent parallel duplicate requests.
- Limit image hover/gallery thumb previews for very large images (show “preview disabled” instead of trying to render huge thumbs).
- Reduce recycle-bin indicator polling + skip polling when the tab is hidden.
- SECURITY: Shared-file download endpoint now defaults MIME safely, uses `nosniff`, **forces SVG to download (no inline render)**, and only inlines safe raster image types.

---

## Changes 12/13/2025 (v2.6.1)

release(v2.6.1): fix(folderManager): replace Math.random SVG IDs with crypto-based UID helper

- Add makeUid() using crypto.randomUUID() / crypto.getRandomValues() (with counter fallback) to avoid Math.random CodeQL findings.
- Use makeUid() for folderSVG() clipPath IDs and recycleBinSVG() IDs to prevent collisions and satisfy security linting.
- UI: tweak header button + header drop area icon padding for more consistent sizing.

---

## Changes 12/12/2025 (v2.6.0)

release(v2.6.0): Harden downloads and refresh recycle bin + toolbar UX

- Security: block inline SVG rendering for downloads/share links, add `nosniff` headers, tighten share link validation/error handling, and keep ownership checks for own-only reads.
- Added: Recycle Bin entry in the folder tree with live indicator, redesigned recycle modal with accessible list + bulk restore/delete/empty actions, and new recycle translations.
- Changed: File actions toolbar rebuilt with icon-first buttons, inline folder action group, and a view-options popover that hosts zoom/row-height/gallery controls (header zoom removed); header buttons now pill-shaped.
- Improved: Trash handling now uses shared fetch helpers, confirmation flows, auto-refresh of icons, and periodic polling; multi-file download button falls back to individual downloads under a configurable limit before zipping.
- UI/UX: Refreshed restore modal styling, aligned folder row icons/gaps, updated action separators, and capability-driven button enabling based on folder ACLs.

---

## Changes 12/10/2025 (v2.5.2)

release(v2.5.2): new user management hub & relocated shared upload limits

**Admin panel – User Management**  

- Added a new **“Manage users” hub** in the Users section, replacing the old separate “Add user / Remove user / User permissions” buttons.
- Introduced an inline **Add user dropdown card** anchored directly under the “Add user” button:
  - Opens as a small card right under the button.
  - Creates the user via `/api/addUser.php` and auto-selects them in the dropdown on success.
  - Closes the card after a successful create.
- Added an inline **User Permissions (flags) row** for the selected user:
  - Toggles `readOnly`, `disableUpload`, `canShare`, and `bypassOwnership`.
  - Changes are saved immediately via `updateUserPermissions.php` and cached in `__userFlagsCacheHub`.
  - Admin users are detected and treated as full-access (toggles disabled with a note).

**User creation & password resets**  

- Improved `/api/addUser.php` responses:
  - Returns proper HTTP status codes (e.g. **422** for validation failures).
  - Normalized JSON shape to `{ ok: false, error: "…" }` for errors and `{ ok: true, data: … }` for success.
  - Enforces **minimum 6-character passwords** for new users; invalid usernames and short passwords surface as clear error messages.
- Updated the admin “Add user” form in the hub to:
  - Use `fetch` directly so 4xx responses (like 422) are correctly parsed.
  - Show a toast (or `alert` fallback) on both success and failure, including backend validation messages.  
- Added `UserModel::adminResetPassword()` to reset a user’s password from the admin hub without the old password, preserving TOTP/extra fields in the users file.
- Added new endpoint `public/api/admin/changeUserPassword.php`:
  - Admin-only, with CSRF header check.
  - Resets a user’s password via `adminResetPassword()` and returns consistent JSON.

**Shared links & upload limits**  

- Reworked **shared upload size limit** UI:
  - Removed the “Shared upload limits” block from the **Upload** section.
  - Moved the **Shared Max Upload Size (bytes)** input into the **Shared links** section, above the links table.
  - Renamed the section label to **“Manage Shared Links & Upload Size Limit”** and added a new `manage_shared_links_size` i18n key.
- Updated the Upload section label to **“Antivirus”** / “Antivirus upload scanning” since that section now focuses purely on AV configuration.

**Admin UI & Pro integrations**  

- Updated the **Users** tab toolbar:
  - Replaced old “Add user / Remove user / User permissions” buttons with:
    - **Manage users** (opens the new hub).
    - **Folder Access** (per-folder ACLs).
    - **User Groups** (Pro).
    - **Client Portals** (Pro).
- Wired **Client Portals** to open the new hub for user management:
  - “Manage users…” button now triggers the global `adminOpenUserHub` instead of the old Add-User modal.
  - “Folder access…” and “User groups…” buttons now link to `adminOpenFolderAccess` and the Pro groups modal respectively.
- Increased `#adminPanelModal` base width slightly (60% → 64%) for a bit more breathing room in the new layouts.
- Slight visual polish:
  - Thicker `admin-divider` and OIDC debug snapshot border.
  - **Admin subsection titles** bumped to 1.15rem.
  - Toggle “ON” state uses `--filr-accent-400` for a slightly softer accent.

**Miscellaneous**  

- Bumped the **upload card/modal z-index** so the upload UI always sits cleanly above other overlays.
- Added styling for `#adminUserHubModal .modal-content` in both light and dark mode so it matches existing admin panel modals.

---

## Changes 12/9/2025 (v2.5.1)

release(v2.5.1): upgrade vendor libs and enhance OIDC + admin UX

**OIDC & Authentication**  

- Added **OIDC admin demotion control**:
  - New `FR_OIDC_ALLOW_DEMOTE` env/constant and `oidc.allowDemote` admin toggle.
  - When enabled, if a user loses admin in the IdP they are also downgraded in FileRise on their next OIDC login.
  - When disabled (default), once a user is admin in FileRise they are not demoted automatically by the IdP.
- Improved OIDC → local user sync:
  - `ensureLocalOidcUser()` now always promotes when the IdP says admin, and only demotes when demotion is explicitly allowed.
  - Automatically creates OIDC users when `FR_OIDC_AUTO_CREATE` is enabled and `users.txt` is missing (file is created with locking).
- Reworked **OIDC → Pro group mapping**:
  - `FR_OIDC_PRO_GROUP_PREFIX = ''` now means “map all IdP groups into Pro groups”.
  - Non-empty prefixes still only map groups starting with the prefix.
  - Cleanup logic only removes memberships in groups that are managed by OIDC, avoiding accidental removals.
- Added **OIDC debug logging**:
  - New `FR_OIDC_DEBUG` constant and `oidc.debugLogging` admin toggle.
  - Logs a redacted summary of provider URL, redirect URI, client ID presence, token auth method and group counts (no secrets/tokens).
- New **admin-only OIDC debug snapshot** endpoint:
  - `GET /api/admin/oidcDebugInfo.php` (admin only, CSRF protected).
  - Returns a JSON snapshot (no secrets) of OIDC config, login options and relevant request environment for easier support/debugging.
  - Exposed in Admin Panel → OIDC as “Effective OIDC configuration snapshot”.

**Admin Panel & UX**  

- **Login & WebDAV section** refreshed:
  - Combined “Login Options” and WebDAV into one tab: “Login Options & WebDAV Access”.
  - Switched from “Disable X” checkboxes to **enable-style toggles** for:
    - Login form
    - HTTP Basic Auth
    - OIDC login
  - Added a clear, explicit “Proxy header only (disable built-in logins)” toggle with validation so you can’t accidentally disable all login paths unless proxy-only is enabled.
- Added a better visual structure for admin sections:
  - Reusable `.admin-divider` horizontal rules and `.admin-subsection-title` headings for header title, logo, colors, footer, upload limits, antivirus, etc.
  - New `fr-toggle` switch styling used consistently across login options, WebDAV, ONLYOFFICE and ClamAV.
- OIDC settings panel:
  - Now includes toggles for **“Allow OIDC to downgrade FileRise admins”** and **“Enable OIDC debug logging”**.
  - Adds inline help text explaining the demotion behavior and the debug logging use-case.
  - Provides a debug snapshot button wired to the new `/api/admin/oidcDebugInfo.php` endpoint.
  - Moves global TOTP template URL into a clearly-labeled “TOTP configuration” subsection.

**Sharing & CSRF**  

- **File context menu** now supports sharing:
  - Added “Share file” entry to the right-click menu (when exactly one file is selected).
  - Opens the existing share modal, so sharing is now discoverable from both inline actions and the context menu.
- **Share link deletion**:
  - Folder/file share delete now sends `X-CSRF-Token` and handles 403 responses with a clear toast message.
  - Fixes admin share-link deletion failures under stricter CSRF/session setups.

**Editor, search & vendor updates**  

- Upgraded bundled vendor libraries:
  - **Bootstrap** 4.5.2 → **4.6.2**.
  - **CodeMirror** 5.65.5 → **5.65.18**.
  - **DOMPurify** 2.4.0 → **3.3.1**.
  - **Fuse.js** 6.6.2 → **7.1.0**.
  - Updated THIRD_PARTY.md to match new versions and paths.
- Editor and search code now point at the new vendor paths:
  - CodeMirror base set to `/vendor/codemirror/5.65.18/`.
  - Fuse.js lazy loader updated to `/vendor/fuse/7.1.0/fuse.min.js`.

**Miscellaneous**  

- Added CSS for the OIDC debug JSON box to keep long snapshots readable in both light and dark modes.
- Updated admin storage “Deep delete” toggle to use the same `fr-toggle` styling as other switches.
- Docker start script: silenced noisy `freshclam` output while still logging a clear message if signature updates fail.

---

## Changes 12/8/2025 (v2.5.0)

release(v2.5.0): add optional ClamAV upload, share upload & portal upload scanning and Pro virus log

- Wire optional ClamAV scanning into core uploads and shared uploads:
  - Respect VIRUS_SCAN_ENABLED env / constant as a hard override
  - Fall back to admin config clamav.scanUploads when env is unset
  - Block infected uploads with a friendly error and delete the file
  - Treat ClamAV errors (missing DB, bad config, etc.) as non-blocking

- Add virus detection JSONL log in META_DIR/virus_detections.log:
  - Log timestamp, user, IP, folder, file, source, engine, exit code and message
  - Soft-rotate the log at ~5MB

- Add Pro-only virus detection log viewer in Admin → Upload:
  - Paginated JSON view with hover/click details and CSV export
  - Blurred teaser + Pro badge when FileRise Pro is not active

- Extend the Admin > Upload section:
  - New “Upload limits & antivirus” section title
  - ClamAV upload scanning toggle with env-locked hint
  - “Run ClamAV self-test” button hitting /api/admin/clamavTest.php

- Improve upload UX when antivirus is enabled:
  - Show a small non-blocking “Scanning uploads for viruses…” notice while uploads run
  - Surface server-side JSON error messages (e.g. “Upload blocked: virus detected in file.”) in the toast

- Docker / startup:
  - Install clamav and clamav-freshclam in the Docker image
  - Log VIRUS_SCAN_ENABLED and VIRUS_SCAN_CMD on container start
  - Optionally run freshclam on startup (CLAMAV_AUTO_UPDATE=true by default), but do not fail the container if it errors

---

## Changes 12/7/2025 (v2.4.0)

release(v2.4.0): OIDC auto-provisioning, admin mapping & Pro group sync

- Add /api/admin/oidcTest.php endpoint and AdminPanel "Test OIDC discovery" button
  to sanity-check the provider's .well-known/openid-configuration.
- Introduce OIDC > FileRise integration helpers in AuthModel:
  - ensureLocalOidcUser() keeps a local account in sync with IdP admin flag
    and auto-creates users when FR_OIDC_AUTO_CREATE is enabled.
  - applyOidcGroupsToPro() and syncOidcGroupsToPro() map IdP groups into
    FileRise Pro groups and keep membership up to date.
- Extend AuthController OIDC callback to:
  - pull full userinfo, normalize groups/roles, and detect IdP admin status
    via FR_OIDC_ADMIN_GROUP and FR_OIDC_GROUP_PREFIX.
  - ensure a local FileRise user exists before login and sync Pro group
    membership on each successful OIDC login.
- Update UserController login flow so:
  - remember-me tokens and $_SESSION['isAdmin'] honor OIDC admin elevation
    while still supporting local users and TOTP.
  - OIDC group info survives TOTP and is applied after second factor.
- Add config.php knobs for OIDC integration:
  FR_OIDC_AUTO_CREATE, FR_OIDC_GROUP_CLAIM, FR_OIDC_ADMIN_GROUP,
  FR_OIDC_PRO_GROUP_PREFIX.
- Improve Admin → OIDC UI:
  - better guidance on issuer/base URL and redirect URI.
  - explicit warning that http:// should only be used in lab/local setups;
    production OIDC should be over https://.
- Tweak OnlyOffice Nginx CSP helper to generate a single
  Content-Security-Policy header including form-action and frame-src and
  document dropping upstream X-Frame-Options/CSP via proxy_hide_header.

---

## Changes 12/7/2025 (v2.3.7)

release(v2.3.7): hover snippets, inline folder drag, OnlyOffice & CSP polish

- Add `/api/file/snippet.php` + `FileController::snippet()` to return short, ACL-aware text snippets for hover previews (txt/code, CSV, and Office docs). Uses `FileModel::getDownloadInfo()` for path safety, enforces byte caps via `OFFICE_SNIPPET_MAX_BYTES`, and normalizes to UTF-8 with a `truncated` flag.  
- Extend hover snippets in `fileListView.js`:
  - Text preview cap set to 512 KB, with caching keyed by `folder::file`.
  - New Office snippet support (DOC/DOCX, XLS/XLSX, PPT/PPTX) via the backend endpoint instead of downloading whole files.
  - Hover preview auto-disabled on touch / coarse-pointer devices, and can be dismissed via `Esc`.
  - Hover preview is hidden when changing folders / reloading the file list to avoid stale overlays.
- Add lightweight video previews in the hover panel + gallery:
  - Inline `<video>` thumbnail for common formats (mp4, mkv, webm, mov, ogv, mov) using `preload="metadata"` and a quick seek, with a graceful text fallback if the video cannot load.
  - New movie icon in the gallery view for video files.
- Allow dragging *inline folder rows* into the folder tree / drop targets:
  - New `folderRowDragStartHandler()` and JSON drag payload (`dragType: 'folder'`) wired from `fileListView.js`.
  - Shared `syncTreeAfterFolderMove(sourceFolder, destination)` helper in `folderManager.js` keeps the tree, expansion state, `currentFolder`, `lastOpenedFolder`, chevrons, icons, and peek caches in sync after any folder move (tree→tree, inline→tree, quick-move).
- Improve drag-and-drop UX for both files and folders:
  - New pill-style drag ghosts for files (`fileDragDrop.js`) and folders (`folderManager.js` + inline folders) that respect light/dark mode, use rounded pills, and avoid the grey square halo.
  - Folder and file moves now emit a `folderStatsInvalidated` event so folder stats/peek caches stay in sync for both source and destination parents.
- OnlyOffice integration polish in `fileEditor.js`:
  - Warm overlay (`.oo-warm-overlay`) now has `pointer-events: none` so CSV / options dialogs are clickable.
  - `onRequestClose`, `onAppReady`, and `onDocumentReady` from PHP config are preserved and chained instead of being overwritten; the warm overlay is cleared as soon as OnlyOffice signals the UI is ready.
- Admin OnlyOffice CSP helper update in `adminOnlyOffice.js`:
  - Generated nginx snippet now explicitly hides upstream `X-Frame-Options` and `Content-Security-Policy` headers and replaces them with a single OnlyOffice-aware CSP for the configured Docs origin (script/connect/frame/media/worker rules included).
- Add `OFFICE_SNIPPET_MAX_BYTES` constant (default 5 MiB) in `config.php` to cap Office snippet parsing.
- Minor UX copy tweak: “No files or folders to display.” → “No files or folders.” in `i18n.js`.

---

## Changes 12/6/2025 (v2.3.6)

release(v2.3.6): add non-zip multi-download, richer hover preview/peak, modified sort default

- download: add "Download (no ZIP)" bulk action
  - New context-menu action to download multiple selected files individually without creating a ZIP.
  - Shows a centered stepper panel with "Download next" / "Cancel" while walking the queue.
  - Limits plain multi-downloads (default 20) and nudges user to ZIP for larger batches.
  - Uses existing /api/file/download.php URLs and respects current folder + selection.

- hover preview/peak: richer folder/file details and safer snippets
  - Folder hover now shows:
    - Icon + path
    - Owner (from folder caps, when available)
    - "Your access" summary (Upload / Move / Rename / Share / Delete) based on capabilities.
    - Created / Modified timestamps derived from folder stats.
    - Peek into child items (📁 / 📄) with trimmed labels and a clean "…" when truncated.
  - File hover now adds:
    - Tags/metadata line (tag names + MIME, duration, resolution when present).
  - Text snippets are now capped per-line and by total characters to avoid huge blocks and keep previews/peak tidy.

- sorting: modified-desc default and folder stats for created/modified
  - Default sort for the file list is now `Modified ↓` (newest first), matching typical Explorer-style views.
  - Folders respect Created/Uploaded and Modified sort using folder stats:
    - Created/Uploaded uses `earliest_uploaded`.
    - Modified uses `latest_mtime`.
  - Added a shared compareFilesForSort() so table view and gallery view use the same sort pipeline.
  - Inline folders still render A>Z by name, so tree/folder strip remain predictable.

- UX / plumbing
  - Added i18n strings for the new download queue labels and permission names ("Your access", Upload/Move/Rename/Share/Delete).
  - Reset hover snippet styling per-row so folder previews and file previews each get the right wrapping behavior.
  - Exported downloadSelectedFilesIndividually on window for file context menu integration and optional debugging helpers.
  - Changed default file list row height from 48px to 44px.

---

## Changese 12/6/2025 (v2.3.5)

release(v2.3.5): make client portals ACL-aware and improve admin UX

- Wire PortalController into ACL.php and expose canUpload/canDownload flags
- Gate portal uploads/downloads on both portal flags and folder ACL for logged-in users
- Normalize legacy portal JSON (uploadOnly) with new allowDownload checkbox semantics
- Disable portal upload UI when uploads are turned off; hide refresh when downloads are disabled
- Improve portal subtitles (“Upload & download”, “Upload only”, etc.) and status messaging
- Add quick-access buttons in Client Portals modal for Add user, Folder access, and User groups
- Enforce slug + folder as required on both frontend and backend, with inline hints and scroll-to-first-error
- Auto-focus newly created portals’ folder input for faster setup
- Raise user permissions modal z-index so it appears above the portals modal
- Enhance portal form submission logging with better client IP detection (X-Forwarded-For / X-Real-IP aware)

---

## Changes 12/5/2025 (v2.3.4)

release(v2.3.4): fix(admin): use textContent for footer preview to satisfy CodeQL

---

## Changes 12/5/2025 (v2.3.3)

release(v2.3.3): footer branding, Pro bundle UX + file list polish

**Branding & footer**  

- Added **Pro-only footer branding** (`branding.footerHtml`) stored in `adminConfig.json` and exposed via the Admin API.
- Footer is now rendered from config; if no Pro footer is set, FileRise shows:  
  `© YEAR FileRise` with a link to **filerise.net**.
- New **“Header & Footer settings”** section in the Admin Panel, with a textarea for footer HTML (simple HTML + links allowed for Pro users).

**FileRise Pro & license UX**  

- Bumped UI hint to `PRO_LATEST_BUNDLE_VERSION = v1.2.1`.
- Pro bundle install now:
  - Parses the version from the uploaded ZIP basename (works with `C:\fakepath\FileRisePro-v1.2.1.zip`).
  - Invalidates OPcache for updated Pro files so new code is active immediately.
  - Re-fetches admin config after a successful install and displays the actual active Pro bundle version in the status line.
- Admin config now exposes richer Pro metadata (plan, expiresAt, maxMajor), and the Admin Panel shows:
  - License type + email,
  - Friendly **plan** description (early supporter vs personal/business),
  - **Lifetime** vs **Valid until …** wording instead of a scary raw timestamp.

**Upload UX**  

- Upload button is now only visible/enabled when there are files queued (regular or resumable):
  - Hidden when the list is empty or after clearing uploads.
  - Shown again when user picks or drags in files.
- Adjusted Upload / Choose Files button sizing and spacing for a cleaner upload card, especially on smaller screens.

**File list & hover preview polish**  

- Inline folders now respect the current sort mode:
  - **Name** sort: A–Z / Z–A.
  - **Size** sort: uses folder stats (bytes) and sorts accordingly.
- Size and meta columns:
  - Right-aligned **size**, **uploaded/created**, **modified**, and **owner/uploader** columns.
  - Use tabular numerals for nicer numeric alignment.
- Hover preview:
  - Skips “fake” rows (e.g. “No files found”) and rows that don’t resolve to a real file.
  - Uses `sizeBytes` + `formatSize()` for a consistent, human-readable size.
- `formatSize()` now uses 1 decimal place (KB/MB/GB) and short `B` label for bytes.
- File metadata normalization:
  - Every file gets a `sizeBytes`, normalized display `size`, and a `cacheKey` derived from modified/uploaded/size, used for stable cache-busting.
- Gallery / preview URLs now use `apiFileUrl()` with a stable `t` parameter instead of `Date.now()`, improving browser caching behavior.

**Layout & animation tweaks**  

- Slightly reduced default upload card padding and button sizes to make the homepage cards feel less “tall”.
- New **site footer** styling (subtle border, centered text) added below the main layout.
- Drag-and-drop card (upload/folder cards to header dock) animations:
  - Crisper ghost cards with better text opacity and anti-jank tweaks.
  - Longer, smoother easing and more readable motion (both collapse-to-header and expand-from-header).

---

## Changes 12/3/2025 (v2.3.2)

release(v2.3.2): fix media preview URLs and tighten hover card layout

- Reuse the working preview URL as a base when stepping between images/videos
  so next/prev navigation keeps using the same inline/download endpoint
- Preserve video progress tracking and watched badges while fixing black-screen
  playback issues across browsers
- Slightly shrink the file hover preview card (width/height, grid columns,
  gaps, snippet/props heights) for a more compact, less intrusive peek

---

## Changes 12/3/2025 (v2.3.1)

release(v2.3.1): polish file list actions & hover preview peak

- Replace per-row action button stack with compact 3-dot “More actions” menu in file list and folder tree
- Add desktop hover preview peak card for files & folders (image thumb, text snippet, quick metadata)
- Add per-user toggle to disable file hover preview (stored in localStorage)
- Improve preview overlay: add Download button, Zoom/Rotate labels, keep download target in sync when navigating images/videos
- Fix mobile table layout so Size column is visible for files & folders
- Tweak dark/light glassmorphism styles for hover card and action buttons
- Clean up size parsing and editable flag logic for big/unknown files

---

## Changes 12/2/2025 (v2.3.0)

release(v2.3.0): feat(portals): branding, intake presets, limits & CSV export

**v2.3.0 – Portal branding, intake presets & upload limits**  

**Client portals (Pro)**  

- Added **per-portal branding**:
  - Custom accent color and footer text, applied to both the portal page and the login card.  
  - Optional **portal logo** stored under `uploads/profile_pics`, with a simple upload flow from the Client Portals modal.
- Upgraded the **intake form**:
  - Per-field labels, defaults, visibility, and "required" switches for Name, Email, Reference, and Notes.  
  - New presets for common workflows: **Legal intake**, **Tax client**, and **Order / RMA** that pre-fill labels and hints.
- New **thank-you screen**:
  - Optional “Thank you” message shown after successful uploads, configurable per portal.
- New **upload rules per portal**:
  - Max file size (MB) override.  
  - Allowed extensions whitelist (comma-separated).  
  - Simple per-browser daily upload limit, enforced in the portal UI with clear messaging.
- Improved **portal description**:
  - Portal page now shows active rules (max size, allowed types, daily limit) so clients know what’s allowed.
- **Submissions block** in the Client Portals modal:
  - Inline list of portal submissions with timestamps, folder, submitter and IP.  
  - “Load submissions” button with paging-style UI and improved styling in both light and dark mode.  
  - (New) **Export to CSV** action from the submissions block for easier reporting and audits.

**Portal login**  

- Portal login screen now respects **per-portal branding**:
  - Uses the portal’s logo (or falls back to the default FileRise logo).  
  - Reuses accent color and footer text from portal metadata so login matches the portal look.

**Admin panel**  

- Added dedicated **Client Portals** editor section with:
  - Portal slug / label, folder picker, expiry, upload/download options.  
  - Branding, logo upload, intake presets, upload limits, thank-you message, and live submissions preview.
- Wired up new **ONLYOFFICE** admin section:
  - Toggle, document server origin, JWT secret management, plus built-in connection tests and CSP helper.
- Wired up **Sponsor** section helper with copy-to-clipboard convenience for support links.
- Moved a bunch of admin-panel specific styles into `styles.css` for better maintainability (modal sizing, section headers, dark-mode tweaks).

**File Preview**  

- Remember the user’s volume (and mute state) in localStorage and re-apply it for every video preview in browser.

**Security / hardening**  

- New `public/api/pro/portals/uploadLogo.php` endpoint for portal logos:
  - Pro-only, admin-only, CSRF-protected.  
  - Accepts JPEG/PNG/GIF up to 2MB and stores them under `UPLOAD_DIR/profile_pics` with randomised names.

No breaking changes expected; existing portals continue to work with default settings.

---

## Changes 11/30/2025 (v2.2.4)

release(v2.2.4): fix(admin): ONLYOFFICE JWT save crash and respect replace/locked flags

- Prevented a JS crash when the ONLYOFFICE JWT field isn’t present by always initializing payload.onlyoffice before touching jwtSecret.
- Tightened ONLYOFFICE JWT handling so the secret is only sent when config isn’t locked by PHP and the admin explicitly chooses Replace (or is setting it for the first time), instead of always pushing whatever is in the field.

---

## Changes 11/29/2025 (v2.2.3)

fix(preview): harden SVG handling and normalize mime type
release(v2.2.3): round gallery card corners in file grid

- Stop treating SVGs as inline-previewable images in file list and preview modal
- Show a clear “SVG preview disabled for security reasons” message instead
- Keep SVGs downloadable via /api/file/download.php with proper image/svg+xml MIME
- Add i18n key for svg_preview_disabled

---

## Changes 11/29/2025 (v2.2.2)

release(v2.2.2): feat(folders): show inline folder stats & dates

- Extend FolderModel::countVisible() to track earliest and latest file mtimes
- Format folder created/modified timestamps via DATE_TIME_FORMAT on the backend
- Add a small folder stats cache in fileListView.js to reuse isEmpty.php responses
- Use shared fetchFolderStats() for both folder strip icons and inline folder rows
- Show per-folder item counts, total size, and created/modified dates in inline rows
- Make size parsing more robust by accepting multiple backend size keys (bytes/sizeBytes/size/totalBytes)

---

## Changes 11/28/2025 (v2.2.1)

release(v2.2.1): fix(storage-explorer): DOM-safe rendering + docs for disk usage

- Refactor adminStorage breadcrumb builder to construct DOM nodes instead of using innerHTML.
- Rework Storage explorer folder view to render rows via createElement/textContent, avoiding DOM text reinterpreted as HTML.
- Keep deep-delete and pagination behavior unchanged while tightening up XSS/CodeQL concerns.
- Update README feature list to mention disk usage summary and Pro storage explorer (ncdu-style) alongside user groups and client portals.

---

## Changes 11/28/2025 (v2.2.0)

release(v2.2.0): add storage explorer + disk usage scanner

- New **Storage / Disk Usage** admin section with snapshot-based totals and "Top folders by size".
- Disk usage CLI scanner (`src/cli/disk_usage_scan.php`) and background rescan endpoint.

- New **Storage Explorer** (drilldown, top files view, deep-delete actions) available in FileRise Pro v1.2.0.
- Non-Pro installsshow a blurred preview of the explorer with upgrade prompts.

Features

- Add new "Storage / Disk Usage" section to the Admin Panel with a summary card and "Top folders by size" table.
- Introduce CLI disk usage scanner (src/cli/disk_usage_scan.php) that walks UPLOAD_DIR, applies FS::IGNORE()/SKIP(), and persists a structured snapshot to META_DIR/disk_usage.json.
- Add /api/admin/diskUsageSummary.php and /api/admin/diskUsageTriggerScan.php endpoints to expose the snapshot and trigger background rescans from the UI.
- Wire the new storage section into adminPanel.js with a Rescan button that launches the CLI worker and polls for a fresh snapshot.

Improvements

- Storage summary now shows total files, folders, scan duration, and last scan time, plus grouped volume usage across Uploads / Users / Metadata when available.
- "Top folders by size" table supports a Pro-only "show more" interaction, but still provides a clean preview in the core edition.
- Slight spacing / layout tweaks so the Storage card doesn’t sit flush against the Admin Panel header.

Pro integration

- Keep the full ncdu-style "Storage explorer" (per-folder drilldown + global Top files, deep delete toggle, size filters, etc.) behind FR_PRO_ACTIVE via /api/pro/diskUsageChildren.php and /api/pro/diskUsageTopFiles.php.
- Pro-only delete-from-explorer actions are exposed via /api/pro/diskUsageDeleteFilePermanent.php and /api/pro/diskUsageDeleteFolderRecursive.php, reusing FileModel and FolderModel admin helpers.
- Non-Pro instances still see the explorer teaser, but the table body is blurred and padded with "Pro" badges, clearly advertising the upgrade path without exposing the Pro internals.

DX / internals

- Centralize disk usage logic in DiskUsageModel: snapshot builder, summary (including volumes), per-folder children view, and global Top N file listing.
- Ensure adminStorage.js is idempotent and safe to re-init when the Admin Panel is reopened (guards on data-* flags, re-wires only once).
- Add robust PHP-CLI discovery and log output for the disk usage worker, mirroring the existing zip worker pattern.

---

## Changes 11/27/2025 (v2.1.0)

🦃🍂 Happy Thanksgiving. 🥧🍁🍽️

release(v2.1.0): add header zoom controls, preview tags & modal/dock polish

- **feat(ux): header zoom controls with persisted app zoom**
  - Add `zoom.js` with percent-based zoom API (`window.fileriseZoom`) and `--app-zoom` CSS variable.
  - Wrap the main app in `#appZoomShell` and scale via `transform: scale(var(--app-zoom))` so the whole UI zooms uniformly.
  - Add header zoom UI (+ / − / 100% reset) and wire it via `data-zoom` buttons.
  - Persist zoom level in `localStorage` and restore on load.

- **feat(prefs): user toggle to hide header zoom controls**
  - Add `hide_header_zoom_controls` i18n key.
  - Extend the Settings → Display fieldset with “Hide header zoom controls”.
  - Store preference in `localStorage('hideZoomControls')` and respect it from `appCore.js` when initializing header zoom UI.

- **feat(preview): show file tags next to preview title**
  - Add `.title-tags` container in the media viewer header.
  - When opening a file, look up its `tags` from `fileData` and render them as pill badges beside the filename in the modal top bar.

- **fix(modals): folder modals always centered above header cards**
  - Introduce `detachFolderModalsToBody()` in `folderManager.js` and call it on init + before opening create/rename/move/delete modals.
  - Move those modals under `document.body` with a stable high `z-index`, so they’re not clipped/hidden when the cards live in the header dock.

- **fix(dnd): header dock & hidden cards container**
  - Change `#hiddenCardsContainer` from `display:none` to an off-screen absolutely positioned container so card internals (modals/layout) still work while represented as header icons.
  - Ensure sidebar is always visible as a drop target while dragging (even when panels are collapsed), plus improved highlight & placeholder behavior.

- **feat(ux): header dock hover/lock polish**
  - Make header icon buttons share the same hover style as other header buttons.
  - Add `.is-locked` state so a pinned header icon stays visually “pressed” while its card modal is locked open.

- **feat(ux): header drop zone and zoom bar layout**
  - Rework `.header-right` to neatly align zoom controls, header dock, and user buttons.
  - Add a more flexible `.header-drop-zone` with smooth width/padding transitions and a centered `"Drop Zone"` label when active and empty.
  - Adjust responsive spacing around zoom controls on smaller screens.

- **tweak(prefs-modal): improve settings modal sizing**
  - Increase auth/settings modal `max-height` from 500px to 600px to fit the extra display options without excessive scrolling.

---

## Changes 11/26/2025 (v2.0.4)

release(v2.0.4): harden sessions and align Pro paths with USERS_DIR

- Enable strict_types in config.php and AdminController
- Decouple PHP session lifetime from "remember me" window
- Regenerate session ID on persistent token auto-login
- Point Pro license / bundle paths at USERS_DIR instead of hardcoded /users
- Tweak folder management card drag offset for better alignment

---

## Changes 11/26/2025 (v2.0.3)

release(v2.0.3): polish uploads, header dock, and panel fly animations

- Rework upload drop area markup to be rebuild-safe and wire a guarded "Choose files" button
  so only one OS file-picker dialog can open at a time.
- Centralize file input change handling and reset selectedFiles/_currentResumableIds per batch
  to avoid duplicate resumable entries and keep the progress list/drafts in sync.
- Ensure drag-and-drop uploads still support folder drops while file-picker is files-only.
- Add ghost-based animations when collapsing panels into the header dock and expanding them back
  to sidebar/top zones, inheriting card background/border/shadow for smooth visuals.
- Offset sidebar ghosts so upload and folder cards don't stack directly on top of each other.
- Respect header-pinned cards: cards saved to HEADER stay as icons and no longer fly out on expand.
- Slightly tighten file summary margin in the file list header for better alignment with actions.

---

## Changes 11/23/2025 (v2.0.2)

release(v2.0.2): add config-driven demo mode and lock demo account changes

- Wire FR_DEMO_MODE through AdminModel/siteConfig and admin getConfig (demoMode flag)
- Drive demo detection in JS from FR_SITE_CFG.demoMode instead of hostname
- Show consistent login tip + toasts for demo using shared FR_DEMO flag
- Block password changes for the demo user and profile picture uploads when in demo mode
- Keep normal user dropdown/admin UI visible even on the demo, while still protecting the demo account

---

## Changes 11/23/2025 (v2.0.0)

### FileRise Core v2.0.0 & FileRise Pro v1.1.0

```text
release(v2.0.0): feat(pro): client portals + portal login flow
release(v2.0.1): fix: harden portal + core login redirects for codeql
```

### Core v2.0.0

- **Portal plumbing in core**
  - New public pages: `portal.html` and `portal-login.html` for client-facing views.
  - New portal controller + API endpoints that read portal definitions from the Pro bundle, enforce expiry, and expose safe public metadata.
  - Login flow now respects a `?redirect=` parameter so portals can bounce through login cleanly and land back on the right slug.

- **Admin UX + styling**
  - Admin panel CSS pulled into a dedicated `adminPanelStyles.js` helper instead of inline styles.
  - User Groups and Client Portals modals use the new shared styling and dark-mode tweaks so they match the rest of the UI.

- **Breadcrumb root fix**
  - Breadcrumbs now always show **root** explicitly and behave correctly when you’re at top level vs nested folders.

- **Routing**
  - Apache rewrite added for pretty portal URLs:  
    `https://host/portal/<slug>` → `portal.html?slug=<slug>` without affecting other routes.

### Pro v1.1.0 – Client Portals

- **Client portal definitions (Admin → FileRise Pro → Client Portals)**
  - Create multiple portals, each with:
    - Slug + display name
    - Target folder
    - Optional client email
    - Upload-only / allow-download flags
    - Per-portal expiry date
  - Portal-level copy and branding:
    - Optional title + instructions
    - Accent color used throughout the portal UI
    - Footer text at bottom of the portal page

- **Optional intake form before uploads**
  - Enable a form per portal with fields: name, email, reference, notes.
  - Per-field “default value” and “required” toggles.
  - Form must be completed before uploads when enabled.

- **Submissions log**
  - Each portal keeps a submissions list showing:
    - Date/time, folder, submitting user, IP address
    - The intake form values (name, email, reference, notes).

- **Client-facing experience**
  - New portal UI with:
    - Branded header (title + accent color)
    - Optional intake form
    - Drag-and-drop upload dropzone
  - If downloads are enabled, a clean list/grid of files already in that portal’s folder with download buttons.

- **Portal login page**
  - Minimal login screen that pulls title/accent/footer from portal metadata.
  - After successful login, user is redirected back to the original portal URL.

---

## Changes 11/21/2025 (v1.9.14)

release(v1.9.14): inline folder rows, synced folder icons, and compact theme polish

- Add ACL-aware folder stats and byte counts in FolderModel::countVisible()
- Show subfolders inline as rows above files in table view (Explorer-style)
- Page folders + files together and wire folder rows into existing DnD and context menu flows
- Add folder action buttons (move/rename/color/share) with capability checks from /api/folder/capabilities.php
- Cache folder capabilities and owners to avoid repeat calls per row
- Add user settings to toggle folder strip and inline folder rows (stored in localStorage)
- Default itemsPerPage to 50 and remember current page across renders
- Sync inline folder icon size to file row height and tweak vertical alignment for different row heights
- Update table headers + i18n keys to use Name / Size / Modified / Created / Owner labels
- Compact and consolidate light/dark theme CSS, search pill, pagination, and font-size controls
- Tighten file action button hit areas and add specific styles for folder move/rename buttons

---

## Changes 11/20/2025 (v1.9.13)

release(v1.9.13): style(ui): compact dual-theme polish for lists, inputs, search & modals

- Added compact, unified light/dark theme for core surfaces (file list, upload, folder manager, admin panel).
- Updated modals, dropdown menus, and editor header to use the same modern panel styling in both themes.
- Restyled search bar into a pill-shaped control with a dedicated icon chip and better hover states.
- Refined pagination (Prev/Next) and font size (A-/A+) buttons to be smaller, rounded, and more consistent.
- Normalized input fields so borders render cleanly and focus states are consistent across the app.
- Tweaked button shadows so primary actions (Create/Upload) pop without feeling heavy in light mode.
- Polished dark-mode colors for tables, rows, toasts, and meta text for a more “app-like” feel.

---

## Changes 11/19/2025 (v1.9.12)

release(v1.9.12): feat(pro-acl): add user groups and group-aware ACL

- Add Pro user groups as a first-class ACL source:
  - Load group grants from FR_PRO_BUNDLE_DIR/groups.json in ACL::hasGrant().
  - Treat group grants as additive only; they can never remove access.

- Introduce AclAdminController:
  - Move getGrants/saveGrants logic into a dedicated controller.
  - Keep existing ACL normalization and business rules (shareFolder ⇒ view, shareFile ⇒ at least viewOwn).
  - Refactor public/api/admin/acl/getGrants.php and saveGrants.php to use the controller.

- Implement Pro user group storage and APIs:
  - Add ProGroups store class under FR_PRO_BUNDLE_DIR (groups.json with {name,label,members,grants}).
  - Add /api/pro/groups/list.php and /api/pro/groups/save.php, guarded by AdminController::requireAuth/requireAdmin/requireCsrf().
  - Keep groups and bundle code behind FR_PRO_ACTIVE/FR_PRO_BUNDLE_DIR checks.

- Ship Pro-only endpoints from core instead of the bundle:
  - Move public/api/pro/uploadBrandLogo.php into core and gate it on FR_PRO_ACTIVE.
  - Remove start.sh logic that copied public/api/pro from the Pro bundle into the container image.

- Extend admin UI for user groups:
  - Turn “User groups” into a real Pro-only modal with add/delete groups, multi-select members, and member chips.
  - Add “Edit folder access” for each group, reusing the existing folder grants grid.
  - Overlay group grants when editing a user’s ACL:
    - Show which caps are coming from groups, lock those checkboxes, and update tooltips.
    - Show group membership badges in the user permissions list.
  - Add a collapsed “Groups” section at the top of the permissions screen to preview group ACLs (read-only).

- Misc:
  - Bump PRO_LATEST_BUNDLE_VERSION hint in adminPanel.js to v1.0.1.
  - Tweak modal border-radius styling to include the new userGroups and groupAcl modals.

---

## Changes 11/18/2025 (v1.9.11)

release(v1.9.11): fix(media): HTTP Range streaming; feat(ui): paged folder strip (closes #68)

- media: add proper HTTP Range support to /api/file/download.php so HTML5
  video/audio can seek correctly across all browsers (Brave/Chrome/Android/Windows).
- media: avoid buffering the entire file in memory; stream from disk with
  200/206 responses and Accept-Ranges for smoother playback and faster start times.
- media: keep video progress tracking, watched badges, and status chip behavior
  unchanged but now compatible with the new streaming endpoint.

- ui: update the folder strip to be responsive:
  - desktop: keep the existing "chip" layout with icon above name.
  - mobile: switch to inline rows `[icon] [name]` with reduced whitespace.
- ui: add simple lazy-loading for the folder strip so only the first batch of
  folders is rendered initially, with a "Load more…" button to append chunks for
  very large folder sets (stays friendly with 100k+ folders).

- misc: small CSS tidy-up around the folder strip classes to remove duplicates
  and keep mobile/desktop behavior clearly separated.

---

## Changes 11/18/2025 (v1.9.10)

release(v1.9.10): add Pro bundle installer and admin panel polish

- Add FileRise Pro section in admin panel with license management and bundle upload
- Persist Pro bundle under users/pro and sync public/api/pro endpoints on container startup
- Improve admin config API: Pro metadata, license file handling, hardened auth/CSRF helpers
- Update Pro badge/version UI with “update available” hint and link to filerise.net
- Change Pro bundle installer to always overwrite existing bundle files for clean upgrades

---

## Changes 11/16/2025 (v1.9.9)

release(v1.9.9): fix(branding): sanitize custom logo URL preview

- Sanitize branding.customLogoUrl on the server before writing siteConfig.json
- Allow only http/https or site-relative paths; strip invalid/sneaky values
- Update adminPanel.js live logo preview to set img src/alt safely
- Addresses CodeQL XSS warning while keeping Pro branding logo overrides working

---

## Changes 11/16/2025 (v1.9.8)

release(v1.9.8): feat(pro): wire core to Pro licensing + branding hooks

- Add Pro feature flags + bootstrap wiring
  - Define FR_PRO_ACTIVE/FR_PRO_TYPE/FR_PRO_EMAIL/FR_PRO_VERSION/FR_PRO_LICENSE_FILE
    in config.php and optionally require src/pro/bootstrap_pro.php.
  - Expose a `pro` block from AdminController::getConfig() so the UI can show
    license status, type, email, and bundle version without leaking the raw key.

- Implement license save endpoint
  - Add AdminController::setLicense() and /api/admin/setLicense.php to accept a
    FRP1 license string via JSON, validate basic shape, and persist it to
    FR_PRO_LICENSE_FILE with strict 0600 permissions.
  - Return structured JSON success/error responses for the admin UI.

- Extend admin config model with branding + safer validation
  - Add `branding.customLogoUrl`, `branding.headerBgLight`, and
    `branding.headerBgDark` fields to AdminModel defaults and updateConfig().
  - Introduce AdminModel::sanitizeLogoUrl() to allow only site-relative /uploads
    paths or http(s) URLs; reject absolute filesystem paths, data: URLs, and
    javascript: URLs.
  - Continue to validate ONLYOFFICE docsOrigin as http(s) only, keeping core
    config hardening intact.

- New Pro-aware Admin Panel UI
  - Rework User Management section to group:
    - Add user / Remove user
    - Folder Access (per-folder ACL)
    - User Permissions (account-level flags)
  - Add Pro-only actions with clear gating:
    - “User groups” button (Pro)
    - “Client upload portal” button with “Pro · Coming soon” pill
  - Add “FileRise Pro” section:
    - Show current Pro status (Free vs Active) + license metadata.
    - Textarea for pasting license key, file upload helper, and “Save license”
      action wired to /api/admin/setLicense.php.
    - Optional “Copy current license” button when a license is present.
  - Add “Sponsor / Donations” section with fixed GitHub Sponsors and Ko-fi URLs
    and one-click copy/open buttons.

- Header branding controls (Pro)
  - Add Header Logo + Header Colors controls under Header Settings, gated by
    `config.pro.active`.
  - Allow uploading a logo via /api/pro/uploadBrandLogo.php and auto-filling the
    normalized /uploads path.
  - Add live-preview helpers to update the header logo and header background
    colors in the running UI after saving.

- Apply branding on app boot
  - Update main.js to read branding config on load and apply:
    - Custom header logo (or fallback to /assets/logo.svg).
    - Light/dark header background colors via CSS variables.
  - Keeps header consistent with saved branding across reloads and before
    opening the admin panel.

- Styling + UX polish
  - Add styles for new admin sections: collapsible headers, dark-mode aware
    modal content, and refined folder access grid.
  - Introduce .btn-pro-admin and .btn-pro-pill classes to render “Pro” and
    “Pro · Coming soon” pills overlayed on buttons, matching the existing
    header “Core/Pro” badge treatment.
  - Minor spacing/typography tweaks in admin panel and ACL UI.

Note: Core code remains MIT-licensed; Pro functionality is enabled via optional
runtime hooks and separate closed-source bundle, without changing the core
license text.

---

## Changes 11/14/2025 (v1.9.7)

release(v1.9.7): harden client path guard and refine header/folder strip CSS

- Tighten isSafeFolderPath() to reject dot-prefixed/invalid segments (client-side defense-in-depth on folder paths).
- Rework header layout: consistent logo sizing, centered title, cleaner button alignment, and better small-screen stacking.
- Polish user dropdown and icon buttons: improved hover/focus states, dark-mode colors, and rounded menu corners.
- Update folder strip tiles: cap tile width, allow long folder names to wrap neatly, and fine-tune text/icon alignment.
- Tweak folder tree rows: better label wrapping, vertical alignment, and consistent SVG folder icon rendering.
- Small CSS cleanup and normalization (body, main wrapper, media modal/progress styles) without changing behavior.

---

## Changes 11/14/2025 (v1.9.6)

release(v1.9.6): hardened resumable uploads, menu/tag UI polish and hidden temp folders (closes #67)

- Resumable uploads
  - Normalize resumable GET “test chunk” handling in `UploadModel` using `resumableChunkNumber` + `resumableIdentifier`, returning explicit `status: "found"|"not found"`.
  - Skip CSRF checks for resumable GET tests in `UploadController`, but keep strict CSRF validation for real POST uploads with soft-fail `csrf_expired` responses.
  - Refactor `UploadModel::handleUpload()` for chunked uploads: strict filename validation, safe folder normalization, reliable temp chunk directory creation, and robust merge with clear errors if any chunk is missing.
  - Add `UploadModel::removeChunks()` + internal `rrmdir()` to safely clean up `resumable_…` temp folders via a dedicated controller endpoint.

- Frontend resumable UX & persistence
  - Enable `testChunks: true` for Resumable.js and wire GET checks to the new backend status logic.
  - Track in-progress resumable files per user in `localStorage` (identifier, filename, folder, size, lastPercent, updatedAt) and show a resumable hint banner inside the Upload card with a dismiss button that clears the hints for that folder.
  - Clamp client-side progress to max `99%` until the server confirms success, so aborted tabs still show resumable state instead of “100% done”.
  - Improve progress UI: show upload speed, spinner while finalizing, and ensure progress elements exist even for non-standard flows (e.g., submit without prior list build).
  - On complete success, clear the progress UI, reset the file input, cancel Resumable’s internal queue, clear draft records for the folder, and re-show the resumable banner only when appropriate.

- Hiding resumable temp folders
  - Hide `resumable_…` folders alongside `trash` and `profile_pics` in:
    - Folder tree BFS traversal (child discovery / recursion).
    - `listChildren.php` results and child-cache hydration.
    - The inline folder strip above the file list (also filtered in `fileListView.js`).

- Folder manager context menu upgrade
  - Replace the old ad-hoc folder context menu with a unified `filr-menu` implementation that mirrors the file context menu styling.
  - Add Material icon mapping per action (`create_folder`, `move_folder`, `rename_folder`, `color_folder`, `folder_share`, `delete_folder`) and clamp the menu to viewport with escape/outside-click close behavior.
  - Wire the new menu from both tree nodes and breadcrumb links, respecting locked folders and current folder capabilities.

- File context menu & selection logic
  - Define a semantic file context menu in `index.html` (`#fileContextMenu` with `.filr-menu` buttons, icons, `data-action`, and `data-when` visibility flags).
  - Rebuild `fileMenu.js` to:
    - Derive the current selection from file checkboxes and map back to real `fileData` entries, handling the encoded row IDs.
    - Toggle menu items based on selection state (`any`, `one`, `many`, `zip`, `can-edit`) and hide redundant separators.
    - Position the menu within the viewport, add ESC/outside-click dismissal, and delegate click handling to call the existing file actions (preview, edit, rename, copy/move/delete/download/extract, tag single/multiple).

- Tagging system robustness
  - Refactor `fileTags.js` to enforce single-instance modals for both single-file and multi-file tagging, preventing duplicate DOM nodes and double bindings.
  - Centralize global tag storage (`window.globalTags` + `localStorage`) with shared dropdowns for both modals, including “×” removal for global tags that syncs back to the server.
  - Make the tag modals safer and more idempotent (re-usable DOM, Esc and backdrop-to-close, defensive checks on elements) while keeping the existing file row badge rendering and tag-based filtering behavior.
  - Localize various tag-related strings where possible and ensure gallery + table views stay in sync after tag changes.

- Visual polish & theming
  - Introduce a shared `--menu-radius` token and apply it across login form, file list container, restore modal, preview modals, OnlyOffice modal, user dropdown menus, and the Upload / Folder Management cards for consistent rounded corners.
  - Update header button hover to use the same soft blue hover as other interactive elements and tune card shadows for light vs dark mode.
  - Adjust media preview modal background to a darker neutral and tweak `filePreview` panel background fallback (`--panel-bg` / `--bg-color`) for better dark mode contrast.
  - Style `.filr-menu` for both file + folder menus with max-height, scrolling, proper separators, and Material icons inheriting text color in light and dark themes.
  - Align the user dropdown menu hover/active styles with the new menu hover tokens (`--filr-row-hover-bg`, `--filr-row-outline-hover`) for a consistent interaction feel.

---

## Changes 11/13/2025 (v1.9.5)

release(v1.9.5): harden folder tree DOM, add a11y to “Load more”, and guard folder paths

- Replace innerHTML-based row construction in folderManager.js with safe DOM APIs
  (createElement, textContent, dataset). All user-derived strings now use
  textContent; only locally-generated SVG remains via innerHTML.
- Add isSafeFolderPath() client-side guard; fail closed on suspicious paths
  before rendering clickable nodes.
- “Load more” button rebuilt with proper a11y:
  - aria-label, optional aria-controls to the UL
  - aria-busy + disabled during fetch; restore state only if the node is still
    present (Node.isConnected).
- Keep lazy tree + cursor pagination behavior intact; chevrons/icons continue to
  hydrate from server hints (hasSubfolders/nonEmpty) once available.
- Addresses CodeQL XSS findings by removing unsafe HTML interpolation and
  avoiding HTML interpretation of extracted text.

No breaking changes; security + UX polish on top of v1.9.4.

---

## Changes 11/13/2025 (v1.9.4)

release(v1.9.4): lazy folder tree, cursor pagination, ACL-safe chevrons, and “Load more” (closes #66)

**Big focus on folder management performance & UX for large libraries.**

feat(folder-tree):

- Lazy-load children on demand with cursor-based pagination (`nextCursor` + `limit`), including inline “Load more” row.
- BFS-based initial selection: if user can’t view requested/default folder, auto-pick the first accessible folder (but stick to (Root) when user can view it).
- Persisted expansion state across reloads; restore saved path and last opened folder; prevent navigation into locked folders (shows i18n toast instead).
- Breadcrumb now respects ACL: clicking a locked crumb toggles expansion only (no navigation).
- Live chevrons from server truth: `hasSubfolders` is computed server-side to avoid file count probes and show correct expanders (even when a direct child is unreadable).
- Capabilities-driven toolbar enable/disable for create/move/rename/color/delete/share.
- Color-carry on move/rename + expansion state migration so moved/renamed nodes keep colors and stay visible.
- Root DnD honored only when viewable; structural locks disable dragging.

perf(core):

- New `FS.php` helpers: safe path resolution (`safeReal`), segment sanitization, symlink defense, ignore/skip lists, bounded child counting, `hasSubfolders`, and `hasReadableDescendant` (depth-limited).
- Thin caching for child lists and counts, with targeted cache invalidation on move/rename/create/delete.
- Bounded concurrency for folder count requests; short timeouts to keep UI snappy.

api/model:

- `FolderModel::listChildren(...)` now returns items shaped like:
  `{ name, locked, hasSubfolders, nonEmpty? }`
  - `nonEmpty` included only for unlocked nodes (prevents side-channel leakage).
  - Locked nodes are only returned when `hasReadableDescendant(...)` is true (preserves legacy “structural visibility without listing the entire tree” behavior).
- `public/api/folder/listChildren.php` delegates to controller/model; `isEmpty.php` hardened; `capabilities.php` exposes `canView` (or derived) for fast checks.
- Folder color endpoints gate results by ACL so users only see colors for folders they can at least “own-view”.

ui/ux:

- New “Load more” row (`<li class="load-more">`) with dark-mode friendly ghost button styling; consistent padding, focus ring, hover state.
- Locked folders render with padlock overlay and no DnD; improved contrast/spacing; icons/chevrons update live as children load.
- i18n additions: `no_access`, `load_more`, `color_folder(_saved|_cleared)`, `please_select_valid_folder`, etc.
- When a user has zero access anywhere, tree selects (Root) but shows `no_access` instead of “No files found”.

security:

- Stronger path traversal + symlink protections across folder APIs (all joins normalized, base-anchored).
- Reduced metadata leakage by omitting `nonEmpty` for locked nodes and depth-limiting descendant checks.

fixes:

- Chevron visibility for unreadable intermediate nodes (e.g., “Files” shows a chevron when it contains a readable “Resources” descendant).
- Refresh now honors the actively viewed folder (session/localStorage), not the first globally readable folder.

chore:

- CSS additions for locked state, tree rows, and dark-mode ghost buttons.
- Minor code cleanups and comments across controller/model and JS tree logic.

---

## Changes 11/11/2025 (v1.9.3)

release(v1.9.3): unify folder icons across tree & strip, add “paper” lines, live color sync, and vendor-aware release

- UI / Icons
  - Replace Material icon in folder strip with shared `folderSVG()` and export it for reuse. Adds clipPaths, subtle gradients, and `shape-rendering: geometricPrecision` to eliminate the tiny seam.
  - Add ruled “paper” lines and blue handwriting dashes; CSS for `.paper-line` and `.paper-ink` included.
  - Match strokes between tree (24px) and strip (48px) so both look identical; round joins/caps to avoid nicks.
  - Polish folder strip layout & hover: tighter spacing, centered icon+label, improved wrapping.

- Folder color & non-empty detection
  - Live color sync: after saving a color we dispatch `folderColorChanged`; strip repaints and tree refreshes.
  - Async strip icon: paint immediately, then flip to “paper” if the folder has contents. HSL helpers compute front/back/stroke shades.

- FileList strip
  - Render subfolders with `<span class="folder-svg">` + name, wire context menu actions (move, color, share, etc.), and attach icons for each tile.

- Exports & helpers
  - Export `openColorFolderModal(...)` and `openMoveFolderUI(...)` for the strip and toolbar; use `refreshFolderIcon(...)` after ops to keep icons current.

- AppCore
  - Update file upload DnD relay hook to `#fileList` (id rename).

- CSS tweaks
  - Bring tree icon stroke/paint rules in line with the strip, add scribble styles, and adjust margins/spacing.

- CI/CD (release)
  - Build PHP dependencies during release: setup PHP 8.3 + Composer, cache downloads, install into `staging/vendor/`, exclude `vendor/` from placeholder checks, and ship artifact including `vendor/`.

- Changelog highlights
  - Sharper, seam-free folder SVGs shared across tree & strip, with paper lines + handwriting accents.
  - Real-time folder color propagation between views.
  - Folder strip switched to SVG tiles with better layout + context actions.
  - Release pipeline now produces a ready-to-run zip that includes `vendor/`.

---

## Changes 11/10/2025 (v1.9.2)

release(v1.9.2): Upload modal + DnD relay from file list (with robust synthetic-drop fallback)

- New “Upload file(s)” action in Create menu:
  - Adds `<li id="uploadOption">` to the dropdown.
  - Opens a reusable Upload modal that *moves* the existing #uploadCard into the modal (no cloning = no lost listeners).
  - ESC / backdrop / “×” close support; focus jumps to “Choose Files” for fast keyboard flow.

- Drag & Drop from file list → Upload:
  - Drag-over on #fileListContainer shows drop-hover and auto-opens the Upload modal after a short hover.
  - On drop, waits until the modal’s #uploadDropArea exists, then relays the drop to it.
  - Uses a resilient relay: attempts to attach DataTransfer to a synthetic event; falls back to a stash.

- Synthetic drop fallback:
  - Introduces window.__pendingDropData (cleared after use).
  - upload.js now reads e.dataTransfer || window.__pendingDropData to accept relayed drops across browsers.

- Implementation details:
  - fileActions.js: adds openUploadModal()/closeUploadModal() with a hidden sentinel to return #uploadCard to its original place on close.
  - appCore.js: imports openUploadModal, adds waitFor() helper, and wires dragover/leave/drop logic for the relay.
  - index.html: adds Upload option to the Create menu and the #uploadModal scaffold.

- UX/Safety:
  - Defensive checks if modal/card isn’t present.
  - No backend/API changes; CSRF/auth unchanged.

Files touched: public/js/upload.js, public/js/fileActions.js, public/js/appCore.js, public/index.html

---

## Changes 11/9/2025 (v1.9.1)

release(v1.9.1): customizable folder colors + live preview; improved tree persistence; accent button; manual sync script

### Highlights v1.9.1

- 🎨 Per-folder colors with live SVG preview and consistent styling in light/dark modes.
- 📄 Folder icons auto-refresh when contents change (no full page reload).
- 🧭 Drag-and-drop breadcrumb fallback for folder→folder moves.
- 🛠️ Safer upgrade helper script to rsync app files without touching data.

- feat(colors): add per-folder color customization
  - New endpoints: GET /api/folder/getFolderColors.php and POST /api/folder/saveFolderColor.php
    - AuthZ: reuse canRename for “customize folder”, validate hex, and write atomically to metadata/folder_colors.json.
    - Read endpoint filters map by ACL::canRead before returning to the user.
  - Frontend: load/apply colors to tree rows; persist on move/rename; API helpers saveFolderColor/getFolderColors.

- feat(ui): color-picker modal with live SVG folder preview
  - Shows preview that updates as you pick; supports Save/Reset; protects against accidental toggle clicks.

- feat(controls): “Color folder” button in Folder Management card
  - New `.btn-color-folder` with accent palette (#008CB4), hover/active/focus states, dark-mode tuning; event wiring gated by caps.

- i18n: add strings for color UI (color_folder, choose_color, reset_default, save_color, folder_color_saved, folder_color_cleared).

- ux(tree): make expansion state more predictable across refreshes
  - `expandTreePath(path, {force,persist,includeLeaf})` with persistence; keep ancestors expanded; add click-suppression guard.

- ux(layout): center the folder-actions toolbar; remove left padding hacks; normalize icon sizing.

- chore(ops): add scripts/manual-sync.sh (safe rsync update path, preserves data dirs and public/.htaccess).

---

## Changes 11/9/2025 (v1.9.0)

release(v1.9.0): folder tree UX overhaul, fast ACL-aware counts, and .htaccess hardening

feat(ui): modern folder tree

- New crisp folder SVG with clear paper insert; unified yellow/orange palette for light & dark
- Proper ARIA tree semantics (role=treeitem, aria-expanded), cleaner chevrons, better alignment
- Breadcrumb tweaks (› separators), hover/selected polish
- Prime icons locally, then confirm via counts for accurate “empty vs non-empty”

feat(api): add /api/folder/isEmpty.php via controller/model

- public/api/folder/isEmpty.php delegates to FolderController::stats()
- FolderModel::countVisible() enforces ACL, path safety, and short-circuits after first entry
- Releases PHP session lock early to avoid parallel-request pileups

perf: cap concurrent “isEmpty” requests + timeouts

- Small concurrency limiter + fetch timeouts
- In-memory result & inflight caches for fewer network hits

fix(state): preserve user expand/collapse choices

- Respect saved folderTreeState; don’t auto-expand unopened nodes
- Only show ancestors for visibility when navigating (no unwanted persists)

security: tighten .htaccess while enabling WebDAV

- Deny direct PHP except /api/*.php, /api.php, and /webdav.php
- AcceptPathInfo On; keep path-aware dotfile denial

refactor: move count logic to model; thin controller action

chore(css): add unified “folder tree” block with variables (sizes, gaps, colors)

Files touched: FolderModel.php, FolderController.php, public/js/folderManager.js, public/css/styles.css, public/api/folder/isEmpty.php (new), public/.htaccess

---

## Changes 11/8/2025 (v1.8.13)

release(v1.8.13): ui(dnd): stabilize zones, lock sidebar width, and keep header dock in sync

- dnd: fix disappearing/overlapping cards when moving between sidebar/top; return to origin on failed drop
- layout: placeCardInZone now live-updates top layout, sidebar visibility, and toggle icon
- toggle/collapse: move ALL cards to header on collapse, restore saved layout on expand; keep icon state synced; add body.sidebar-hidden for proper file list expansion; emit `zones:collapsed-changed`
- header dock: show dock whenever icons exist (and on collapse); hide when empty
- responsive: enforceResponsiveZones also updates toggle icon; stash/restore behavior unchanged
- sidebar: hard-lock width to 350px (CSS) and remove runtime 280px minWidth; add placeholder when empty to make dropping back easy
- CSS: right-align header dock buttons, centered “Drop Zone” label, sensible min-height; dark-mode safe
- refactor: small renames/ordering; remove redundant z-index on toggle; minor formatting

---

## Changes 11/8/2025 (v1.8.12)

release(v1.8.12): auth UI & DnD polish — show OIDC, auto-SSO, right-aligned header icons

- auth (public/js/main.js)
  - Robust login options: tolerate key variants (disableFormLogin/disable_form_login, etc.).
  - Correctly show/hide wrapper + individual methods (form/OIDC/basic).
  - Auto-SSO when OIDC is the only enabled method; add opt-out with `?noauto=1`.
  - Minor cleanup (SW register catch spacing).

- drag & drop (public/js/dragAndDrop.js)
  - Reworked zones model: Sidebar / Top (left/right) / Header (icon+modal).
  - Persist user layout with `userZonesSnapshot.v2` and responsive stash for small screens.
  - Live UI sync: toggle icon (`material-icons`) updates immediately after moves.
  - Smarter small-screen behavior: lift sidebar cards ephemerally; restore only what belonged to sidebar.
  - Cleaner header icon modal plumbing; remove legacy/dead code.

- styles (public/css/styles.css)
  - Header drop zone fills remaining space and right-aligns its icons.

UX:

- OIDC button reliably appears when form/basic are disabled.
- If OIDC is the sole method, users are taken straight to the provider (unless `?noauto=1`).
- Header icons sit with the other header actions (right-aligned), and the toggle icon reflects layout changes instantly.

---

## Changes 11/8/2025 (v1.8.11)

release(v1.8.11): fix(oidc): always send PKCE (S256) and treat empty secret as public client

- Force PKCE via setCodeChallengeMethod('S256') so Authelia’s public-client policy is satisfied.
- Convert empty OIDC client secret to null to correctly signal a public client.
- Optional commented hook to switch token endpoint auth to client_secret_post if desired.
- OIDC_TOKEN_ENDPOINT_AUTH_METHOD added to config.php

---

## Changes 11/8/2025 (v1.8.10)

release(v1.8.10): theme-aware media modal, stronger file drag-and-drop, unified progress color, and favicon overhaul

UI/UX — Media modal

- Add fixed top bar to avoid filename/controls overlapping native media chrome; keep hover-on-stage look.
- Show a Material icon by file type next to the filename (image/video/pdf/code/arch/txt, with fallback).
- Restore “X” behavior and make hover theme-aware (red pill + white ‘X’ in light, red pill + black ‘X’ in dark).

Video/Image controls

- Top-right action icons use theme-aware styles and align with the filename row.
- Prev/Next paddles remain high-contrast and vertically centered within the stage.

Progress badges (list & modal)

- Standardize “in-progress” to darker orange (#ea580c) for better contrast in light/dark; update CSS and list badge rendering.

Drag & drop

- Support multi-select drags with a clean JSON payload + text fallback; nicer drag ghost.
- More resilient drops: accept data-dest-folder, safer JSON parse, early guards, and better toasts.
- POST move now sends Accept header, uses global CSRF, and refreshes the active view on success.

Editor & ONLYOFFICE

- Full-screen OO modal with preconnect, optional hidden warm-up to reduce first-open latency, and live theme sync.
- CodeMirror path: fix theme/mode setters (use `cm`) and tighten dynamic mode loading.

Assets & polish

- Swap in full favicon stack (SVG + PNG 512/32/16 + ICO) and set theme-color; cache-busted via `{{APP_QVER}}`.
- Refresh `logo.svg` (accessibility, cleaner handles/gradients).

Also added: refreshed resource images and new logo sizes (logo-16, logo-32, logo-64, etc.) for crisper favicons and embeds.

---

## Changes 11/7/2025 (v1.8.9)

release(v1.8.9): fix(oidc, admin): first-save Client ID/Secret (closes #64)

- adminPanel.js:
  - Masked inputs without a saved value now start with data-replace="1".
  - handleSave() now sends oidc.clientId / oidc.clientSecret on first save (no longer requires clicking “Replace” first).

---

## Changes 11/7/2025 (v1.8.8)

release(v1.8.8): background ZIP jobs w/ tokenized download + in‑modal progress bar; robust finalize; janitor cleanup — closes #60

**Summary**
This release moves ZIP creation off the request thread into a **background worker** and switches the client to a **queue > poll > tokenized GET** download flow. It fixes large multi‑GB ZIP failures caused by request timeouts or cross‑device renames, and provides a resilient in‑modal progress experience. It also adds a 6‑hour janitor for temporary tokens/logs.

**Backend** changes:

- Add **zip status** endpoint that returns progress and readiness, and **tokenized download** endpoint for one‑shot downloads.
- Update `FileController::downloadZip()` to enqueue a job and return `{ token, statusUrl, downloadUrl }` instead of streaming a blob in the POST response.
- Implement `spawnZipWorker()` to find a working PHP CLI, set `TMPDIR` on the same filesystem as the final ZIP, spawn with `nohup`, and persist PID/log metadata for diagnostics.
- Serve finished ZIPs via `downloadZipFile()` with strict token/user checks and streaming headers; unlink the ZIP after successful read.

New **Worker**:

- New `src/cli/zip_worker.php` builds the archive in the background.
- Writes progress fields (`pct`, `filesDone`, `filesTotal`, `bytesDone`, `bytesTotal`, `current`, `phase`, `startedAt`, `finalizeAt`) to the per‑token JSON.
- During **finalizing**, publishes `selectedFiles`/`selectedBytes` and clears incremental counters to avoid the confusing “N/N files” display before `close()` returns.
- Adds a **janitor**: purge `.tokens/*.json` and `.logs/WORKER-*.log` older than **6 hours** on each run.

New **API/Status Payload**:

- `zipStatus()` exposes `ready` (derived from `status=done` + existing `zipPath`), and includes `startedAt`/`finalizeAt` for UI timers.
- Returns a prebuilt `downloadUrl` for a direct handoff once the ZIP is ready.

**Frontend (UX)** changes:

- Replace blob POST download with **enqueue → poll → tokenized GET** flow.
- Native `<progress>` bar now renders **inside the modal** (no overflow/jitter).
- Shows determinate **0–98%** during enumeration, then **locks at 100%** with **“Finalizing… mm:ss — N files, ~Size”** until the download starts.
- Modal closes just before download; UI resets for the next operation.

Added **CSS**:

- Ensure the progress modal has a minimum height and hidden overflow; ellipsize the status line to prevent scrollbars.

**Why this closes #60**?

- ZIP creation no longer depends on the request lifetime (avoids proxy/Apache timeouts).
- Temporary files and final ZIP are created on the **same filesystem** (prevents “rename temp file failed” during `ZipArchive::close()`).
- Users get continuous, truthful feedback for large multi‑GB archives.

Additional **Notes**

- Download tokens are **one‑shot** and are deleted after the GET completes.
- Temporary artifacts (`META_DIR/ziptmp/.tokens`, `.logs`, and old ZIPs) are cleaned up automatically (≥6h).

---

## Changes 11/5/2025 (v1.8.7)

release(v1.8.7): fix(zip-download): stream clean ZIP response and purge stale temp archives

- FileController::downloadZip
  - Remove _jsonStart/_jsonEnd and JSON wrappers; send a pure binary ZIP
  - Close session locks, disable gzip/output buffering, set Content-Length when known
  - Stream in 1MiB chunks; proper HTTP codes/messages on errors
  - Unlink the temp ZIP after successful send
  - Preserves all auth/ACL/ownership checks

- FileModel::createZipArchive
  - Purge META_DIR/ziptmp/download-*.zip older than 6h before creating a new ZIP

Result: fixes “failed to fetch / load failed” with fetch>blob flow and reduces leftover tmp ZIPs.

---

## Changes 11/4/2025 (v1.8.6)

release(v1.8.6): fix large ZIP downloads + safer extract; close #60

- Zip creation
  - Write archives to META_DIR/ziptmp (on large/writable disk) instead of system tmp.
  - Auto-create ziptmp (0775) and verify writability.
  - Free-space sanity check (~files total +5% +20MB); clearer error on low space.
  - Normalize/validate folder segments; include only regular files.
  - set_time_limit(0); use CREATE|OVERWRITE; improved error handling.

- Zip extraction
  - New: stamp metadata for files in nested subfolders (per-folder metadata.json).
  - Skip hidden “dot” paths (files/dirs with any segment starting with “.”) by default
    via SKIP_DOTFILES_ON_EXTRACT=true; only extract allow-listed entries.
  - Hardenings: zip-slip guard, reject symlinks (external_attributes), zip-bomb limits
    (MAX_UNZIP_BYTES default 200GiB, MAX_UNZIP_FILES default 20k).
  - Persist metadata for all touched folders; keep extractedFiles list for top-level names.

Ops note: ensure /var/www/metadata/ziptmp exists & is writable (or mount META_DIR to a large volume).

Closes #60.

---

## Changes 11/4/2025 (v1.8.5)

release(v1.8.5): ci: reduce pre-run delay to 2-min and add missing `needs: delay`, final test

- No change release just testing

---

## Changes 11/4/2025 (v1.8.4)

release(v1.8.4): ci: add 3-min pre-run delay to avoid workflow_run races

- No change release just testing

---

## Changes 11/4/2025 (v1.8.3)

release(v1.8.3): feat(mobile+ci): harden Capacitor switcher & make release-on-version robust

- switcher.js: allow running inside Capacitor; remove innerHTML usage; build nodes safely; normalize/strip creds from URLs; add withParam() for ?frapp=1; drop inline handlers; clamp rename length; minor UX polish.
- CI: cancel superseded runs per ref; checkout triggering commit (workflow_run head_sha); improve APP_VERSION parsing; point tag to checked-out commit; add recent-tag debug.

---

## Changes 11/4/2025 (v1.8.2)

release(v1.8.2): media progress tracking + watched badges; PWA scaffolding; mobile switcher (closes #37)

- **Highlights**
  - Video: auto-save playback progress and mark “Watched”, with resume-on-open and inline status chips on list/gallery.
  - Mobile: introduced FileRise Mobile (Capacitor) companion repo + in-app server switcher and PWA bits.

- **Details**
  - API (new):
    - POST /api/media/updateProgress.php — persist per-user progress (seconds/duration/completed).
    - GET  /api/media/getProgress.php — fetch per-file progress.
    - GET  /api/media/getViewedMap.php — folder map for badges.

- **Frontend (media):**
  - Video previews now resume from last position, periodically save progress, and mark completed on end, with toasts.
  - Added status badges (“Watched” / %-complete) in table & gallery; CSS polish for badges.
  - Badges render during list/gallery refresh; safer filename wrapping for badge injection.

- **Mobile & PWA:**
  - New in-app server switcher (Capacitor-aware) loaded only in app/standalone contexts.
  - Service Worker + manifest added (root scope via /public/sw.js; worker body in /js/pwa/sw.js; manifest icons).
  - main.js conditionally imports the mobile switcher and registers the SW on web origins only.

- **Notes**
  - Companion repo: **filerise-mobile** (Capacitor app shell) created for iOS/Android distribution.
  - No breaking changes expected; endpoints are additive.

Closes #37.

---

## Changes 11/3/2025 (V1.8.1)

release(v1.8.1): fix(security,onlyoffice): sanitize DS origin; safe api.js/iframe probes; better UX placeholder

- Add ONLYOFFICE URL sanitizers:
  - getTrustedDocsOrigin(): enforce http/https, strip creds, normalize to origin
  - buildOnlyOfficeApiUrl(): construct fixed /web-apps/.../api.js via URL()
- Probe hardening (addresses CodeQL js/xss-through-dom):
  - ooProbeScript/ooProbeFrame now use sanitized origins and fixed paths
  - optional CSP nonce support for injected script
  - optional iframe sandbox; robust cleanup/timeout handling
- CSP helper now renders lines based on validated origin (fallback to raw for visibility)
- Admin UI UX: placeholder switched to HTTPS example (`https://docs.example.com`)
- Comments added to justify safety to static analyzers

Files: public/js/adminPanel.js

Refs: #37

---

## Changes 11/3/2025 (v1.8.0)

release(v1.8.0): feat(onlyoffice): first-class ONLYOFFICE integration (view/edit), admin UI, API, CSP helpers

Refs #37 — implements ONLYOFFICE integration suggested in the discussion; video progress saving will be tracked separately.

Adds secure, ACL-aware ONLYOFFICE support throughout FileRise:

- **Backend / API**
  - New OnlyOfficeController with supported extensions (doc/xls/ppt/pdf etc.), status/config endpoints, and signed download flow.
  - New endpoints:
    - GET /api/onlyoffice/status.php — reports availability + supported exts.  
    - GET /api/onlyoffice/config.php — returns DocEditor config (signed URLs, callback).  
    - GET /api/onlyoffice/signed-download.php — serves signed blobs to DS.  
  - Effective config/overrides: env/constant wins; supports docsOrigin, publicOrigin, and jwtSecret; status gated on presence of origin+secret.
  - Public origin resolution (BASE_URL/proxy aware) for absolute URLs.

- **Admin config / UI**
  - AdminPanel gets a new “ONLYOFFICE” section with Enable toggle, Document Server Origin, masked JWT Secret, and “Replace” control.
  - Built-in connection tester (status, secret presence, callback ping, api.js load, iframe embed) + CSP helper (Apache & Nginx snippets)

- **Frontend integration**
  - fileEditor detects OO capability via /api/onlyoffice/status and routes supported types to the DocEditor; loads DocsAPI dynamically.
  - editFile() short-circuits to openOnlyOffice when applicable; includes live dark/light theme sync where supported.
  - fileListView pulls status once on load to drive UI decisions (e.g., editing affordances).

- **AdminModel / config**
  - Adds onlyoffice {enabled, docsOrigin, publicOrigin} defaults and update path, with jwtSecret persisted (kept unless explicitly replaced).
  - Optional constants in config.php to override and debug.

- **Security & UX notes**
  - Editor access remains ACL-checked (read/edit) and uses absolute, signed URLs surfaced via controller.  
  - Admin UI never echoes secrets; “Replace” toggles explicit updates only.  
  - CSP helper makes it straightforward to permit api.js + iframe + XHR to your DS.  

- **Docs/Styling**
  - Minor CSS touch-ups around hover states and modal layout.

---

## Changes 11/2/2025 (v1.7.5)

release(v1.7.5): CSP hardening, API-backed previews, flicker-free theming, cache tuning & deploy script (closes #50)
release(v1.7.5): retrigger CI bump (no code changes)
release(v1.7.5): retrigger CI bump ensure up to date

### Security/headers

- Tighten CSP: pin the inline pre-theme snippet with a script-src SHA-256 and keep everything else on 'self'.
- Improve cache policy for versioned assets: force 1y + immutable and add s-maxage for CDNs; also avoid HSTS redirects on local/dev hosts.

### Previews & editor

- Remove hardcoded `/uploads/` paths; always build preview URLs via the API (respects UPLOAD_DIR/ACL).
- Use the API URL for gallery prev/next and file-menu “Preview” to fix 404s on custom storage roots.
- Editor now probes size safely (HEAD → Range 0-0 fallback) before fetching, then fetches with credentials.

### Login, theming & UX polish

- Pre-theme inline boot sets `dark-mode` + background early; swap to `[hidden]`/`unhide()` instead of inline `display:none`.
- Add full-screen loading overlay with quick fade and proper color-scheme; prevent white/black flash on theme flips.
- Refactor app/login reveal flow in `main.js` (`revealAppAndHideOverlay`, `authed` path, setup wizard).

### HTML/CSS & perf

- Make Bootstrap/Styles/Roboto critical (plain `<link rel="stylesheet">`); keep fonts as true preloads; modulepreload app entry.
- Export a `__CSS_PROMISE__` from `defer-css.js` for sites that still promote preloads.
- Header logo marked `fetchpriority="high"` for faster first paint.
- Normalize dark-mode selectors to `.dark-mode` scope (admin panel, etc.).

### Manual Deploy script

- Add `scripts/filerise-deploy.sh`: idempotent rsync-based deploy with writable dirs preserved, optional Composer install, and PHP-FPM/Apache reloads.

### Notes

- If you change the inline pre-theme snippet, update the CSP hash accordingly.

---

## Changes 10/31/2025 (v1.7.4)

release(v1.7.4): login hint replace toast + fix unauth boot

main.js

- Added isDemoHost() and showLoginTip(message).
- In the unauth branch, call showLoginTip('Please log in to continue').
- Removed ensureToastReady() + showToast('please_log_in_to_continue') in the unauth path to avoid loading toast/DOM utils before auth.

---

## Changes 10/31/2025 (v1.7.3)

release(v1.7.3): lightweight boot pipeline, dramatically faster first paint, deduped /api writes, sturdier uploads/auth

### 🎃 Highlights (advantages) 👻 🦇

- ⚡ Faster, cleaner boot: a lightweight **main.js** decides auth/setup before painting, avoids flicker, and wires modules exactly once.
- ♻️ Fewer duplicate actions: **request coalescer** dedupes POST/PUT/PATCH/DELETE to /api/* .
- ✅ Truthy UX: global **toast bridge** queues early toasts and normalizes misleading “not found/already exists” messages after success.
- 🔐 Smoother auth: CSRF priming/rotation + **TOTP step-up detection** across JSON & redirect paths; “Welcome back, `user`” toast once per tab.
- 🌓 Polished UI: **dark-mode persistence with system fallback**, live siteConfig title application, higher-z modals, drag auto-scroll.
- 🚀 Faster first paint & interactions: defer CodeMirror/Fuse/Resumable, promote preloaded CSS, and coalesce duplicate requests → snappier UI.
- 🧭 Admin polish: live header title preview, masked OIDC fields with **Replace** flow, and a **read-only Sponsors/Donations** section.
- 🧱 Safer & cache-smarter: opinionated .htaccess (CSP/HSTS/MIME/compression) + `?v={{APP_QVER}}` for versioned immutable assets.

### Core bootstrap (main.js) overhaul

- Early **toast bridge** (queues until domUtils is ready); expose `window.__FR_TOAST_FILTER__` for centralized rewrites/suppression.
- **Result guard + request coalescer** wrapping `fetch`:
  - Dedupes same-origin `/api/*` mutating requests for ~800ms using a stable key (method + path + normalized body).
  - Tracks “last OK” JSON (`success|status|result=ok`) to suppress false-negative error toasts after success.
- **Boot orchestrator** with hard guards:
  - `__FR_FLAGS` (`booted`, `initialized`, `wired.*`, `bootPromise`, `entryStarted`) to prevent double init/leaks.
  - **No-flicker login**: resolve `checkAuth()` + `setup` before showing UI; show login only when truly unauthenticated.
  - **Heavy boot** for authed users: load i18n, `appCore.loadCsrfToken/initializeApp`, first file list, then light UI wiring.
- **Auth flow**:
  - `primeCsrf()` + `<meta name="csrf-token">` management; persist token in localStorage.
  - **TOTP** detection via header (`X-TOTP-Required`) & JSON (`totp_required` / `TOTP_REQUIRED`); calls `openTOTPLoginModal()`.
  - **Welcome toast** once per tab via `sessionStorage.__fr_welcomed`.
- **UI/UX niceties**:
  - `applySiteConfig()` updates header title & login method visibility on both login & authed screens.
  - Dark-mode persistence with system fallback, proper a11y labels/icons.
  - Create dropdown/menu wiring with capture-phase outside-click + ESC close; modal cancel safeties.
  - Lift modals above cards (z-index), **drag auto-scroll** near viewport edges.
  - Dispatch legacy `DOMContentLoaded`/`load` **once** (supports older inline handlers).
  - Username label refresh for existing `.user-name-label` without injecting new DOM.

### Performance & UX changes

- CSS/first paint:
  - Preload Bootstrap & app CSS; promote at DOMContentLoaded; keep inline CSS minimal.
  - Add `width/height/decoding/fetchpriority` to logo to reduce layout shift.
- Search/editor/uploads:
  - **fileListView.js**: lazy-load Fuse with instant substring fallback; `warmUpSearch()` hook.
  - **fileEditor.js**: lazy-load CodeMirror core/theme/modes; start plain then upgrade; guard very large files gracefully.
  - **upload.js**: lazy-load Resumable; resilient init; background warm-up; smarter addFile/submit; clearer toasts.
- Toast/UX:
  - Install early toast bridge; queue & normalize messages; neutral “Done.” when server returns misleading errors after success.

### Correctness: uploads, paths, ACLs

- **UploadController/UploadModel**: normalize folders via `ACL::normalizeFolder(rawurldecode())`; stricter segment checks; consistent base paths; safer metadata writes; proper chunk presence/merge & temp cleanup.

### Auth hardening & resilience

- **auth.js/main.js/appCore.js**: CSRF rotate/retry (JSON then x-www-form-urlencoded fallback); robust login handling; fewer misleading error toasts.
- **AuthController**: OIDC username fallback to `email` or `sub` when `preferred_username` missing.

### Admin panel

- **adminPanel.js**:
  - Live header title preview (instant update without reload).
  - Masked OIDC client fields with **Replace** button; saved-value hints; only send secrets when replacing.
  - **New “Sponsor / Donations” section (read-only)**:
    - GitHub Sponsors → `https://github.com/sponsors/error311`
    - Ko-fi → `https://ko-fi.com/error311`
    - Includes **Copy** and **Open** buttons; values are fixed.
- **AdminController**: boolean for `oidc.hasClientId/hasClientSecret` to drive masked inputs.

### Security & caching (.htaccess)

- Consolidated security headers (CSP, CORP, HSTS on HTTPS), MIME types, compression (Brotli/Deflate), TRACE disable.
- Caching rules:
  - HTML/version.js: no-cache; unversioned JS/CSS: 1h; unversioned static: 7d; **versioned assets `?v=`: 1y `immutable`**.
- **config.php**: remove duplicate runtime headers (now via Apache) to avoid proxy/CDN conflicts.

### Upgrade notes

- No schema changes.
- Ensure Apache modules (`headers`, `rewrite`, `brotli`/`deflate`) are available for the new .htaccess rules (fallbacks included).
- Versioned assets mean users shouldn’t need a hard refresh; `?v={{APP_QVER}}` busts caches automatically.

---

## Changes 10/29/2025 (v1.7.0 & v1.7.1 & v1.7.2)

release(v1.7.0): asset cache-busting pipeline, public siteConfig cache, JS core split, and caching/security polish

### ✨ Features

- Public, non-sensitive site config cache:
  - Add `AdminModel::buildPublicSubset()` and `writeSiteConfig()` to write `USERS_DIR/siteConfig.json`.
  - New endpoint `public/api/siteConfig.php` + `UserController::siteConfig()` to serve the public subset (regenerates if stale).
  - Frontend now reads `/api/siteConfig.php` (safe subset) instead of `/api/admin/getConfig.php`.
- Frontend module versioning:
  - Replace all module imports with `?v={{APP_QVER}}` query param so the release/Docker stamper can pin exact versions.
  - Add `scripts/stamp-assets.sh` to stamp `?v=` and `{{APP_VER}}/{{APP_QVER}}` in **staging** for ZIP/Docker builds.

### 🧩 Refactors

- Extract shared boot/bootstrap logic into `public/js/appCore.js`:
  - CSRF helpers (`setCsrfToken`, `getCsrfToken`, `loadCsrfToken`)
  - `initializeApp()`, `triggerLogout()`
  - Keep `main.js` lean; wrap global `fetch` once to append/rotate CSRF.
- Update imports across JS modules to use versioned module URLs.

### 🚀 Performance

- Aggressive, safe caching for versioned assets:
  - `.htaccess`: `?v=…` ⇒ `Cache-Control: max-age=31536000, immutable`.
  - Unversioned JS/CSS short cache (1h), other static (7d).
- Eliminate duplicate `main.js` loads and tighten CodeMirror mode loading.

### 🔒 Security / Hardening

- `.htaccess`:
  - Conditional HSTS only when HTTPS, add CORP and X-Permitted-Cross-Domain-Policies.
  - CSP kept strict for modules, workers, blobs.
- Admin config exposure reduced to a curated subset in `siteConfig.json`.

### 🧪 CI/CD / Release

- **FileRise repo**
  - `sync-changelog.yml`: keep `public/js/version.js` as source-of-truth only (no repo-wide stamping).
  - `release-on-version.yml`: build **stamped** ZIP from a staging copy via `scripts/stamp-assets.sh`, verify placeholders removed, attach checksum.
- **filerise-docker repo**
  - Read `VERSION`, checkout app to `app/`, run stamper inside build context before `docker buildx`, tag `latest` and `:${VERSION}`.

### 🔧 Defaults

- Sample/admin config defaults now set `disableBasicAuth: true` (safer default). Existing installations keep their current setting.

### 📂 Notable file changes

- `src/models/AdminModel.php` (+public subset +atomic write)
- `src/controllers/UserController.php` (+siteConfig action)
- `public/api/siteConfig.php` (new)
- `public/js/appCore.js` (new), `public/js/main.js` (slim, uses appCore)
- Many `public/js/*.js` import paths updated to `?v={{APP_QVER}}`
- `public/.htaccess` (caching & headers)
- `scripts/stamp-assets.sh` (new)

### ⚠️ Upgrade notes

- Ensure `USERS_DIR` is writable by web server for `siteConfig.json`.
- Proxies/edge caches: the new `?v=` scheme enables long-lived immutable caching; purge is automatic on version bump.
- If you previously read admin config directly on the client, it now reads `/api/siteConfig.php`.

### Additional changes/fixes for release

- `release-on-version.yml`
  - normalize line endings (strip CRLF)
  - stamp-assets.sh don’t rely on the exec; invoke via bash

release(v1.7.2): harden asset stamping & CI verification

### build(stamper)

- Rewrite scripts/stamp-assets.sh to be repo-agnostic and macOS/Windows friendly:
  - Drop reliance on git ls-files/mapfile; use find + null-delimited loops
  - Normalize CRLF to LF for all web assets before stamping
  - Stamp ?v=<APP_QVER> in HTML/CSS/PHP and {{APP_VER}} everywhere
  - Normalize any ".mjs|.js?v=..." occurrences inside JS (ESM imports/strings)
  - Force-write public/js/version.js from VER (source of truth in stamped output)
  - Print touched counts and fail fast if any {{APP_QVER}}|{{APP_VER}} remain

---

## Changes 10/28/2025 (v1.6.11)

release(v1.6.11) fix(ui/dragAndDrop) restore floating zones toggle click action

Re-add the click handler to toggle `zonesCollapsed` so the header
“sidebarToggleFloating” button actually expands/collapses the zones
again. This regressed in v1.6.10 during auth-gating refactor.

Refs: #regression #ux

chore(codeql): move config to repo root for default setup

- Relocate .github/codeql/codeql-config.yml to codeql-config.yml so GitHub default code scanning picks it up
- Keep paths: public/js, api
- Keep ignores: public/vendor/**, public/css/vendor/**, public/fonts/**, public/**/*.min.{js,css}, public/**/*.map

---

## Changes 10/28/2025 (v1.6.10)

release(v1.6.10): self-host ReDoc, gate sidebar toggle on auth, and enrich release workflow

- Vendor ReDoc and add MIT license file under public/vendor/redoc/; switch api.php to local bundle to satisfy CSP (script-src 'self').
- main.js: add/remove body.authenticated on login/logout so UI can reflect auth state.
- dragAndDrop.js: only render sidebarToggleFloating when authenticated; stop event bubbling, keep dark-mode styles.
- sync-changelog.yml: also stamp ?v= in PHP templates (public/**/*.php).
- release-on-version.yml: build zip first, compute SHA-256, assemble release body with latest CHANGELOG snippet, “Full Changelog” compare link, and attach .sha256 alongside the zip.
- THIRD_PARTY.md: document ReDoc vendoring and rationale.

Refs: #security #csp #release

---

## Changes 10/27/2025 (v1.6.9)

release(v1.6.9): feat(core) localize assets, harden headers, and speed up load

- index.html: drop all CDNs in favor of local /vendor assets
  - add versioned cache-busting query (?v=…) on CSS/JS
  - wire version.js for APP_VERSION and numeric cache key
- public/vendor/: add pinned copies of:
  - bootstrap 4.5.2, codemirror 5.65.5 (+ themes/modes), dompurify 2.4.0,
    fuse.js 6.6.2, resumable.js 1.1.0
- fonts: add self-hosted Material Icons + Roboto (latin + latin-ext) with
  vendor CSS (material-icons.css, roboto.css)

- fileEditor.js: load CodeMirror modes from local vendor with ?v=APP_VERSION_NUM,
  keep timeout/plain-text fallback, no SRI (same-origin)
- dragAndDrop.js: nudge zonesToggle 65px left to sit tighter to the logo

- styles.css: prune/organize rules and add small utility classes; move 3P
  font CSS to /css/vendor/

- .htaccess: security + performance overhaul
  - Content-Security-Policy: default-src 'self'; img-src include data: and blob:
  - version-aware caching: HTML/version.js = no-cache; assets with ?v= = 1y immutable
  - correct MIME for fonts/SVG; enable Brotli/Gzip (if available)
  - X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy
  - disable TRACE; deny dotfiles; prevent directory listing

- .gitattributes: mark vendor/minified as linguist-vendored, treat assets as
  binary in diffs, exclude CI/resources from source archives

- docs/licensing:
  - add licenses/ and THIRD_PARTY.md with upstream licenses/attribution
  - README: add “License & Credits” section with components and licenses

- CI: (sync-changelog) stamp asset cache-busters to the numeric release
  (e.g. ?v=1.6.9) and write window.APP_VERSION in version.js before Docker build

perf: site loads significantly faster with local assets + compression + long-lived caching
security: CSP, strict headers, and same-origin assets reduce XSS/SRI/CORS risk

Refs: #performance #security

---

## Changes 10/25/2025 (v1.6.8)

release(v1.6.8): fix(ui) prevent Extract/Create flash on refresh; remember last folder

- Seed `currentFolder` from `localStorage.lastOpenedFolder` (fallback to "root")
- Stop eager `loadFileList('root')` on boot; defer initial load to resolved folder
- Hide capability-gated actions by default (`#extractZipBtn`, `#createBtn`) to avoid pre-auth flash
- Eliminates transient root state when reloading inside a subfolder

User-visible: refreshing a non-root folder no longer flashes Root items or privileged buttons; app resumes in the last opened folder.

---

## Changes 10/25/2025 (v1.6.7)

release(v1.6.7): Folder Move feature, stable DnD persistence, safer uploads, and ACL/UI polish

### 📂 Folder Move (new major feature)

**Drag & Drop to move folder, use context menu or Move Folder button**  

- Added **Move Folder** support across backend and UI.  
  - New API endpoint: `public/api/folder/moveFolder.php`  
  - Controller and ACL updates to validate scope, ownership, and permissions.  
  - Non-admins can only move within folders they own.  
  - `ACL::renameTree()` re-keys all subtree ACLs on folder rename/move.  
- Introduced new capabilities:
  - `canMoveFolder`
  - `canMove` (UI alias for backward compatibility)
- New “Move Folder” button + modal in the UI with full i18n strings (`i18n.js`).  
- Action button styling and tooltip consistency for all folder actions.

### 🧱 Drag & Drop / Layout Improvements

- Fixed **random sidebar → top zone jumps** on refresh.  
- Cards/panels now **persist exactly where you placed them** (`userZonesSnapshot`)  
  — no unwanted repositioning unless the window is resized below the small-screen threshold.
- Added hysteresis around the 1205 px breakpoint to prevent flicker when resizing.  
- Eliminated the 50 px “ghost” gutter with `clampSidebarWhenEmpty()`:
  - Sidebar no longer reserves space when collapsed or empty.  
  - Temporarily “unclamps” during drag so drop targets remain accurate and full-width.  
- Removed forced 800 px height on drag highlight; uses natural flex layout now.  
- General layout polish — smoother transitions when toggling *Hide/Show Panels*.

### ☁️ Uploads & UX

- Stronger folder sanitization and safer base-path handling.  
- Fixed subfolder creation when uploading directories (now builds under correct parent).  
- Improved chunk error handling and metadata key correctness.  
- Clearer success/failure toasts and accurate filename display from server responses.

### 🔐 Permissions / ACL

- Simplified file rename checks — now rely solely on granular `ACL::canRename()`.  
- Updated capability lists to include move/rename operations consistently.

### 🌐 UI / i18n Enhancements

- Added i18n strings for new “Move Folder” prompts, modals, and tooltips.  
- Minor UI consistency tweaks: button alignment, focus states, reduced-motion support.  

---

## Changes 10/24/2025 (v1.6.6)

release(v1.6.6): header-mounted toggle, dark-mode polish, persistent layout, and ACL fix

- dragAndDrop: mount zones toggle beside header logo (absolute, non-scrolling);
  stop click propagation so it doesn’t trigger the logo link; theme-aware styling
  - live updates via MutationObserver; snapshot card locations on drop and restore
  on load (prevents sidebar reset); guard first-run defaults with
  `layoutDefaultApplied_v1`; small/medium layout tweaks & refactors.
- CSS: switch toggle icon to CSS variable (`--toggle-icon-color`) with dark-mode
  override; remove hardcoded `!important`.
- API (capabilities.php): remove unused `disableUpload` flag from `canUpload`
  and flags payload to resolve undefined variable warning.

---

## Changes 10/24/2025 (v1.6.5)

release(v1.6.5): fix PHP warning and upload-flag check in capabilities.php

- Fix undefined variable: use $disableUpload consistently
- Harden flag read: (bool)($perms['disableUpload'] ?? false)
- Prevents warning and ensures Upload capability is computed correctly

---

## Changes 10/24/2025 (v1.6.4)

release(v1.6.4): runtime version injection + CI bump/sync; caching tweaks

- Add public/js/version.js (default "dev") and load it before main.js.
- adminPanel.js: replace hard-coded string with `window.APP_VERSION || "dev"`.
- public/.htaccess: add no-cache for js/version.js
- GitHub Actions: replace sync job with “Bump version and sync Changelog to Docker Repo”.
  - Parse commit msg `release(vX.Y.Z)` -> set step output `version`.
  - Write `public/js/version.js` with `window.APP_VERSION = '<version>'`.
  - Commit/push version.js if changed.
  - Mirror CHANGELOG.md to filerise-docker and write a VERSION file with `<version>`.
  - Guard all steps with `if: steps.ver.outputs.version != ''` to no-op on non-release commits.

This wires the UI version label to CI, keeps dev builds showing “dev”, and feeds the Docker repo with CHANGELOG + VERSION for builds.

---

## Changes 10/24/2025 (v1.6.3)

release(v1.6.3): drag/drop card persistence, admin UX fixes, and docs (closes #58)

Drag & Drop - Upload/Folder Management Cards layout

- Persist panel locations across refresh; snapshot + restore when collapsing/expanding.
- Unified “zones” toggle; header-icon mode no longer loses card state.
- Responsive: auto-move sidebar cards to top on small screens; restore on resize.
- Better top-zone placeholder/cleanup during drag; tighter header modal sizing.
- Safer order saving + deterministic placement for upload/folder cards.

Admin Panel – Folder Access

- Fix: newly created folders now appear without a full page refresh (cache-busted `getFolderList`).
- Show admin users in the list with full access pre-applied and inputs disabled (read-only).
- Skip sending updates for admins when saving grants.
- “Folder” column now has its own horizontal scrollbar so long names / “Inherited from …” are never cut off.

Admin Panel – User Permissions (flags)

- Show admins (marked as Admin) with all switches disabled; exclude from save payload.
- Clarified helper text (account-level vs per-folder).

UI/Styling

- Added `.folder-cell` scroller in ACL table; improved dark-mode scrollbar/thumb.

Docs

- README edits:
  - Clarified PUID/PGID mapping and host/NAS ownership requirements for mounted volumes.
  - Environment variables section added
  - CHOWN_ON_START additional details
  - Admin details
  - Upgrade section added
  - 💖 Sponsor FileRise section added

---

## Changes 10/23/2025 (v1.6.2)

feat(i18n,auth): add Simplified Chinese (zh-CN) and expose in User Panel

- Add zh-CN locale to i18n.js with full key set.
- Introduce chinese_simplified label key across locales.
- Added some missing labels
- Update language selector mapping to include zh-CN (English/Spanish/French/German/简体中文).
- Wire zh-CN into Auth/User Panel (authModals) language dropdown.
- Fallback-safe rendering for language names when a key is missing.

ui: fix “Change Password” button sizing in User Panel

- Keep consistent padding and font size for cleaner layout

---

## Changes 10/23/2025 (v1.6.1)

feat(ui): unified zone toggle + polished interactions for sidebar/top cards

- Add floating toggle button styling (hover lift, press, focus ring, ripple)
  for #zonesToggleFloating and #sidebarToggleFloating (CSS).
- Ensure icons are visible and centered; enforce consistent sizing/color.
- Introduce unified “zones collapsed” state persisted via `localStorage.zonesCollapsed`.
- Update dragAndDrop.js to:
  - manage a single floating toggle for both Sidebar and Top Zone
  - keep toggle visible when cards are in Top Zone; hide only when both cards are in Header
  - rotate icon 90° when both cards are in Top Zone and panels are open
  - respect collapsed state during DnD flows and on load
  - preserve original DnD behaviors and saved orders (sidebar/header)
- Minor layout/visibility fixes during drag (clear temp heights; honor collapsed).

Notes:

- No breaking API changes; existing `sidebarOrder` / `headerOrder` continue to work.
- New key: `zonesCollapsed` (string '0'/'1') controls visibility of Sidebar + Top Zone.

UX:

- Floating toggle feels more “material”: subtle hover elevation, press feedback,
  focus ring, and click ripple to restore the prior interactive feel.
- Icons remain legible on white (explicit color set), centered in the circular button.

---

## Changes 10/22/2025 (v1.6.0)

feat(acl): granular per-folder permissions + stricter gates; WebDAV & UI aligned

- Add granular ACL buckets: create, upload, edit, rename, copy, move, delete, extract, share_file, share_folder
- Implement ACL::canX helpers and expand upsert/explicit APIs (preserve read_own)
- Enforce “write no longer implies read” in canRead; use granular gates for write-ish ops
- WebDAV: use canDelete for DELETE, canUpload/canEdit + disableUpload for PUT; enforce ownership on overwrite
- Folder create: require Manage/Owner on parent; normalize paths; seed ACL; rollback on failure
- FileController: refactor copy/move/rename/delete/extract to granular gates + folder-scope checks + own-only ownership enforcement
- Capabilities API: compute effective actions with scope + readOnly/disableUpload; protect root
- Admin Panel (v1.6.0): new Folder Access editor with granular caps, inheritance hints, bulk toggles, and UX validations
- getFileList: keep root visible but inert for users without visibility; apply own-only filtering server-side
- Bump version to v1.6.0

---

## Changes 10/20/2025 (v1.5.3)

security(acl): enforce folder-scope & own-only; fix file list “Select All”; harden ops

### fileListView.js (v1.5.3)

- Restore master “Select All” checkbox behavior and row highlighting.
- Keep selection working with own-only filtered lists.
- Build preview/thumb URLs via secure API endpoints; avoid direct /uploads.
- Minor UI polish: slider wiring and pagination focus handling.

### FileController.php (v1.5.3)

- Add enforceFolderScope($folder, $user, $perms, $need) and apply across actions.
- Copy/Move: require read on source, write on destination; apply scope on both.
- When user only has read_own, enforce per-file ownership (uploader==user).
- Extract ZIP: require write + scope; consistent 403 messages.
- Save/Rename/Delete/Create: tighten ACL checks; block dangerous extensions; consistent CSRF/Auth handling and error codes.
- Download/ZIP: honor read vs read_own; own-only gates by uploader; safer headers.

### FolderController.php (v1.5.3)

- Align with ACL: enforce folder-scope for non-admins; require owner or bypass for destructive ops.
- Create/Rename/Delete: gate by write on parent/target + ownership when needed.
- Share folder link: require share capability; forbid root sharing for non-admins; validate expiry; optional password.
- Folder listing: return only folders user can fully view or has read_own.
- Shared downloads/uploads: stricter validation, headers, and error handling.

This commits a consistent, least-privilege ACL model (owners/read/write/share/read_own), fixes bulk-select in the UI, and closes scope/ownership gaps across file & folder actions.

feat(dnd): default cards to sidebar on medium screens when no saved layout

- Adds one-time responsive default in loadSidebarOrder() (uses layoutDefaultApplied_v1)
- Preserves existing sidebarOrder/headerOrder and small-screen behavior
- Keeps user changes persistent; no override once a layout exists

feat(editor): make modal non-blocking; add SRI + timeout for CodeMirror mode loads

- Build the editor modal immediately and wire close (✖, Close button, and Esc) before any async work, so the UI is always dismissible.
- Restore MODE_URL and add normalizeModeName() to resolve aliases (text/html → htmlmixed, php → application/x-httpd-php).
- Add SRI for each lazily loaded mode (MODE_SRI) and apply integrity/crossOrigin on script tags; switch to async and improved error messages.
- Introduce MODE_LOAD_TIMEOUT_MS=2500 and Promise.race() to init in text/plain if a mode is slow; auto-upgrade to the real mode once it arrives.
- Graceful fallback: if CodeMirror core isn’t present, keep textarea, enable Save, and proceed.
- Minor UX: disable Save until the editor is ready, support theme toggling, better resize handling, and font size controls without blocking.

Security: Locks CDN mode scripts with SRI.

---

## Changes 10/19/2025 (v1.5.2)

fix(admin): modal bugs; chore(api): update ReDoc SRI; docs(openapi): add annotations + spec

- adminPanel.js
  - Fix modal open/close reliability and stacking order
  - Prevent background scroll while modal is open
  - Tidy focus/keyboard handling for better UX

- style.css
  - Polish styles for Folder Access + Users views (spacing, tables, badges)
  - Improve responsiveness and visual consistency

- api.php
  - Update Redoc SRI hash and pin to the current bundle URL

- OpenAPI
  - Add/refresh inline @OA annotations across endpoints
  - Introduce src/openapi/Components.php with base Info/Server,
    common responses, and shared components
  - Regenerate and commit openapi.json.dist

- public/js/adminPanel.js
- public/css/style.css
- public/api.php
- src/openapi/Components.php
- openapi.json.dist
- public/api/** (annotated endpoints)

---

## Changes 10/19/2025 (v1.5.1)

fix(config/ui): serve safe public config to non-admins; init early; gate trash UI to admins; dynamic title; demo toast (closes #56)

Regular users were getting 403s from `/api/admin/getConfig.php`, breaking header title and login option rendering. Issue #56 tracks this.

### What changed

- **AdminController::getConfig**
  - Return a **public, non-sensitive subset** of config for everyone (incl. unauthenticated and non-admin users): `header_title`, minimal `loginOptions` (disable* flags only), `globalOtpauthUrl`, `enableWebDAV`, `sharedMaxUploadSize`, and OIDC `providerUrl`/`redirectUri`.
  - For **admins**, merge in admin-only fields (`authBypass`, `authHeaderName`).
  - Never expose secrets or client IDs.
- **auth.js**
  - `loadAdminConfigFunc()` now robustly handles empty/204 responses, writes sane defaults, and sets `document.title` from `header_title`.
  - `showToast()` override: on `demo.filerise.net` shows a longer demo-creds toast; keeps TOTP “don’t nag” behavior.
- **main.js**
  - Call `loadAdminConfigFunc()` early during app init.
  - Run `setupTrashRestoreDelete()` **only for admins** (based on `localStorage.isAdmin`).
- **adminPanel.js**
  - Bump visible version to **v1.5.1**.
- **index.html**
  - Keep `<title>FileRise</title>` static; runtime title now driven by `loadAdminConfigFunc()`.

### Security v1.5.1

- Prevents info disclosure by strictly limiting non-admin fields.
- Avoids noisy 403 for regular users while keeping admin-only data protected.

### QA

- As a non-admin:
  - Opening the app no longer triggers a 403 on `getConfig.php`.
  - Header title and login options render; document tab title updates to configured `header_title`.
  - Trash/restore UI is not initialized.
- As an admin:
  - Admin Panel loads extra fields; trash/restore UI initializes.
  - Title updates correctly.
- On `demo.filerise.net`:
  - Pre-login toast shows demo credentials for ~12s.

Closes #56.

---

## Changes 10/17/2025 (v1.5.0)

Security and permission model overhaul. Tightens access controls with explicit, server‑side ACL checks across controllers and WebDAV. Introduces `read_own` for own‑only visibility and separates view from write so uploaders can’t automatically see others’ files. Fixes session warnings and aligns the admin UI with the new capabilities.

> **Security note**
> This release contains security hardening based on a private report (tracked via a GitHub Security Advisory, CVE pending). For responsible disclosure, details will be published alongside the advisory once available. Users should upgrade promptly.

### Highlights

- **ACL**
  - New `read_own` bucket (own‑only visibility) alongside `owners`, `read`, `write`, `share`.
  - **Semantic change:** `write` no longer implies `read`.
  - `ACL::applyUserGrantsAtomic()` to atomically set per‑folder grants (`view`, `viewOwn`, `upload`, `manage`, `share`).
  - `ACL::purgeUser($username)` to remove a user from all buckets (used when deleting a user).
  - Auto‑heal `folder_acl.json` (ensure `root` exists; add missing buckets; de‑dupe; normalize types).
  - More robust admin detection (role flag or session/admin user).

- **Controllers**
  - `FileController`: ACL + ownership enforcement for list, download, zip download, extract, move, copy, rename, create, save, tag edit, and share‑link creation. `getFileList()` now filters to the caller’s uploads when they only have `read_own` (no `read`).
  - `UploadController`: requires `ACL::canWrite()` for the target folder; CSRF refresh path improved; admin bypass intact.
  - `FolderController`: listing filtered by `ACL::canRead()`; optional parent filter preserved; removed name‑based ownership assumptions.

- **Admin UI**
  - Folder Access grid now includes **View (own)**; bulk toolbar actions; column alignment fixes; more space for folder names; dark‑mode polish.

- **WebDAV**
  - WebDAV now enforces ACL consistently: listing requires `read` (or `read_own` ⇒ shows only caller’s files); writes require `write`.
  - Removed legacy “folderOnly” behavior — ACL is the single source of truth.
  - Metadata/uploader is preserved through existing models.

### Behavior changes (⚠️ Breaking)

- **`write` no longer implies `read`.**
  - If you want uploaders to see all files in a folder, also grant **View (all)** (`read`).
  - If you want uploaders to see only their own files, grant **View (own)** (`read_own`).

- **Removed:** legacy `folderOnly` view logic in favor of ACL‑based access.

### Upgrade checklist

1. Review **Folder Access** in the admin UI and grant **View (all)** or **View (own)** where appropriate.
2. For users who previously had “upload but not view,” confirm they now have **Upload** + **View (own)** (or add **View (all)** if intended).
3. Verify WebDAV behavior for representative users:
   - `read` shows full listings; `read_own` lists only the caller’s files.
   - Writes only succeed where `write` is granted.
4. Confirm admin can upload/move/zip across all folders (regression tested).

### Affected areas

- `config/config.php` — session/cookie initialization ordering; proxy header handling.
- `src/lib/ACL.php` — new bucket, semantics, healing, purge, admin detection.
- `src/controllers/FileController.php` — ACL + ownership gates across operations.
- `src/controllers/UploadController.php` — write checks + CSRF refresh handling.
- `src/controllers/FolderController.php` — ACL‑filtered listing and parent scoping.
- `public/api/admin/acl/*.php` — includes `viewOwn` round‑trip and sanitization.
- `public/js/*` & CSS — folder access grid alignment and layout fixes.
- `src/webdav/*` & `public/webdav.php` — ACL‑aware WebDAV server.

### Credits

- Security report acknowledged privately and will be credited in the published advisory.

### Fix

- fix(folder-model): resolve syntax error, unexpected token
- Deleted accidental second `<?php`

---

## Changes 10/15/2025 (v1.4.0)

feat(permissions)!: granular ACL (bypassOwnership/canShare/canZip/viewOwnOnly), admin panel v1.4.0 UI, and broad hardening across controllers/models/frontend

### Security / Hardening

- Tightened ownership checks across file ops; introduced centralized permission helper to avoid falsey-permissions bugs.
- Consistent CSRF verification on mutating endpoints; stricter input validation using `REGEX_*` and `basename()` trims.
- Safer path handling & metadata reads; reduced noisy error surfaces; consistent HTTP codes (401/403/400/500).
- Adds defense-in-depth to reduce risk of unauthorized file manipulation.

### Config (`config.php`)

- Add optional defaults for new permissions (all optional):
  - `DEFAULT_BYPASS_OWNERSHIP` (bool)
  - `DEFAULT_CAN_SHARE` (bool)
  - `DEFAULT_CAN_ZIP` (bool)
  - `DEFAULT_VIEW_OWN_ONLY` (bool)
- Keep existing behavior unless explicitly enabled (bypassOwnership typically true for admins; configurable per user).

### Controllers

#### `FileController.php`

- New lightweight `loadPerms($username)` helper that **always** returns an array; prevents type errors when permissions are missing.
- Ownership checks now respect: `isAdmin(...) || perms['bypassOwnership'] || DEFAULT_BYPASS_OWNERSHIP`.
- Gate sharing/zip operations by `perms['canShare']` / `perms['canZip']`.
- Implement `viewOwnOnly` filtering in `getFileList()` (supports both map and list shapes).
- Normalize and validate folder/file input; enforce folder-only scope for writes/moves/copies where applicable.
- Improve error handling: convert warnings/notices to exceptions within try/catch; consistent JSON error payloads.
- Add missing `require_once PROJECT_ROOT . '/src/models/UserModel.php'` to fix “Class userModel not found”.
- Download behavior: inline for images, attachment for others; owner/bypass logic applied.

#### `FolderController.php`

- `createShareFolderLink()` gated by `canShare`; validates duration (cap at 1y), folder names, password optional.
- (If present) folder share deletion/read endpoints wired to new permission model.

#### `AdminController.php`

- `getConfig()` remains admin-only; returns safe subset. (Non-admins now simply receive 403; client can ignore.)

#### `UserController.php`

- Plumbs new permission fields in get/set endpoints (`folderOnly`, `readOnly`, `disableUpload`, **`bypassOwnership`**, **`canShare`**, **`canZip`**, **`viewOwnOnly`**).
- Normalizes username keys and defaults to prevent undefined-index errors.

### Models

#### `FileModel.php` / `FolderModel.php`

- Respect caller’s effective permissions (controllers pass-through); stricter input normalization.
- ZIP creation/extraction guarded via `canZip`; metadata updates consistent; safer temp paths.
- Improved return shapes and error messages (never return non-array on success paths).

#### `AdminModel.php`

- Reads/writes admin config with new `loginOptions` intact; never exposes sensitive OIDC secrets to the client layer.

#### `UserModel.php`

- Store/load the 4 new flags; helper ensures absent users/fields don’t break caller; returns normalized arrays.

### Frontend

#### `main.js`

- Initialize after CSRF; keep dark-mode persistence, welcome toast, drag-over UX.
- Leaves `loadAdminConfigFunc()` call in place (non-admins may 403; harmless).

#### `adminPanel.js` (v1.4.0)

- New **User Permissions** UI with collapsible rows per user:
  - Shows username; clicking expands a checkbox matrix.
  - Permissions: `folderOnly`, `readOnly`, `disableUpload`, **`bypassOwnership`**, **`canShare`**, **`canZip`**, **`viewOwnOnly`**.
- **Manage Shared Links** section reads folder & file share metadata; delete buttons per token.
- Refined modal sizing & dark-mode styling; consistent toasts; unsaved-changes confirmation.
- Keeps 403 from `/api/admin/getConfig.php` for non-admins (acceptable; no UI break).

### Breaking change

- Non-admin users without `bypassOwnership` can no longer create/rename/move/copy/delete/share/zip files they don’t own.
- If legacy behavior depended on broad access, set `bypassOwnership` per user or use `DEFAULT_BYPASS_OWNERSHIP=true` in `config.php`.

### Migration

- Add the new flags to existing users in your permissions store (or rely on `config.php` defaults).
- Verify admin accounts have either `isAdmin` or `bypassOwnership`/`canShare`/`canZip` as desired.
- Optionally tune `DEFAULT_*` constants for instance-wide defaults.

### Security

- Hardened access controls for file operations based on an external security report.  
  Details are withheld temporarily to protect users; a full advisory will follow after wider adoption of the fix.

---

## Changes 10/8/2025 (no new version)

chore: set up CI, add compose, tighten ignores, refresh README

- CI: add workflow to lint PHP (php -l), validate/audit composer,
  shellcheck *.sh, hadolint Dockerfile, and sanity-check JSON/YAML; supports
  push/PR/manual dispatch.
- Docker: add docker-compose.yml for local dev (8080:80, volumes/env).
- .dockerignore: exclude VCS, build artifacts, OS/editor junk, logs, temp dirs,
  node_modules, resources/, etc. to slim build context.
- .gitignore: ignore .env, editor/system files, build caches, optional data/.
- README: update badges (CI, release, license), inline demo creds, add quick
  links, tighten WebDAV section (Windows HTTPS note + wiki link), reduced length and star
  history chart.

## Changes 10/7/2025 (no new version)

feat(startup): stream error.log to console by default; add LOG_STREAM selector

- Touch error/access logs on start so tail can attach immediately
- Add LOG_STREAM=error|access|both|none (default: error)
- Tail with `-n0 -F` to follow new entries only and survive rotations
- Keep access.log on disk but don’t spam console unless requested
- (Unraid) Optional env var template entry for LOG_STREAM

---

## Changes 10/6/2025 v1.3.15

feat/perf: large-file handling, faster file list, richer CodeMirror modes (fixes #48)

- fileEditor.js: block ≥10 MB; plain-text fallback >5 MB; lighter CM settings for big files.
- fileListView.js: latest-call-wins; compute editable via ext + sizeBytes (no blink).
- FileModel.php: add sizeBytes; cap inline content to ≤5 MB (INDEX_TEXT_BYTES_MAX).
- HTML: load extra CM modes: htmlmixed, php, clike, python, yaml, markdown, shell, sql, vb, ruby, perl, properties, nginx.

---

## Changes 10/5/2025 v1.3.14

fix(admin): OIDC optional by default; validate only when enabled (fixes #44)

- AdminModel::updateConfig now enforces OIDC fields only if disableOIDCLogin=false
- AdminModel::getConfig defaults disableOIDCLogin=true and guarantees OIDC keys
- AdminController default loginOptions sets disableOIDCLogin=true; CSRF via header or body
- Normalize file perms to 0664 after write

---

## Changes 10/4/2025 v1.3.13

fix(scanner): resolve dirs via CLI/env/constants; write per-item JSON; skip trash
fix(scanner): rebuild per-folder metadata to match File/Folder models
chore(scanner): skip profile_pics subtree during scans

- scan_uploads.php now falls back to UPLOAD_DIR/META_DIR from config.php
- prevents double slashes in metadata paths; respects app timezone
- unblocks SCAN_ON_START so externally added files are indexed at boot
- Writes per-folder metadata files (root_metadata.json / folder_metadata.json) using the same naming rule as the models
- Adds missing entries for files (uploaded, modified using DATE_TIME_FORMAT, uploader=Imported)
- Prunes stale entries for files that no longer exist
- Skips uploads/trash and symlinks
- Resolves paths from CLI flags, env vars, or config constants (UPLOAD_DIR/META_DIR)
- Idempotent; safe to run at startup via SCAN_ON_START
- Avoids indexing internal avatar images (folder already hidden in UI)
- Reduces scan noise and metadata churn; keeps firmware/other content indexed

---

## Changes 10/4/2025 v1.3.12

Fix: robust PUID/PGID handling; optional ownership normalization (closes #43)

- Remap www-data to PUID/PGID when running as root; skip with helpful log if non-root
- Added CHOWN_ON_START env to control recursive chown (default true; turn off after first run)
- SCAN_ON_START unchanged, with non-root fallback

---

## Changes 10/4/2025 v1.3.11

Chore: keep BASE_URL fallback, prefer env SHARE_URL; fix HTTPS auto-detect

- Remove no-op sed of SHARE_URL from start.sh (env already used)
- Build default share link with correct scheme (http/https, proxy-aware)

---

## Changes 10/4/2025 v1.3.10

Fix: index externally added files on startup; harden start.sh (#46)

- Run metadata scan before Apache when SCAN_ON_START=true (was unreachable after exec)
- Execute scan as www-data; continue on failure so startup isn’t blocked
- Guard env reads for set -u; add umask 002 for consistent 775/664
- Make ServerName idempotent; avoid duplicate entries
- Ensure sessions/metadata/log dirs exist with correct ownership and perms

No behavior change unless SCAN_ON_START=true.

---

## Changes 5/27/2025 v1.3.9

- Support for mounting CIFS (SMB) network shares via Docker volumes
- New `scripts/scan_uploads.php` script to generate metadata for imported files and folders
- `SCAN_ON_START` environment variable to trigger automatic scanning on container startup
- Documentation for configuring CIFS share mounting and scanning

- Clipboard Paste Upload Support (single image):
  - Users can now paste images directly into the FileRise web interface.
  - Pasted images are renamed to `image<TIMESTAMP>.png` and added to the upload queue using the existing drag-and-drop logic.
  - Implemented using a `.isClipboard` flag and a delayed UI cleanup inside `xhr.addEventListener("load", ...)`.

---

## Changes 5/26/2025

- Updated `REGEX_FOLDER_NAME` in `config.php` to forbids < > : " | ? * characters in folder names.
  - Ensures the whole name can’t end in a space or period.
  - Blocks Windows device names.

- Updated `FolderController.php` when `createFolder` issues invalid folder name to return `http_response_code(400);`

---

## Changes 5/23/2025 v1.3.8

- **Folder-strip context menu**  
  - Enabled right-click on items in the new folder strip (above file list) to open the same “Create / Rename / Share / Delete Folder” menu as in the main folder tree.  
  - Bound `contextmenu` event on each `.folder-item` in `loadFileList` to:
    - Prevent the default browser menu  
    - Highlight the clicked folder-strip item  
    - Invoke `showFolderManagerContextMenu` with menu entries:
      - Create Folder  
      - Rename Folder  
      - Share Folder (passes the strip’s `data-folder` value)  
      - Delete Folder  
  - Ensured menu actions are wrapped in arrow functions (`() => …`) so they fire only on menu-item click, not on render.

- Refactored folder-strip injection in `fileListView.js` to:
  - Mark each strip item as `draggable="true"` (for drag-and-drop)  
  - Add `el.addEventListener("contextmenu", …)` alongside existing click/drag handlers  
  - Clean up global click listener for hiding the context menu

- Prevented premature invocation of `openFolderShareModal` by switching to `action: () => openFolderShareModal(dest)` instead of calling it directly.

- **Create File/Folder dropdown**  
  - Replaced standalone “Create File” button with a combined dropdown button in the actions toolbar.  
  - New markup
  - Wired up JS handlers in `fileActions.js`:
    - `#createFileOption` → `openCreateFileModal()`  
    - `#createFolderOption` → `document.getElementById('createFolderModal').style.display = 'block'`  
    - Toggled `.dropdown-menu` visibility on button click, and closed on outside click.  
  - Applied dark-mode support: dropdown background and text colors switch with `.dark-mode` class.  

---

## Changes 5/22/2025 v1.3.7

- `.folder-strip-container .folder-name` css added to center text below folder material icon.
- Override file share_url to always use current origin
- Update `fileList` css to keep file name wrapping tight.

---

## Changes 5/21/2025

- **Drag & Drop to Folder Strip**  
  - Enabled dragging files from the file list directly onto the folder-strip items.  
  - Hooked up `folderDragOverHandler`, `folderDragLeaveHandler`, and `folderDropHandler` to `.folder-strip-container .folder-item`.  
  - On drop, files are moved via `/api/file/moveFiles.php` and the file list is refreshed.

- **Restore files from trash Toast Message**  
  - Changed the restore handlers so that the toast always reports the actual file(s) restored (e.g. “Restored file: foo.txt”) instead of “No trash record found.”  
  - Removed reliance on backend message payload and now generate the confirmation text client-side based on selected items.  

---

## Changes 5/20/2025 v1.3.6

- **domUtils.js**
  - `updateFileActionButtons`
    - Hide selection buttons (`Delete Files`, `Copy Files`, `Move Files` & `Download ZIP`) until file is selected.
    - Hide `Extract ZIP` until selecting zip files
    - Hide `Create File` button when file list items are selected.

---

## Changes 5/19/2025 v1.3.5

### Added Folder strip & Create File

- **Folder strip in file list**  
  - `loadFileList` now fetches sub-folders in parallel from `/api/folder/getFolderList.php`.  
  - Filters to only direct children of the current folder, hiding `profile_pics` and `trash`.  
  - Injects a new `.folder-strip-container` just below the Files In above (summary + slider).  
  - Clicking a folder in the strip updates:
    - the breadcrumb (via `updateBreadcrumbTitle`)
    - the tree selection highlight
    - reloads `loadFileList` for the chosen folder.

- **Create File feature**  
  - New “Create New File” button added to the file-actions toolbar and context menu.  
  - New endpoint `public/api/file/createFile.php` (handled by `FileController`/`FileModel`):
    - Creates an empty file if it doesn’t already exist.
    - Appends an entry to `<folder>_metadata.json` with `uploaded` timestamp and `uploader`.  
  - `fileActions.js`:
    - Implemented `handleCreateFile()` to show a modal, POST to the new endpoint, and refresh the list.  
    - Added translations for `create_new_file` and `newfile_placeholder`.

---

## Changees 5/15/2025

### Drag‐and‐Drop Upload extended to File List

- **Forward file‐list drops**  
  Dropping files onto the file‐list area (`#fileListContainer`) now re‐dispatches the same `drop` event to the upload card’s drop zone (`#uploadDropArea`)
- **Visual feedback**  
  Added a `.drop-hover` class on `#fileListContainer` during drag‐over for a dashed‐border + light‐background hover state to indicate it accepts file drops.

---

## Changes 5/14/2025 v1.3.4

### 1. Button Grouping (Bootstrap)

- Converted individual action buttons (`download`, `edit`, `rename`, `share`) in both **table view** and **gallery view** into a single Bootstrap button group for a cleaner, more compact UI.
- Applied `btn-group` and `btn-sm` classes for consistent sizing and spacing.

### 2. Header Dropdown Replacement

- Replaced the standalone “User Panel” icon button with a **dropdown wrapper** (`.user-dropdown`) in the header.
- Dropdown toggle now shows:
  - **Profile picture** (if set) or the Material “account_circle” icon
  - **Username** text (between avatar and caret)
  - Down-arrow caret span.

### 3. Menu Items Moved to Dropdown

- Moved previously standalone header buttons into the dropdown menu:
  - **User Panel** opens the modal
  - **Admin Panel** only shown when `data.isAdmin` and on `demo.filerise.net`
  - **API Docs** calls `openApiModal()`
  - **Logout** calls `triggerLogout()`
- Each menu item now has a matching Material icon (e.g. `person`, `admin_panel_settings`, `description`, `logout`).

### 4. Profile Picture Support

- Added a new `/api/profile/uploadPicture.php` endpoint + `UserController::uploadPicture()` + corresponding `UserModel::setProfilePicture()`.
- On **Open User Panel**, display:
  - Default avatar if none set
  - Current profile picture if available
- In the **User Panel** modal:
  - Stylish “edit” overlay icon on the avatar to launch file picker
  - Auto-upload on file selection (no “Save” button click needed)
  - Preview updates immediately and header avatar refreshes live
  - Persisted in `users.txt` and re-fetched via `getCurrentUser.php`

### 5. API Docs & Logout Relocation

- Removed API Docs from User Panel
- Removed “Logout” buttons from the header toolbar.
- Both are now menu entries in the **User Dropdown**.

### 6. Admin Panel Conditional

- The **Admin Panel** button was:
  - Kept in the dropdown only when `data.isAdmin`
  - Removed entirely elsewhere.

### 7. Utility & Styling Tweaks

- Introduced a small `normalizePicUrl()` helper to strip stray colons and ensure a leading slash.
- Hidden the scrollbar in the User Panel modal via:
  - Inline CSS (`scrollbar-width: none; -ms-overflow-style: none;`)  
  - Global/WebKit rule for `::-webkit-scrollbar { display: none; }`
- Made the User Panel modal fully responsive and vertically centered, with smooth dark-mode support.

### 8. File/List View & Gallery View Sliders

- **Unified “View‐Mode” Slider**  
  Added a single slider panel (`#viewSliderContainer`) in the file‐list actions toolbar that switches behavior based on the current view mode:
  - **Table View**: shows a **Row Height** slider (min 31px, max 60px).  
    - Adjusts the CSS variable `--file-row-height` to resize all `<tr>` heights.  
    - Persists the chosen height in `localStorage`.
  - **Gallery View**: shows a **Columns** slider (min 1, max 6).  
    - Updates the grid’s `grid-template-columns: repeat(N, 1fr)`.  
    - Persists the chosen column count in `localStorage`.

- **Injection Point**  
  The slider container is dynamically inserted (or updated) just before the folder summary (`#fileSummary`) in `loadFileList()`, ensuring a consistent position across both view modes.

- **Live Updates**  
  Moving the slider thumb immediately updates the visible table row heights or gallery column layout without a full re‐render.

- **Styling & Alignment**  
  - `#viewSliderContainer` uses `inline-flex` and `align-items: center` so that label, slider, and value text are vertically aligned with the other toolbar elements.
  - Reset margins/padding on the label and value span within `#viewSliderContainer` to eliminate any vertical misalignment.

### 9. Fixed new issues with Undefined username in header on profile pic change & TOTP Enabled not checked

**openUserPanel**  

- **Rewritten entirely with DOM APIs** instead of `innerHTML` for any user-supplied text to eliminates “DOM text reinterpreted as HTML” warnings.
- **Default avatar fallback**: now uses `'/assets/default-avatar.png'` whenever `profile_picture` is empty.
- **TOTP checkbox initial state** is now set from the `totp_enabled` value returned by the server.
- **Modal title sync** on reopen now updates the `(username)` correctly (no more “undefined” until refresh).
- **Re-sync on reopen**: background color, avatar, TOTP checkbox and language selector all update when reopen the panel.

**updateAuthenticatedUI**  

- **Username fix**: dropdown toggle now always uses `data.username` so the name never becomes `undefined` after uploading a picture.
- **Profile URL update** via `fetchProfilePicture()` always writes into `localStorage` before rebuilding the header, ensuring avatar+name stay in sync instantly.
- **Dropdown rebuild logic** tweaked to update the toggle’s innerHTML with both avatar and username on every call.

**UserModel::getUser**  

- Switched to `explode(':', $line, 4)` to the fourth “profile_picture” field without clobbering the TOTP secret.
- **Strip trailing colons** from the stored URL (`rtrim($parts[3], ':')`) so we never send `…png:` back to the client.
- Returns an array with both `'username'` and `'profile_picture'`, matching what `getCurrentUser.php` needs.

### 10. setAttribute + encodeURI to avoid “DOM text reinterpreted as HTML” alerts

### 11. Fix duplicated Upload & Folder cards if they were added to header and page was refreshed

---

## Changes 5/8/2025

### Docker 🐳

- Ensure `/var/www/config` exists and is owned by `www-data` (chmod 750) so that `start.sh`’s `sed -i` updates to `config.php` work reliably

---

## Changes 5/8/2025 v1.3.3

### Enhancements

- **Admin API** (`updateConfig.php`):  
  - Now merges incoming payload onto existing on-disk settings instead of overwriting blanks.  
  - Preserves `clientId`, `clientSecret`, `providerUrl` and `redirectUri` when those fields are omitted or empty in the request.

- **Admin API** (`getConfig.php`):  
  - Returns only a safe subset of admin settings (omits `clientSecret`) to prevent accidental exposure of sensitive data.

- **Frontend** (`auth.js`):  
  - Update UI based on merged loginOptions from the server, ensuring blank or missing fields no longer revert your existing config.

- **Auth API** (`auth.php`):  
  - Added `$oidc->addScope(['openid','profile','email']);` to OIDC flow. (This should resolve authentik issue)

---

## Changes 5/8/2025 v1.3.2

### config/config.php

- Added a default `define('AUTH_BYPASS', false)` at the top so the constant always exists.
- Removed the static `AUTH_HEADER` fallback; instead read the adminConfig.json at the end of the file and:
  - Overwrote `AUTH_BYPASS` with the `loginOptions.authBypass` setting from disk.
  - Defined `AUTH_HEADER` (normalized, e.g. `"X_REMOTE_USER"`) based on `loginOptions.authHeaderName`.
- Inserted a **proxy-only auto-login** block before the usual session/auth checks:  
  If `AUTH_BYPASS` is true and the trusted header (`$_SERVER['HTTP_' . AUTH_HEADER]`) is present, bump the session, mark the user authenticated/admin, load their permissions, and skip straight to JSON output.
- Relax filename validation regex to allow broader Unicode and special chars

### src/controllers/AdminController.php

- Ensured the returned `loginOptions` object always contains:
  - `authBypass` (boolean, default false)
  - `authHeaderName` (string, default `"X-Remote-User"`)
- Read `authBypass` and `authHeaderName` from the nested `loginOptions` in the request payload.
- Validated them (`authBypass` → bool; `authHeaderName` → non-empty string, fallback to `"X-Remote-User"`).
- Included them when building the `$configUpdate` array to pass to the model.

### src/models/AdminModel.php

- Normalized `loginOptions.authBypass` to a boolean (default false).
- Validated/truncated `loginOptions.authHeaderName` to a non-empty trimmed string (default `"X-Remote-User"`).
- JSON-encoded and encrypted the full config, now including the two new fields.
- After decrypting & decoding, normalized the loaded `loginOptions` to always include:
  - `authBypass` (bool)
  - `authHeaderName` (string, default `"X-Remote-User"`)
- Left all existing defaults & validations for the original flags intact.

### public/js/adminPanel.js

- **Login Options** section:
  - Added a checkbox for **Disable All Built-in Logins (proxy only)** (`authBypass`).
  - Added a text input for **Auth Header Name** (`authHeaderName`).
- In `handleSave()`:
  - Included the new `authBypass` and `authHeaderName` values in the payload sent to `updateConfig.php`.
- In `openAdminPanel()`:
  - Initialized those inputs from `config.loginOptions.authBypass` and `config.loginOptions.authHeaderName`.

### public/js/auth.js

- In `loadAdminConfigFunc()`:
  - Stored `authBypass` and `authHeaderName` in `localStorage`.
- In `checkAuthentication()`:
  - After a successful login check, called a new helper (`applyProxyBypassUI()`) which reads `localStorage.authBypass` and conditionally hides the entire login form/UI.
  - In the “not authenticated” branch, only shows the login form if `authBypass` is false.
- No other core fetch/token logic changed; all existing flows remain intact.

### Security old

- **Admin API**: `getConfig.php` now returns only a safe subset of admin settings (omits `clientSecret`) to prevent accidental exposure of sensitive data.

---

## Changes 5/4/2025 v1.3.1

### Modals

- **Added** a shared `.editor-close-btn` component for all modals:
  - File Tags
  - User Panel
  - TOTP Login & Setup
  - Change Password
- **Truncated** long filenames in the File Tags modal header using CSS `text-overflow: ellipsis`.
- **Resized** File Tags modal from 400px to 450px wide (with `max-width: 90vw` fallback).
- **Capped** User Panel height at 381px and hidden scrollbars to eliminate layout jumps on hover.

### HTML

- **Moved** `<div id="loginForm">…</div>` out of `.main-wrapper` so the login form can show independently of the app shell.
- **Added** `<div id="loadingOverlay"></div>` immediately inside `<body>` to cover the UI during auth checks.
- **Inserted** inline `<style>` in `<head>` to:
  - Hide `.main-wrapper` by default.
  - Style `#loadingOverlay` as a full-viewport white overlay.

- **Added** `addUserModal`, `removeUserModal` & `renameFileModal` modals to `style="display:none;"`

**`main.js`**

- **Extracted** `initializeApp()` helper to centralize post-auth startup (tag search, file list, drag-and-drop, folder tree, upload, trash/restore, admin config).
- **Updated** DOMContentLoaded `checkAuthentication()` flow to call `initializeApp()` when already authenticated.
- **Extended** `updateAuthenticatedUI()` to call `initializeApp()` after a fresh login so all UI modules re-hydrate.
- **Enhanced** setup-mode in `checkAuthentication()`:
  - Show `#addUserModal` as a flex overlay (`style.display = 'flex'`).
  - Keep `.main-wrapper` hidden until setup completes.
- **Added** post-setup handler in the Add-User modal’s save button:
  - Hide setup modal.
  - Show login form.
  - Keep app shell hidden.
  - Pre-fill and focus the new username in the login inputs.

### `auth.js` / Auth Logic

- **Refactored** `checkAuthentication()` to handle three states:
  1. **`data.setup`** remove overlay, hide main UI, show setup modal.  
  2. **`data.authenticated`** remove overlay, call `updateAuthenticatedUI()`.  
  3. **not authenticated** remove overlay, show login form, keep main UI hidden.
- **Refined** `updateAuthenticatedUI()` to:
  - Remove loading overlay.
  - Show `.main-wrapper` and main operations.
  - Hide `#loginForm`.
  - Reveal header buttons.
  - Initialize dynamic header buttons (restore, admin, user-panel).
  - Call `initializeApp()` to load all modules after login.

---

## Changes 5/3/2025 v1.3.0

**Admin Panel Refactor & Enhancements**  

### Moved from `authModals.js` to `adminPanel.js`

- Extracted all admin-related UI and logic out of `authModals.js`
- Created a standalone `adminPanel.js` module  
- Initialized `openAdminPanel()` and `closeAdminPanel()` exports

### Responsive, Collapsible Sections

- Injected new CSS via JS (`adminPanelStyles`)  
  - Default modal width: 50%  
  - Small-screen override (`@media (max-width: 600px)`) to 90% width  
- Introduced `.section-header` / `.section-content` pattern  
  - Click header to expand/collapse its content  
  - Animated arrow via Material Icons  
  - Indented and padded expanded content  

### “Manage Shared Links” Feature

- Added new **Manage Shared Links** section to Admin Panel  
- Endpoint **GET** `/api/admin/readMetadata.php?file=…`  
  - Reads `share_folder_links.json` & `share_links.json` under `META_DIR`  
- Endpoint **POST**  
  - `/api/folder/deleteShareFolderLink.php`  
  - `/api/file/deleteShareLink.php`  
- `loadShareLinksSection()` AJAX loader  
  - Displays folder & file shares, expiry dates, upload-allowed, and 🔒 if password-protected  
  - “🗑️” delete buttons refresh the list on success  

### Dark-Mode & Theming Fixes

- Dark-mode CSS overrides for:
  - Modal border  
  - `.btn-primary`, `.btn-secondary`  
  - `.form-control` backgrounds & placeholders  
  - Section headers & icons  
- Close button restyled to use shared **.editor-close-btn** look

### API and Controller changes

- Updated all endpoints to use correct controller casing  
- Renamed controller files to PascalCase (e.g. `adminController.php` to `AdminController.php`, `fileController.php` to `FileController.php`, `folderController.php` to `FolderController.php`)  
- Adjusted endpoint paths to match controller filenames
- Fix FolderController readOnly create folder permission

### Additional changes

- Extend clean up expired shared entries

---

## Changes 4/30/2025 v1.2.8

- **Added** PDF preview in `filePreview.js` (the `extension === "pdf"` block): replaced in-modal `<embed>` with `window.open(urlWithTs, "_blank")` and closed the modal to avoid CSP `frame-ancestors 'none'` restrictions.
- **Added** `autofocus` attribute to the login form’s username input (`#loginUsername`) so the cursor is ready for typing on page load.
- **Enhanced** login initialization with a `DOMContentLoaded` fallback that calls `loginUsername.focus()` (via `setTimeout`) if needed.
- **Set** focus to the “New Username” field (`#newUsername`) when entering setup mode, hiding the login form and showing the Add-User modal.
- **Implemented** Enter-key support in setup mode by attaching `attachEnterKeyListener("addUserModal", "saveUserBtn")`, allowing users to press Enter to submit the Add-User form.

---

## Changes 4/28/2025

**Added**  

- **Custom expiration** option to File Share modal  
  - Users can specify a value + unit (seconds, minutes, hours, days)  
  - Displays a warning when a custom duration is selected  
- **Custom expiration** option to Folder Share modal (same value+unit picker and warning)

**Changed**  

- **API parameters** for both endpoints:  
  - Replaced `expirationMinutes` with `expirationValue` + `expirationUnit`  
  - Front-end now sends `{ expirationValue, expirationUnit }`  
  - Back-end converts those into total seconds before saving
- **UI**  
  - FileShare and FolderShare modals updated to handle “Custom…” selection  

**Updated Models & Controllers**  

- **FileModel::createShareLink** now accepts expiration in seconds  
- **FolderModel::createShareFolderLink** now accepts expiration in seconds  
- **createShareLink.php** & **createShareFolderLink.php** updated to parse and convert new parameters

**Documentation**  

- OpenAPI annotations for both endpoints updated to require `expirationValue` + `expirationUnit` (enum: seconds, minutes, hours, days)  

## Changes 4/27/2025 v1.2.7

- **Select-All** checkbox now correctly toggles all `.file-checkbox` inputs  
  - Updated `toggleAllCheckboxes(masterCheckbox)` to call `updateRowHighlight()` on each row so selections get the `.row-selected` highlight
- **Master checkbox sync** in toolbar  
  - Enhanced `updateFileActionButtons()` to set the header checkbox to checked, unchecked, or indeterminate based on how many files are selected
- Fixed Pagination controls & Items-per-page dropdown
- Fixed `#advancedSearchToggle` in both `renderFileTable()` and `renderGalleryView()`
- **Shared folder gallery view logic**  
  - Introduced new `public/js/sharedFolderView.js` containing all DOMContentLoaded wiring, `toggleViewMode()`, gallery rendering, and event listeners  
  - Embedded a non-executing JSON payload in `shareFolder.php`
- **`FolderController::shareFolder()` / `shareFolder.php`**  
  - Removed all inline `onclick="…"` attributes and inline `<script>` blocks  
  - Added `<script type="application/json" id="shared-data">…</script>` to export `$token` and `$files`  
  - Added `<script src="/js/sharedFolderView.js" defer></script>` to load the external view logic
- **Styling updates**  
  - Added `.toggle-btn` CSS for blue header-style toggle button and applied it in JS  
  - Added `.pagination a:hover { background-color: #0056b3; }` to match button hover  
  - Tweaked `body` padding and `header h1` margins to reduce whitespace above header  
  - Refactored `sharedFolderView.js:renderGalleryView()` to eliminate `innerHTML` usage; now uses `document.createElement` and `textContent` so filenames and URLs are fully escaped and CSP-safe

---

## Changes 4/26/2025 1.2.6

**Apache / Dockerfile (CSP)**  

- Enabled Apache’s `mod_headers` in the Dockerfile (`a2enmod headers ssl deflate expires proxy proxy_fcgi rewrite`)  
- Added a strong `Content-Security-Policy` header in the vhost configs to lock down allowed sources for scripts, styles, fonts, images, and connections  

**index.html & CDN Includes**  

- Applied Subresource Integrity (`integrity` + `crossorigin="anonymous"`) to all static CDN assets (Bootstrap CSS, CodeMirror CSS/JS, Resumable.js, DOMPurify, Fuse.js)  
- Omitted SRI on Google Fonts & Material Icons links (dynamic per-browser CSS)  
- Removed all inline `<script>` and `onclick` attributes; now all behaviors live in external JS modules  

**auth.js (Logout Handling)**  

- Moved the logout-on-`?logout=1` snippet from inline HTML into `auth.js`  
- In `DOMContentLoaded`, attached a `click` listener to `#logoutBtn` that POSTs to `/api/auth/logout.php` and reloads  

**fileActions.js (Modal Button Handlers)**  

- Externalized the cancel/download buttons for single-file and ZIP-download modals by adding `click` listeners in `fileActions.js`  
- Removed the inline `onclick` attributes from `#cancelDownloadFile` and `#confirmSingleDownloadButton` in the HTML  
- Ensured all file-action modals (delete, download, extract, copy, move, rename) now use JS event handlers instead of inline code  

**domUtils.js**  

- **Removed** all inline `onclick` and `onchange` attributes from:
  - `buildSearchAndPaginationControls` (advanced search toggle, prev/next buttons, items-per-page selector)
  - `buildFileTableHeader` (select-all checkbox)
  - `buildFileTableRow` (download, edit, preview, rename buttons)
- **Retained** all original logic (file-type icon detection, shift-select, debounce, custom confirm modal, etc.)

**fileListView.js**  

- **Stopped** generating inline `onclick` handlers in both table and gallery views.
- **Added** `data-` attributes on actionable elements:
  - `data-download-name`, `data-download-folder`
  - `data-edit-name`, `data-edit-folder`
  - `data-rename-name`, `data-rename-folder`
  - `data-preview-url`, `data-preview-name`
  - IDs on controls: `#advancedSearchToggle`, `#searchInput`, `#prevPageBtn`, `#nextPageBtn`, `#selectAll`, `#itemsPerPageSelect`
- **Introduced** `attachListControlListeners()` to bind all events via `addEventListener` immediately after rendering, preserving every interaction without inline code.

**Additional changes**  

- **Security**: Added `frame-src 'self'` to the Content-Security-Policy header so that the embedded API docs iframe can load from our own origin without relaxing JS restrictions.  
- **Controller**: Updated `FolderController::shareFolder()` (folderController) to include the gallery-view toggle script block intact, ensuring the “Switch to Gallery View” button works when sharing folders.  
- **UI (fileListView.js)**: Refactored `renderGalleryView` to remove all inline `onclick=` handlers; switched to using data-attributes and `addEventListener()` for preview, download, edit and rename buttons, fully CSP-compliant.
- Moved logout button handler out of inline `<script>` in `index.html` and into the `DOMContentLoaded` init in **main.js** (via `auth.js`), so it now attaches reliably after the CSRF token is loaded and DOM is ready.
- Added Content-Security-Policy for `<Files "api.php">` block to allow embedding the ReDoc iframe.
- Extracted inline ReDoc init into `public/js/redoc-init.js` and updated `public/api.php` to use deferred `<script>` tags.

---

## Changes 4/25/2025

- Switch single‐file download to native `<a>` link (no JS buffering)
- Keep spinner modal during ZIP creation and download blob on POST response
- Replace text toggle with a single button showing sun/moon icons and hover tooltip

## Changes 4/24/2025 1.2.5

- Enhance README and wiki with expanded installation instructions
- Adjusted Dockerfile’s Apache vhost to:
  - Alias `/uploads/` to `/var/www/uploads/` with PHP engine disabled and directory indexes off  
  - Disable HTTP TRACE and tune keep-alive (On, max 100 requests, 5s timeout) and server Timeout (60s)  
  - Add security headers (`X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`)  
  - Enable `mod_deflate` compression for HTML, plain text, CSS, JS and JSON  
  - Configure `mod_expires` caching for images (1 month), CSS (1 week) and JS (3 hour)  
  - Deny access to hidden files (dot-files)
~~- Add access control in public/.htaccess for api.html & openapi.json; update Nginx example in wiki~~
- Remove obsolete folders from repo root
- Embed API documentation (`api.php`) directly in the FileRise UI as a full-screen modal  
  - Introduced `openApiModalBtn` in the user panel to launch the API modal  
  - Added `#apiModal` container with a same-origin `<iframe src="api.php">` so session cookies authenticate automatically  
  - Close control uses the existing `.editor-close-btn` for consistent styling and hover effects

- public/api.html has been replaced by the new api.php wrapper
- **`public/api.php`**  
  - Single PHP endpoint for both UI and spec  
  - Enforces `$_SESSION['authenticated']`  
  - Renders the Redoc API docs when accessed normally  
  - Streams the JSON spec from `openapi.json.dist` when called as `api.php?spec=1`  
  - Redirects unauthenticated users to `index.html?redirect=/api.php`
- **Moved** `public/openapi.json` → `openapi.json.dist` (moved outside of `public/`) to prevent direct static access  
- **Dockerfile**: enabled required Apache modules for rewrite, security headers, proxying, caching and compression:

  ```dockerfile
  RUN a2enmod rewrite headers proxy proxy_fcgi expires deflate
  ```

## Changes 4/23/2025 1.2.4

**AuthModel**  

- **Added** `validateRememberToken(string $token): ?array`  
  - Reads and decrypts `persistent_tokens.json`  
  - Verifies token exists and hasn’t expired  
  - Returns stored payload (`username`, `expiry`, `isAdmin`, etc.) or `null` if invalid

**authController (checkAuth)**  

- **Enhanced** “remember-me” re-login path at top of `checkAuth()`  
  - Calls `AuthModel::validateRememberToken()` when session is missing but `remember_me_token` cookie present  
  - Repopulates `$_SESSION['authenticated']`, `username`, `isAdmin`, `folderOnly`, `readOnly`, `disableUpload` from payload  
  - Regenerates session ID and CSRF token, then immediately returns JSON and exits
  
- **Updated** `userController.php`
  - Fixed totp isAdmin when session is missing but `remember_me_token` cookie present

- **loadCsrfToken()**  
  - Now reads `X-CSRF-Token` response header first, falls back to JSON `csrf_token` if header absent  
  - Updates `window.csrfToken`, `window.SHARE_URL`, and `<meta>` tags with the new values  
- **fetchWithCsrf(url, options)**  
  - Sends `credentials: 'include'` and current `X-CSRF-Token` on every request  
  - Handles “soft-failure” JSON (`{ csrf_expired: true, csrf_token }`): updates token and retries once without a 403 in DevTools  
  - On HTTP 403 fallback: reads new token from header or `/api/auth/token.php`, updates token, and retries once  

- **start.sh**
- Session directory setup

- Always sends `credentials: 'include'` and `X-CSRF-Token: window.csrfToken` s
- On HTTP 403, automatically fetches a fresh CSRF token (from the response header or `/api/auth/token.php`) and retries the request once  
- Always returns the real `Response` object (no more “clone.json” on every 200)
- Now calls `fetchWithCsrf('/api/auth/token.php')` to guarantee a fresh token  
- Checks `res.ok`, then parses JSON to extract `csrf_token` and `share_url`  
- Updates both `window.csrfToken` and the `<meta name="csrf-token">` & `<meta name="share-url">` tags  
- Removed Old CSRF logic that cloned every successful response and parsed its JSON body  
- Removed Any “soft-failure” JSON peek on non-403 responses
- Add missing permissions in `UserModel.php` for TOTP login.
- **Prevent XSS in breadcrumbs**  
  - Replaced `innerHTML` calls in `fileListTitle` with a new `updateBreadcrumbTitle()` helper that uses `textContent` + `DocumentFragment`.  
  - Introduced `renderBreadcrumbFragment()` to build each breadcrumb segment as a `<span class="breadcrumb-link" data-folder="…">` node.  
  - Added `setupBreadcrumbDelegation()` to handle clicks via event delegation on the container, eliminating per-element listeners.  
  - Removed any raw HTML concatenation to satisfy CodeQL and ensure all breadcrumb text is safely escaped.

## Changes 4/22/2025 v1.2.3

- Support for custom PUID/PGID via `PUID`/`PGID` environment variables, replacing the need to run the container with `--user`  
- New `PUID` and `PGID` config options in the Unraid Community Apps template
- Dockerfile:  
  - startup (`start.sh`) now runs as root to write `/etc/php` & `/etc/apache2` configs  
  - `www‑data` user is remapped at build‑time to the supplied `PUID:PGID`, then Apache drops privileges to that user  
- Unraid template: removed recommendation to use `--user`; replaced with `PUID`, `PGID`, and `Container Port` variables
- “Permission denied” errors when forcing `--user 99:100` on Unraid by ensuring startup runs as root
- Dockerfile silence group issue
- `enableWebDAV` toggle in Admin Panel (default: disabled)
- **Admin Panel enhancements**  
  - New `enableWebDAV` boolean setting  
  - New `sharedMaxUploadSize` numeric setting (bytes)  
- **Shared Folder upload size**  
  - `sharedMaxUploadSize` is now enforced in `FolderModel::uploadToSharedFolder`  
  - Upload form header on shared‑folder page dynamically shows “(X MB max size)”  
- **API updates**  
  - `getConfig` and `updateConfig` endpoints now include `enableWebDAV` and `sharedMaxUploadSize`  
- Updated `AdminModel` & `AdminController` to persist and validate new settings  
- Enhanced `shareFolder()` view to pull from admin config and format the max‑upload‑size label
- Restored the MIT license copyright line that was inadvertently removed.
- Move .htaccess to public folder this was mistake since API refactor.
- gitattributes to ignore resources/ & .github/ on export
- Hardened `Dockerfile` permissions: all code files owned by `root:www-data` (dirs `755`, files `644`), only `uploads/`, `users/` and `metadata/` are writable by `www-data` (`775`)
- `.dockerignore` entry to exclude the `.github` directory from build context  
- `start.sh`:
  - Creates and secures `metadata/log` for Apache logs  
  - Dynamically creates and sets permissions on `uploads`, `users`, and `metadata` directories at startup  
- Apache VirtualHost updated to redirect `ErrorLog` and `CustomLog` into `/var/www/metadata/log`
- docker: remove symlink add alias for uploads folder

---

## Changes 4/21/2025 v1.2.2

### Added

- **`src/webdav/CurrentUser.php`**  
  – Introduces a `CurrentUser` singleton to capture and expose the authenticated WebDAV username for use in other components.

### Changed

- **`src/webdav/FileRiseDirectory.php`**  
  – Constructor now takes three parameters (`$path`, `$user`, `$folderOnly`).  
  – Implements “folder‑only” mode: non‑admin users only see their own subfolder under the uploads root.  
  – Passes the current user through to `FileRiseFile` so that uploads/deletions are attributed correctly.

- **`src/webdav/FileRiseFile.php`**  
  – Uses `CurrentUser::get()` when writing metadata to populate the `uploader` field.  
  – Metadata helper (`updateMetadata`) now records both upload and modified timestamps along with the actual username.  

- **`public/webdav.php`**  
  – Adds a header‐shim at the top to pull Basic‑Auth credentials out of `Authorization` for all HTTP methods.  
  – In the auth callback, sets the `CurrentUser` for the rest of the request.  
  - Admins & unrestricted users see the full `/uploads` directory.  
  - “Folder‑only” users are scoped to `/uploads/{username}`.  
  – Configures SabreDAV with the new `FileRiseDirectory($rootPath, $user, $folderOnly)` signature and sets the base URI to `/webdav.php/`.  

## Changes 4/19/2025 v1.2.1

- **Extended “Remember Me” cookie behavior**  
  In `AuthController::finalizeLogin()`, after setting `remember_me_token` re‑issued the PHP session cookie with the same 30‑day expiry and called `session_regenerate_id(true)`.

- **Fetch URL fixes**  
  Changed all front‑end `fetch("api/…")` calls to absolute paths `fetch("/api/…")` to avoid relative‑path 404/403 issues.

- **CSRF token refresh**  
  Updated `submitLogin()` and both TOTP submission handlers to `async/await` a fresh CSRF token from `/api/auth/token.php` (with `credentials: "include"`) immediately before any POST.

- **submitLogin() overhaul**  
  Refactored to:
  1. Fetch CSRF  
  2. POST credentials to `/api/auth/auth.php`  
  3. On `totp_required`, re‑fetch CSRF again before calling `openTOTPLoginModal()`  
  4. Handle full logins vs. TOTP flows cleanly.

- **TOTP handlers update**  
  In both the “Confirm TOTP” button flow and the auto‑submit on 6‑digit input:
  - Refreshed CSRF token before every `/api/totp_verify.php` call  
  - Checked `response.ok` before parsing JSON  
  - Improved `.catch` error handling

- **verifyTOTP() endpoint enhancement**  
  Inside the **pending‑login** branch of `verifyTOTP()`:
  - Pulled `$_SESSION['pending_login_remember_me']`  
  - If true, wrote the persistent token store, set `remember_me_token`, re‑issued the session cookie, and regenerated the session ID  
  - Cleaned up pending session variables

  ---

## Changes 4/18/2025

### fileListView.js

- Seed and persist `itemsPerPage` from `localStorage`
- Use `window.itemsPerPage` for pagination in gallery
- Enable search input filtering in gallery mode
- Always re‑render the view‑toggle button on gallery load
- Restore per‑card action buttons (download, edit, rename, share)
- Assign real `value` to checkboxes and call `updateFileActionButtons()` on change
- Update `changePage` and `changeItemsPerPage` to respect `viewMode`

### fileTags.js

- Import `renderFileTable` and `renderGalleryView`
- Re‑render the list after saving a single‑file tag
- Re‑render the list after saving multi‑file tags

---

## Changes 4/17/2025

- Generate OpenAPI spec and API HTML docs
  - Fully auto‑generated OpenAPI spec (`openapi.json`) and interactive HTML docs (`api.html`) powered by Redoc.
- .gitattributes added to mark (`openapi.json`) & (`api.html`) as documentation.
- User Panel added API Docs link.
- Adjusted remember_me_token.
- Test pipeline

---

## Changes 4/16 Refactor API endpoints and modularize controllers and models

- Reorganized project structure to separate API logic into dedicated controllers and models:
  - Created adminController, userController, fileController, folderController, uploadController, and authController.
  - Created corresponding models (AdminModel, UserModel, FileModel, FolderModel, UploadModel, AuthModel) for business logic.

- Consolidated API endpoints under the /public/api folder with subfolders for admin, auth, file, folder, and upload endpoints.

- Added inline OpenAPI annotations to document key endpoints (e.g., getConfig.php, updateConfig.php) for improved API documentation.

- Updated configuration retrieval and update logic in AdminModel and AdminController to handle OIDC and login option booleans consistently, fixing issues with basic auth settings not updating on the login page.

- Updated the client-side auth.js to correctly reference API endpoints (adjusted query selectors to reflect new document root) and load admin configuration from the updated API endpoints.

- Minor improvements to CSRF token handling, error logging, and overall code readability.

This refactor improves maintainability, testability, and documentation clarity across all API endpoints.

### Refactor fixes and adjustments

- Added fallback checks for disableFormLogin / disableBasicAuth / disableOIDCLogin when coming in either at the top level or under loginOptions.
- Updated auth.js to read and store the nested loginOptions booleans correctly in localStorage, then show/hide the Basic‑Auth and OIDC buttons as configured.
- Changed the logout controller to header("Location: /index.html?logout=1") so after /api/auth/logout.php it lands on the root index.html, not under /api/auth/.
- Switched your share modal code to use a leading slash ("/api/file/share.php") so it generates absolute URLs instead of relative /share.php.
- In the shared‑folder gallery, adjusted the client‑side image path to point at /uploads/... instead of /api/folder/uploads/...
- Updated both AdminModel defaults and the AuthController to use the exact full path
- Network Utilities Overhaul swapped out the old fetch wrapper for one that always reads the raw response, tries to JSON.parse it, and then either returns the parsed object on ok or throws it on error.
- Adjusted your submitLogin .catch() to grab the thrown object (or string) and pass that through to showToast, so now “Invalid credentials” actually shows up.
- Pulled the common session‑setup and “remember me” logic into two new helpers, finalizeLogin() (for AJAX/form/basic/TOTP) and finishBrowserLogin() (for OIDC redirects). That removed tons of duplication and ensures every path calls the same permission‑loading code.
- Ensured that after you POST just a totp_code, we pick up pending_login_user/pending_login_secret, verify it, then immediately call finalizeLogin().
- Expanded checkAuth.php Response now returns all three flags—folderOnly, readOnly, and disableUpload so client can handle every permission.
- In auth.js’s updateAuthenticatedUI(), write all three flags into localStorage whenever you land on the app (OIDC, basic or form). That guarantees consistent behavior across page loads.
- Made sure the OIDC handler reads the live config via AdminModel::getConfig() and pushes you through the TOTP flow if needed, then back to /index.html.
- Dockerfile, custom-php.ini & start.sh moved into main repo for easier onboarding.
- filerise-docker changed to dedicated CI/CD pipeline

---

## Changes 4/15/2025

- Adjust Gallery View max columns based on screen size
- Adjust headerTitle to update globally

## Changes 4/14/2025

- Fix Gallery View: medium screen devices get 3 max columns and small screen devices 2 max columns.
- Ensure gallery view toggle button displays after refresh page.
- Force resumable chunk size & fix chunk cleanup

### filePreview.js Enhancements

**Modal Layout Overhaul:**

- **Left Panel:** Holds zoom in/out controls at the top and the "prev" button at the bottom.
- **Center Panel:** Always centers the preview image.
- **Right Panel:** Contains rotate left/right controls at the top and the "next" button at the bottom.

**Consistent Control Presence:**

- Both left and right panels are always included. When there’s only one image, placeholders are inserted in place of missing navigation buttons to ensure the image remains centered and that rotate controls are always visible.

**Improved Transform Behavior:**

- Transformation values (scale and rotation) are reset on each navigation event, ensuring predictable behavior and consistent presentation.

---

## Changes 4/13/2025 v1.1.3

- Decreased header height some more and clickable logo.
- authModals.js fully updated with i18n.js keys.
- main.js added Dark & Light mode i18n.js keys.
- New Admin section Header Settings to change Header Title.
- Admin Panel confirm unsaved changes.
- Added translations and data attributes for almost all user-facing text
- Extend i18n support: Add new translation keys for Download and Share modals

- **Slider Integration:**
  - Added a slider UI (range input, label, and value display) directly above the gallery grid.
  - The slider allows users to adjust the number of columns in the gallery from 1 to 6.
- **Dynamic Grid Updates:**
  - The gallery grid’s CSS is updated in real time via the slider’s value by setting the grid-template-columns property.
  - As the slider value changes, the layout instantly reflects the new column count.
- **Dynamic Image Resizing:**
  - Introduced a helper function (getMaxImageHeight) that calculates the maximum image height based on the current column count.
  - The max height of each image is updated immediately when the slider is adjusted to create a more dynamic display.
- **Image Caching:**
  - Implemented an image caching mechanism using a global window.imageCache object.
  - Images are cached on load (via an onload event) to prevent unnecessary reloading, improving performance.
- **Event Handling:**
  - The slider’s event listener is set up to update both the gallery grid layout and the dimensions of the thumbnails dynamically.
  - Share button event listeners remain attached for proper functionality across the updated gallery view.

- **Input Validation & Security:**
  - Used `filter_input()` to sanitize and validate incoming GET parameters (token, pass, page).
  - Validated file system paths using `realpath()` and ensured the shared folder lies within `UPLOAD_DIR`.
  - Escaped all dynamic outputs with `htmlspecialchars()` to prevent XSS.
- **Share Link Verification:**
  - Loaded and validated share records from the JSON file.
  - Handled expiration and password protection (with proper HTTP status codes for errors).
- **Pagination:**
  - Implemented pagination by slicing the full file list into a limited number of files per page (default of 10).
  - Calculated total pages and current page to create navigation links.
- **View Toggle (List vs. Gallery):**
  - Added a toggle button that switches between a traditional list view and a gallery view.
  - Maintained two separate view containers (`#listViewContainer` and `#galleryViewContainer`) to support this switching.
- **Gallery View with Image Caching:**
  - For the gallery view, implemented a JavaScript function that creates a grid of image thumbnails.
  - Each image uses a cache-busting query string on first load and caches its URL in a global `window.imageCache` for subsequent renders.
- **Persistent Pagination Controls:**
  - Moved the pagination controls outside the individual view containers so that they remain visible regardless of the selected view.

---

## Changes 4/12/2025

- Moved Gallery view toggle button into header.
- Removed css entries that are not needed anymore for Gallery View Toggle.
- Change search box text when enabling advanced search.
- Advanced/Basic search button as material icon on same row as search bar.

### Advanced Search Implementation

- **Advanced Search Toggle:**
  - Added a global toggle (`window.advancedSearchEnabled`) and a UI button to switch between basic and advanced search modes.
  - The toggle button label changes between "Advanced Search" and "Basic Search" to reflect the active mode.

- **Fuse.js Integration Updates:**
  - Modified the `searchFiles()` function to conditionally include the `"content"` key in the Fuse.js keys only when advanced search mode is enabled.
  - Adjusted Fuse.js options by adding `ignoreLocation: true`, adjusting the `threshold`, and optionally assigning weights (e.g., a lower weight for `name` and a higher weight for `content`) to prioritize matches in file content.

- **Backend (PHP) Enhancements:**
  - Updated **getFileList.php** to read the content of text-based files (e.g., `.txt`, `.html`, `.md`, etc.) using `file_get_contents()`.
  - Added a `"content"` property to the JSON response for eligible files to allow for full-text search in advanced mode.

### Fuse.js Integration for Indexed Real-Time Searching**

- **Added Fuse.js Library:** Included Fuse.js via a CDN `<script>` tag to leverage its client‑side fuzzy search capabilities.
- **Created searchFiles Helper Function:** Introduced a new function that uses Fuse.js to build an index and perform fuzzy searches over file properties (file name, uploader, and nested tag names).
- **Transformed JSON Object to Array:** Updated the loadFileList() function to convert the returned file data into an array (if it isn’t already) and assign file names from JSON keys.
- **Updated Rendering Functions:** Modified both renderFileTable() and renderGalleryView() to use the searchFiles() helper instead of a simple in‑array .filter(). This ensures that every search—real‑time by user input—is powered by Fuse.js’s indexed search.
- **Enhanced Search Configuration:** Configured Fuse.js to search across multiple keys (file name, uploader, and tags) so that users can find files based on any of these properties.

---

## Changes 4/11/2025

- Fixed fileDragDrop issue from previous update.
- Fixed User Panel height changing unexpectedly on mouse over.
- Improved JS file comments for better documentation.
- Fixed userPermissions not updating after initial setting.
- Disabled folder and file sharing for readOnly users.
- Moved change password close button to the top right of the modal.
- Updated upload regex pattern to be Unicode‑enabled and added additional security measures. [(#19)](https://github.com/error311/FileRise/issues/19)
- Updated filename, folder, and username regex acceptance patterns.
- Updated robthree/twofactorauth to v3 and endroid/qr-code to v5
- Updated TOTP integration (namespace, enum, QR provider) accordingly
- Updated docker image from 22.04 to 24.04 <https://github.com/error311/filerise-docker>
- Ensure consistent session behavior
- Fix totp_setup.php to use header-based CSRF token verification

---

## Shift Key Multi‑Selection Changes 4/10/2025 v1.1.1

- **Implemented Range Selection:**
  - Modified the `toggleRowSelection` function so that when the Shift key is held down, all rows between the last clicked (anchor) row (stored as `window.lastSelectedFileRow`) and the currently clicked row are selected.
- **Modifier Handling:**
  - Regular clicks (or Ctrl/Cmd clicks) simply toggle the clicked row without clearing other selections.
- **Prevented Default Browser Behavior:**
  - Added `event.preventDefault()` in the Shift‑click branch to avoid unwanted text selection.
- **Maintaining the Anchor:**
  - The last clicked row is stored for future range selections.

## Total Files and File Size Summary

- **Size Calculation:**
  - Created `parseSizeToBytes(sizeStr)` to convert file size strings (e.g. `"456.9KB"`, `"1.2 MB"`) into a numerical byte value.
  - Created `formatSize(totalBytes)` to format a byte value into a human‑readable string (choosing between Bytes, KB, MB, or GB).
  - Created `buildFolderSummary(filteredFiles)` to:
    - Sum the sizes of all files (using `parseSizeToBytes`).
    - Count the total number of files.
- **Dynamic Display in `loadFileList`:**
  - Updated `loadFileList` to update a summary element (with `id="fileSummary"`) inside the `#fileListActions` container when files are present.
  - When no files are found, the summary element is hidden (setting its `display` to `"none"` or clearing the container).
- **Responsive Styling:**
  - Added CSS media queries to the `#fileSummary` element so that on small screens it is centered and any extra side margins are removed. Dark and light mode supported.

- **Other changes**

  - `shareFolder.php` updated to display format size.
  - Fix to prevent the filename text from overflowing its container in the gallery view.
  - Reduced header height.
  - Create Folder changed to Material Icon `create_new_folder`

---

## Folder Sharing Feature - Changelog 4/9/2025 v1.1.0

### New Endpoints

- **createFolderShareLink.php:**  
  - Generates secure, expiring share tokens for folders (with an optional password and allow-upload flag).  
  - Stores folder share records separately from file shares in `share_folder_links.json`.  
  - Builds share links that point to **shareFolder.php**, using a proper BASE_URL or the server’s IP when a default placeholder is detected.

- **shareFolder.php:**  
  - Serves shared folders via GET requests by reading tokens from `share_folder_links.json`.
  - Validates token expiration and password (if set).
  - Displays folder contents with pagination (10 items per page) and shows file sizes in megabytes.
  - Provides navigation links (Prev, Next, and numbered pages) for folder listings.
  - Includes an upload form (if allowed) that redirects back to the same share page after upload.
  
- **downloadSharedFile.php:**  
  - A dedicated, secure download endpoint for shared files.
  - Validates the share token and ensures the requested file is inside the shared folder.
  - Serves files using proper MIME types and Content-Disposition headers (inline for images, attachment for others).

- **uploadToSharedFolder.php:**  
  - Handles file uploads for public folder shares.
  - Enforces file size limits and file type whitelists.
  - Generates unique filenames (with a unique prefix) to prevent collisions.
  - Updates metadata for the uploaded file (upload date and sets uploader as "Outside Share").
  - Redirects back to **shareFolder.php** after a successful upload so the file listing refreshes.

### New Front-End Module

- **folderShareModal.js:**  
  - Provides a modal interface for users to generate folder share links.
  - Includes expiration selection, optional password entry, and an allow-upload checkbox.
  - Uses the **createFolderShareLink.php** endpoint to generate share links.
  - Displays the generated share link with a “copy to clipboard” button.

---

## Changes 4/8/2025

**May have missed some stuff or could have bugs. Please report any issue you may encounter.**

- **i18n Integration:**
  - Implemented a semi-complete internationalization (i18n) system for all user-facing texts in FileRise.
  - Created an `i18n.js` module containing a translations object with full keys for English (en), Spanish (es), and French (fr).
  - Updated JavaScript code to replace hard-coded strings with the `t()` translation function.
  - Enhanced HTML and modal templates to support dynamic language translations using data attributes (data-i18n-key, data-i18n-placeholder, etc.).

- **Language Dropdown & Persistence:**
  - Added a language dropdown to the user panel modal allowing users to select their preferred language.
  - Persisted the selected language in localStorage, ensuring that the preferred language is automatically applied on page refresh.
  - Updated main.js to load and set the user’s language preference on DOMContentLoaded by calling `setLocale()` and `applyTranslations()`.

- **Bug Fixes & Improvements:**
  - Fixed issues with evaluation of translation function calls in template literals (ensured proper syntax with `${t("key")}`).
  - Updated the t() function to be more defensive against missing keys.
  - Provided instructions and code examples to ensure the language change settings are reliably saved and applied across sessions.

- **ZIP Download Flow**
  - Progress Modal: In the ZIP download handler (confirmDownloadZip), added code to show a progress modal (with a spinning icon) as soon as the user confirms the download and before the request to create the ZIP begins. Once the blob is received or an error occurs, we hide the progress modal.
  - Inline Handlers and Global Exposure: Ensured that functions like confirmDownloadZip are attached to the global window object (or called via appropriate inline handlers) so that the inline onclick events in the HTML work without reference errors.

- **Single File Download Flow**
  - Modal Popup for Single File: Replaced the direct download link for single files with a modal-driven flow. When the download button is clicked, the openDownloadModal(fileName, folder) function is called. This stores the file details and shows a modal where the user can confirm (or edit) the file name.
  - Confirm Download Function: When the user clicks the Download button in the modal, the confirmSingleDownload() function is called. This function constructs a URL for download.php (using GET parameters for folder and file), fetches the file as a blob, and triggers a download using a temporary anchor element. A progress modal is also used here to give feedback during the download process.

- **Zip Extraction**
  - Reused Zip Download modal to use same progress Modal Popup with Extracting files.... text.

---

## Changes 4/7/2025 v1.0.9

- TOTP one time recovery code added
- fix(security): mitigate CodeQL alerts by adding SRI attributes and sanitizing DOM content

---

## Changes 4/6/2025 v1.0.8

**May need to log out and log back in if using remember me**  

Changelog: Modularize fileManager.js

1. **fileListView.js**  
 • Extracted all table/gallery rendering logic (loadFileList, renderFileTable, renderGalleryView, sortFiles, date parsing, pagination).  
 • Kept global helpers on window (changePage, changeItemsPerPage).  
 • Added explicit re‑binding of context‑menu and drag‑drop handlers after each render.  
2. **filePreview.js**  
 • Moved “Preview” and “Share” modal code here (previewFile, openShareModal, plus displayFilePreview helper).  
 • Exposed window.previewFile for inline onclick compatibility.  
3. **fileEditor.js**  
 • Isolated CodeMirror editor logic (editFile, saveFile, sizing, theme toggles).  
 • Exported utility functions (getModeForFile, adjustEditorSize, observeModalResize).  
4. **fileDragDrop.js**  
 • Encapsulated all drag‑start and folder drag/drop handlers (fileDragStartHandler, folderDragOverHandler, etc.).  
5. **fileMenu.js** (formerly contextMenu.js)  
 • Centralized right‑click context menu construction and binding (showFileContextMenu, fileListContextMenuHandler, bindFileListContextMenu).  
 • Now calls the correct single vs. multi‑tag modals.  
6. **fileActions.js**  
 • Consolidated all “Delete”, “Copy”, “Move”, “Download Zip”, “Extract Zip”, “Rename” workflows and their modals.  
 • Exposed initFileActions() to wire up toolbar buttons on page load.  
7. **fileManager.js** (entry point)  
 • Imports all the above modules.  
 • On DOM ready: calls initFileActions(), attaches folder tree drag/drop, and global key handlers.

Changelog: OIDC, Basic Auth & TOTP Integration

1. **auth.php (OIDC)**  
 • Detects callback via `?code` or `?oidc=callback`.  
 • Checks for a TOTP secret after OIDC auth, stores pending login in session, redirects with `?totp_required=1`.  
 • Finalizes session only after successful TOTP verification.  

2. **login_basic.php (Basic Auth)**  
 • After password verification, checks for TOTP secret.  
 • Stores pending login & secret in session, redirects to TOTP modal.  
 • Completes session setup only after TOTP verification.  

3. **authModals.js & auth.js**  
 • Detect `?totp_required=1` and open the TOTP modal.  
 • Override `showToast` to suppress “Please log in…” during TOTP.  
 • Wrap `openTOTPLoginModal` to disable Basic/OIDC buttons (but keep form-login visible).  
 • On invalid TOTP code, keep modal open, clear input, and refocus for retry.  

4. **totp_verify.php**  
 • Consolidates login and setup TOTP flows in one endpoint.  
 • Enforces CSRF token and authentication guard.  
 • Verifies TOTP, regenerates session on success, and clears pending state.  
 • Production‑hardened: secure cookies, CSP header, rate‑limiting (5 attempts), standardized JSON responses, and robust error handling.

---

## changes 4/4/2025

- fix(`download.php`): mitigate path traversal vulnerability by validating folder and file inputs
- Fixed OIDC login button DOM.
- Fixed userPermissions calling username before declared.
- Fixed config.php loadUserPermissions issue.
- Chain Initialization After CSRF Token Is Loaded
- loadCsrfTokenWithRetry

---

## changes 4/3/2025

Change Log for dragAndDrop.js Enhancements

- **Header Drop Zone Integration:**
  - Added a new header drop zone (`#headerDropArea`) to support dragging cards (Upload and Folder Management) into the header.
  - Created functionality to display a compact Material icon in the header when a card is dropped there.

- **Modal Popup for Header Cards:**
  - Implemented a modal overlay that displays the full card when the user hovers or clicks the header icon.
  - Added toggle functionality so that the modal can be locked open or auto-hide based on mouse interactions.

- **State Preservation via Hidden Container:**
  - Introduced a hidden container (`#hiddenCardsContainer`) to preserve the original state of the Upload and Folder Management cards.
  - Modified logic so that instead of removing these cards from the DOM when dropped into the header, they are moved to the hidden container.
  - Updated modal show/hide functions to move the card from the hidden container into the modal (and back), ensuring interactive elements (e.g., folder tree, file selection) remain fully initialized and retain their state across page refreshes.

- **Local Storage Integration for Header Order:**
  - Added `saveHeaderOrder()` and `loadHeaderOrder()` functions to persist the header drop zone order.
  - Integrated header order saving/updating with drag-and-drop events so that header placements are maintained after refresh.

- **General Drag & Drop Enhancements:**
  - Maintained smooth drag-and-drop animations and reflow for all drop zones (sidebar, top, and header).
  - Ensured existing functionalities (like file uploads and folder tree interactions) work seamlessly alongside the new header drop zone.
  
## Brief Description

The enhancements extend the existing drag-and-drop functionality by adding a header drop zone where cards are represented by a compact Material icon. To preserve interactive state (such as the folder tree’s current folder or file input functionality) across page refreshes, the original cards are never fully removed from the DOM. Instead, they are moved into a hidden container, and when a user interacts with the header icon, the card is temporarily transferred into a modal overlay for full interaction. When the modal is closed, the card is returned to the hidden container, ensuring that its state remains intact. Additionally, header order is saved to local storage so that user-customized layouts persist across sessions.

---

## changes 4/2/2025

- **Admin Panel - User Permissions**
  - folderOnly - User gets their own root folder.
  - readOnly - User can't delete, rename, move, copy and other endpoints are blocked.
  - disableUpload - User can't upload any files.
  - Encrypted json 'userPermissions.json'
  - Created 'updateUserPermissions.php' & 'getUserPermissions.php'

- **TOTP Confirmation**
  - Must confirm code before it will enable TOTP.
  - 'totp_verify.php' & 'totp_disable.php' were created

- **Basic Auth & OIDC fixes**
  - Fixed session issues
  - Improvements for both Basic Auth & OIDC

- Path Normalization
- Folder Rendering Adjustments
- Folder Creation Logic adjusted
- User Panel added username
- Admin Panel added version number
- Metadata Adjustments
- Toast moved to bottom right
- Help function 'loadUserPermissions()'
- 'auth.js' split into 'authModals.js'
- Empty 'createdTags.json' added
- Enable MKV video playback if supported
- Custom toast opacity increased
- Fixed fileDragStartHandler to work with tagFiles
- And more

---

## changes 3/31/2025

- **Chunk merging logic updated to attempt to clear any resumable issues**

- **Implemented Video Progress Saving and Resuming**

- **Context Menu Tagging:**  
  - "Tag File" option for single files; "Tag Selected" for multiple files.
- **Tagging Modals:**  
  - Separate modals for single‑ and multi‑file tagging with custom dropdowns.
- **Global Tag Store:**  
  - Reusable tags persisted via `createdTags.json`; dropdown shows tag color and remove icon.
- **Unified Search:**  
  - Single search box filters files by name or associated tag(s).

- **saveFileTag.php:**  
  - Saves file-specific tags and updates global tags (supports removal).
- **getFileList.php:**  
  - Returns tag data for each file and the global tag list.

- Added `openMultiTagModal()` for batch tagging.
- Custom dropdowns with colored tag previews and removal buttons.
- Filtering logic updated in table and gallery views to combine file name and tag searches.

## changes 3/30/2025

- **New Feature:** Generates a QR code for TOTP setup using the Endroid QR Code library.
- **TOTP Secret Management:**  
  - Retrieves the current user's TOTP secret from the users file.
  - If no secret exists, generates a new one using RobThree\Auth\TwoFactorAuth and stores it (encrypted).
- **Global OTPAuth URL Integration:**  
  - Checks for a global OTPAuth URL in the admin configuration.
  - If provided, replaces the `{label}` and `{secret}` placeholders in the URL template; otherwise, falls back to a default otpauth URL.
- **Security:**  
  - Enforces session authentication.
  - Verifies the CSRF token passed via GET parameters.

- **New Feature:** Handles AJAX requests to update the user’s TOTP settings from the User Panel.
- **TOTP Enable/Disable Handling:**  
  - If TOTP is disabled, clears the user's TOTP secret from the users file.
  - If TOTP remains enabled, leaves the stored secret intact.
- **Security:**  
  - Validates user authentication and CSRF token before processing the update.
- **Response:**  
  - Returns a JSON response indicating whether TOTP has been enabled or disabled successfully.

- **New TOTP Settings Section:**  
  - A "TOTP Settings" fieldset has been added to the User Panel modal.
- **Automatic TOTP Setup Trigger:**  
  - When the "Enable TOTP" checkbox is checked, it automatically triggers the TOTP Setup Modal to display the QR code.
- **State Management**  
- **UI Improvements:**  
  - All modals (User Panel, TOTP Setup, and TOTP Login) now support dark mode styling.

- **Error Handling & Security:**  
  - Enhanced error handling across all new TOTP-related endpoints.
  - Added extra CSRF and authentication checks to improve security.
- **User Experience:**  
  - Streamlined the onboarding process for TOTP by integrating automatic modal triggers and real-time configuration updates.

---

## changes 3/29/2025

**Frontend (JavaScript)**  

**File:** `auth.js`

- **Added OIDC Login Flow**
  - Created a dedicated OIDC login button (`oidcLoginBtn`).
  - Redirects users to OIDC authentication via `auth.php?oidc`.

- **Admin Panel Button**
  - Added an “Admin Panel” button (`adminPanelBtn`) with a Material icon (`admin_panel_settings`).
  - Inserted Admin Panel button directly after the Restore button in the header.

- **Admin Panel Modal**
  - Built a fully-featured admin panel modal with fields to edit:
    - OIDC Provider URL
    - Client ID
    - Client Secret
    - Redirect URI
  - Options to disable Form Login, Basic Auth, or OIDC login methods individually.
  - Integrated real-time constraint enforcement to ensure at least one authentication method is always enabled.
  - Saved admin preferences into local storage and backend (via `updateConfig.php`).

- **Dynamic UI Updates**
  - Added functions (`updateLoginOptionsUI`, `updateLoginOptionsUIFromStorage`) to dynamically show/hide login elements based on admin preferences.

⸻

**Backend (PHP)**  

**File:** `auth.php`

- **OIDC Authentication**
  - Integrated Jumbojett’s OpenID Connect client to handle OIDC flows.
  - Reads OIDC configuration from an encrypted JSON file (`adminConfig.json`).
  - Redirects users to OIDC provider and handles callbacks properly, authenticating users and initiating PHP sessions.

- **Security Enhancements**
  - Implemented robust error handling for authentication failures.
  - Session regeneration after successful login to mitigate session fixation risks.

**Configuration Handling**  

**File:** `getConfig.php`

- **Secure Configuration Retrieval**
  - Retrieves encrypted OIDC configuration from disk.
  - Decrypts and sends JSON configuration securely to the frontend.
  - Defaults provided if configuration does not exist.

**File:** `updateConfig.php`

- **Secure Configuration Updates**
  - Strictly checks for authenticated admin sessions and validates CSRF tokens.
  - Validates and sanitizes user input thoroughly (OIDC URL, client ID, secret, redirect URI).
  - Updates encrypted configuration file securely, ensuring atomic writes (`LOCK_EX`).

- **Consistent Styling**
  - Modal dynamically adjusts styling based on dark/light modes.
  - Improved accessibility with clear icons, visual hierarchy, and structured form fields.

- **Enhanced Feedback**
  - Toast notifications clearly communicate success/error messages for user/admin actions.

⸻

**Security and Best Practices**  

- OIDC credentials are securely stored in an encrypted JSON configuration file.
- Implemented proper sanitization and validation of input data.
- Protected sensitive admin routes (`updateConfig.php`) with CSRF validation and strict access control.

⸻

**Possible Improvements**  

- **OIDC Logout Support:** Add explicit logout from OIDC providers.
- **OIDC Discovery Endpoint:** Automatically fetch provider details from `.well-known/openid-configuration`.
- **Advanced User Mapping:** Allow administrators to map OIDC claims to internal user roles dynamically.

---

## changes 3/27/2025

- Basic Auth added for login.
- Audio files supported for playback mp3|wav|m4a|ogg|flac|aac|wma|opus

---

## changes 3/26/2025

- New name change FileRise - Elevate your file management.
- Animated logo that rises up once for 3 seconds and falls back down
- New Side Bar and Top Bar drop areas
  - Drag and Drop Upload & Folder Management cards
  - Vertical slide up effect when dropping cards
- Fixed double root folders when only root folder exist
- Adjusted side bar drop zone

---

## changes 3/25/2025

- **Context Menu Enhancements:**
  - **Right‑Click Context Menu:**
    - Added context menu support for file list rows so that right‑clicking shows a custom menu.
    - When multiple files are selected, options like “Delete Selected”, “Copy Selected”, “Move Selected”, “Download Zip” are shown.
    - When a file with a “.zip” extension is among the selections, an “Extract Zip” option is added.
  - **Single File Options:**
    - For a single selected file, additional items (“Preview”, “Edit”, and “Rename”) are appended.
    - The “Edit” option appears only if `canEditFile(file.name)` returns true.
- **Keyboard Shortcuts:**
  - **Delete Key Shortcut:**
    - Added a global keydown listener to detect the Delete (or Backspace on Mac) key.
    - When pressed (and if no input/textarea is focused) with files selected, it triggers `handleDeleteSelected()` to open the delete confirmation modal.
- **Modals & Enter-Key Handling:**
  - **attachEnterKeyListener Update:**
    - Modified the function to use the “keydown” event (instead of “keypress”) for better reliability.
    - Ensured the modal is made focusable (by setting a `tabindex="-1"`) and focused immediately after being displayed.
    - This update was applied to modals for rename, download zip, and delete operations.
  - **Delete Modal Specific:**
    - It was necessary to call `attachEnterKeyListener` for the delete modal after setting its display to “block” to ensure it captures the Enter key.
- **File Editing Adjustments:**
  - **Content-Length Check:**
    - Modified the `editFile` function so that it only blocks files when the Content-Length header is non‑null and greater than 10 MB.
    - This change allows editing of 0 KB files (or files with Content-Length “0”) without triggering the “File too large” error.

- **Context Menu for Folder Manager:**
  - Provided a separate implementation for a custom context menu for folder manager elements.
  - Bound the context menu to both folder tree nodes (`.folder-option`) and breadcrumb links (`.breadcrumb-link`) so that right‑clicking on either triggers a custom menu.
  - The custom menu for folders includes actions for “Create Folder”, “Rename Folder”, and “Delete Folder.”
  - Added guidance to ensure that breadcrumb HTML elements contain the appropriate class and `data-folder` attribute.
- **Keyboard Shortcut for Folder Deletion (Suggestion):**
  - Suggested adding a global keydown listener in `folderManager.js` to trigger folder deletion (via `openDeleteFolderModal()`) when Delete/Backspace is pressed and a folder other than “root” is selected.

- **Event Listener Timing:**
  - Ensured that context menu and key event listeners are attached after the corresponding DOM elements are rendered.
  - Added explicit focus calls (and `tabindex` attributes) for modals to capture keyboard events.

---

## changes 3/24/2025

### config.php

- **Encryption Functions Added:**
  - Introduced `encryptData()` and `decryptData()` functions using AES‑256‑CBC to encrypt and decrypt persistent tokens.
- **Encryption Key Handling:**
  - Added code to load the encryption key from an environment variable (`PERSISTENT_TOKENS_KEY`) with a fallback default.
- **Persistent Token Auto-Login:**
  - Modified the auto-login logic to check for a `remember_me_token` cookie.
  - If the persistent tokens file exists, it now reads and decrypts its content before decoding JSON.
  - If a token is expired, the code removes the token, re-encrypts the updated array, writes it back to disk, and clears the cookie.
- **Cookie and Session Settings:**
  - No major changes aside from integrating the encryption functionality into the token handling.

### auth.php

- **Login Process and “Remember Me” Functionality:**
  - When “Remember me” is checked, generates a secure random token.
  - Loads the persistent tokens file (if it exists), decrypts its content, and decodes the JSON.
  - Inserts the new token (with associated username and expiry) into the persistent tokens array.
  - Encrypts the updated tokens array and writes it back to the file.
  - Sets the `remember_me_token` cookie using the `$secure` flag and expiry.
- **Authentication & Brute Force Protection:**
  - The authentication logic and brute-force protection remain largely unchanged.

### logout.php

- **Persistent Token Removal:**
  - If a `remember_me_token` cookie exists, the script loads the persistent tokens file, decrypts its content, removes the token if present, re-encrypts the array, and writes it back.
- **Cookie Clearance and Session Destruction:**
  - Clears the `remember_me_token` cookie.
  - Destroys session data as before.

### networkUtils.js

- **Fetch Wrapper Enhancements:**
  - Modified `sendRequest()` to clone the response before attempting to parse JSON.
  - If JSON parsing fails (e.g., because of unexpected response content), the cloned response is used to read the text, preventing the “Body is disturbed or locked” error.
- **Error Handling Improvements:**
  - Improved error handling by ensuring the response body is read only once.

---

## changes 3/23/2025 v1.0.1

- **Resumable File Upload Integration and Folder Support**
  - **Legacy Drag-and-Drop Folder Uploads:**
    - Supports both file and folder uploads via drag-and-drop.
    - Recursively traverses dropped folders to extract files.
    - Uses original XHR-based upload code for folder uploads so that files are placed in the correct folder (i.e. based on the current folder in the app’s folder tree).
  - **Resumable.js for File Picker Uploads:**
    - Integrates Resumable.js for file uploads via the file picker.
    - Provides pause, resume, and retry functionality:
    - Pause/Resume: A pause/resume button is added for each file selected via the file picker. When the user clicks pause, the file upload pauses and the button switches to a “play” icon. When the user clicks it again, the system triggers a resume sequence (calling the upload function twice to ensure proper restart).
    - Retry: If a file upload encounters an error, the pause/resume button changes to a “replay” icon, allowing the user to retry the upload.
    - During upload, the UI displays the progress percentage along with the calculated speed (bytes/KB/MB per second).
    - Files are previewed using material icons for non-image files and actual image previews for image files (using a helper function that creates an object URL for image files).
  - **Temporary Chunk Folder Removal:**
    - When a user cancels an upload via the remove button (X), a POST request is sent to a PHP endpoint (removeChunks.php) that:
    - Validates the CSRF token.
    - Recursively deletes the temporary folder (which stores file chunks) from the uploads directory.
  - **Additional Details:**
    - The file list UI remains visible (instead of auto-disappearing after 5 seconds) if there are any files still present or errors, ensuring that users can retry failed uploads.
    - The system uses a chunk size of 3MB and supports multiple simultaneous uploads.
    - All endpoints include CSRF protection and input validation to ensure secure operations.

---

## changes 3/22/2025

- Change Password added and visibile to all users.
- Brute force protection added and a log file for fail2ban created
- Fix add user and setup user issue
- Added folder breadcrumb with drag and drop support

---

## changes 3/21/2025 v1.0.0

- **Trash Feature Implementation**
  - Added functionality to move deleted files to a Trash folder.
  - Implemented trash metadata storage (trash.json) capturing original folder, file name, trashed timestamp, uploader, and deletedBy.
  - Developed restore feature allowing admins to restore individual or all files from Trash.
  - Developed delete feature allowing permanent deletion (Delete Selected and Delete All) from Trash.
  - Implemented auto-purge of trash items older than 3 days.
  - Updated trash modal design for better user experience.
  - Incorporated material icons with tooltips in restore/delete buttons.
  - Improved responsiveness of the trash modal with a centered layout and updated CSS.
  - Fixed issues where trashed files with missing metadata were not restored properly.
  - Resolved problems with the auto-purge mechanism when trash.json was empty or contained unexpected data.
  - Adjusted admin button logic to correctly display the restore button for administrators.
  - Improved error handling on restore and delete actions to provide more informative messages to users.
- **Other changes**
  - CSS adjusted (this needs to be refactored)
  - Fixed setup mode CSRF issue in addUser.php
  - Adjusted modals buttons in index.html & folderManager.js
  - Changed upload.php safe pattern
  - Hide trash folder
  - Reworked auth.js

---

## changes 3/20/2025

- **Drag & Drop Feature**
  - For a single file: shows a file icon alongside the file name.
  - For multiple files: shows a file icon and a count of files.
  - Styling Adjustments:
  - Modified drag image styling (using inline-flex, auto width, and appropriate padding) so that the drag image only sizes to its content and does not extend off the screen.
  - Revised the folder drop handler so that it reads the array of file names from the drag data and sends that array (instead of a single file name) to the server (moveFiles.php) for processing.
  - Attached dragover, dragleave, and drop event listeners to folder tree nodes (the elements with the class folder-option) to enable a drop target.
  - Added a global dragover event listener (in main.js) that auto-scrolls the page when the mouse is near the top or bottom of the viewport during a drag operation. This ensures you can reach the folder tree even if you’re far down the file list.

---

## changes 3/19/2025

## Session & Security Enhancements

- **Secure Session Cookies:**  
  - Configured session cookies with a 2-hour lifetime, HTTPOnly, and SameSite settings.
  - Regenerating the session ID upon login to mitigate session fixation.
- **CSRF Protection:**  
  - Ensured the CSRF token is generated in `config.php` and returned via a `token.php` endpoint.
  - Updated front-end code (e.g. in `main.js`) to fetch the CSRF token and update meta tags.
- **Session Expiration Handling:**  
  - Updated the `loadFileList` and other functions to check for HTTP 401 responses and trigger a logout or redirect if the session has expired.

## File Management Improvements

### Unique Naming to Prevent Overwrites

- **Copy & Move Operations:**  
  - Added a helper function `getUniqueFileName()` to both `copyFiles.php` and `moveFiles.php` that checks for duplicates and appends a counter (e.g., “ (1)”) until a unique filename is determined.
  - Updated metadata handling so that when a file is copied/moved and renamed, the corresponding metadata JSON (per-folder) is updated using the new unique filename.
- **Rename Functionality:**  
  - Updated `renameFile.php` to:
    - Allow filenames with parentheses by updating the regex.
    - Check if a file with the new name already exists.
    - Generate a unique name using similar logic if needed.
    - Update folder-specific metadata accordingly.

### Metadata Management

- **Per-Folder Metadata Files:**  
  - Changed metadata storage so that each folder uses its own metadata file (e.g., `root_metadata.json` for the root folder and `FolderName_metadata.json` for subfolders).
  - Updated metadata file path generation functions to replace slashes, backslashes, and spaces with dashes.

## Gallery / Grid View Enhancements

- **Gallery (Grid) View:**  
  - Added a toggle option to switch between a traditional table view and a gallery view.
  - The gallery view arranges image thumbnails in a grid layout with configurable column options (e.g., 3, 4, or 5 columns).
  - Under each thumbnail, action buttons (Download, Edit, Rename, Share) are displayed for quick access.
- **Preview Modal Enhancements:**  
  - Updated the image preview modal to include navigation buttons (prev/next) for browsing through images.
  - Improved scaling and styling of preview modals for a better user experience.

## Share Link Functionality

- **Share Link Generation (createShareLink.php):**  
  - Generate shareable links for files with:
    - A secure token.
    - Configurable expiration times (including options for 30, 60, 120, 180, 240 minutes, and a 1-day option).
    - Optional password protection (passwords are hashed).
  - Store share links in a JSON file (`share_links.json`) with details (folder, file, expiration timestamp, hashed password).
- **Share Endpoint (share.php):**  
  - Validate tokens, expiration, and passwords.
  - Serve files inline for images or force download for other file types.
  - Share URL is configurable via environment variables or auto-detected from the server.
- **Front-End Configuration:**  
  - Created a `token.php` endpoint that returns CSRF token and SHARE_URL.
  - Updated the front-end (in `main.js`) to fetch configuration data and update meta tags for CSRF and share URL, allowing index.html to remain static.

## Apache & .htaccess / Server Security

- **Disable Directory Listing:**  
  - Recommended adding an .htaccess file (e.g., in `uploads/`) with `Options -Indexes` to disable directory indexing.
- **Restrict Direct File Access:**  
  - Protected sensitive files (e.g., users.txt) via .htaccess.
  - Filtered out hidden files (files beginning with a dot) from the file list in `getFileList.php`.
- **Proxy Download:**  
  - A proxy download mechanism has been implemented (via endpoints like `download.php` and `downloadZip.php`) so that every file download request goes through a PHP script. This script validates the session and CSRF token before streaming the file, ensuring that even if a file URL is guessed, only authenticated users can access it.

---

## changes 3/18/2025

- **CSRF Protection:** All state-changing endpoints (such as those for folder and file operations) include CSRF token validation to ensure that only legitimate requests from authenticated users are processed.

---

## changes 3/17/2025

- refactoring/reorganize domUtils, fileManager.js & folerManager.js

---

## changes 3/15/2025

- Preview video, images or PDFs added
- Different material icons for each
- Custom css to adjust centering
- Persistent folder tree view
- Fixed folder tree alignment
- Persistent last opened folder

---

## changes 3/14/2025

- Style adjustments
- Folder/subfolder upload support
- Persistent UI elements Items Per Page & Dark/Light modes.
- File upload scrollbar list
- Remove files from upload list

---

## changes 3/11/2025

- CSS Refactoring
- Dark / Light Modes added which automatically adapts to the operating system’s theme preference by default, with a manual toggle option.
- JS inlines moved to CSS

---

## changes 3/10/2025

- File Editing Enhancements:
  - Integrated CodeMirror into the file editor modal for syntax highlighting, line numbers, and adjustable font size.
  - Added zoom in/out controls (“A-” / “A+”) in the editor modal to let users adjust the text size and number of visible lines.
  - Updated the save function to retrieve edited content from the CodeMirror instance (using editor.getValue()) instead of the underlying textarea.
- Image Preview Improvements:
  - Added a new “Preview” button (with a Material icon) in the Actions column for image files.
  - Implemented an image preview modal that centers content using flexbox, scales images using object-fit: contain, and maintains the original aspect ratio.
  - Fixed URL encoding for subfolder paths so that images in subfolders (e.g. NewFolder2/Vita) load correctly without encoding slashes.
- Download ZIP Modal Updates:
  - Replaced the prompt-based download ZIP with a modal dialog that allows users to enter a custom name for the ZIP file.
  - Updated the modal logic to ensure proper flow (cancel/confirm) and pass the custom filename to the download process.
- Folder URL Handling:
  - Modified the folder path construction in the file list rendering to split folder names into segments and encode each segment individually. This prevents encoding of slashes, ensuring correct URLs for files in subfolders.
- General UI & Functionality:
  - Ensured that all global functions (e.g., toggleRowSelection, updateRowHighlight, and sortFiles) are declared and attached to window so that inline event handlers can access them.
  - Maintained responsive design, preserving existing features such as pagination, sorting, batch operations (delete, copy, move), and folder management.
  - Updated event listener initialization to work with new modal features and ensure smooth UI interactions.

---

## changes 3/8/2025

- Validation was added in endpoints.
- Toast notifications were implemented in domUtils.js and integrated throughout the app.
- Modals replaced inline prompts and confirms for rename, create, delete, copy, and move actions.
- Folder tree UI was added and improved to be interactive plus reflect the current state after actions.

---

## changes 3/7/2025

- **Module Refactoring:**
  - Split the original `utils.js` into multiple ES6 modules for network requests, DOM utilities, file management, folder management, uploads, and authentication.
  - Converted all code to ES6 modules with `import`/`export` syntax and exposed necessary functions globally.
- **File List Rendering & Pagination:**
  - Implemented pagination in `fileManager.js` to allow displaying 10, 20, 50, or 100 items per page.
  - Added global functions (`changePage` and `changeItemsPerPage`) for pagination control.
  - Added a pagination control section below the file list table.
- **Date Sorting Enhancements:**
  - Created a custom date parser (`parseCustomDate`) to convert date strings.
  - Adjusted the parser to handle two-digit years by adding 2000.
  - Integrated the parser into the sorting function to reliably sort “Date Modified” and “Upload Date” columns.
- **File Upload Improvements:**
  - Enabled multi-file uploads with individual progress tracking (visible for the first 10 files).
  - Ensured that the file list refreshes immediately after uploads complete.
  - Kept the upload progress list visible for a configurable delay to allow users to verify upload success.
  - Reattached event listeners after the file list is re-rendered.
- **File Action Buttons:**
  - Unified button state management so that Delete, Copy, and Move buttons remain visible as long as files exist, and are only enabled when files are selected.
  - Modified the logic in `updateFileActionButtons` and removed conflicting code from `initFileActions`.
  - Ensured that the folder dropdown for copy/move is hidden when no files exist.
- **Rename Functionality:**
  - Added a “Rename” button to the Actions column for every file.
  - Implemented a `renameFile` function that prompts for a new name, calls a backend script (`renameFile.php`) to perform the rename, updates metadata, and refreshes the file list.
- **Responsive & UI Tweaks:**
  - Applied CSS media queries to hide secondary columns on small screens.
  - Adjusted file preview and icon styling for better alignment.
  - Centered the header and optimized the layout for a clean, modern appearance.
  
This changelog and feature summary reflect the improvements made during the refactor from a monolithic utils file to modular ES6 components, along with enhancements in UI responsiveness, sorting, file uploads, and file management operations.

---

## Changes 3/4/2025

- Copy & Move functionality added  
- Header Layout  
- Modal Popups (Edit, Add User, Remove User) changes  
- Consolidated table styling  
- CSS Consolidation  
- assets folder  
- additional changes and fixes

---

## Changes 3/3/2025

- folder management added  
- some refactoring  
- config added USERS_DIR & USERS_FILE  
