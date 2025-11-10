# Changelog

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
