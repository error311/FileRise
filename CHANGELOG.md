# Changelog

## Changes 5/27/2025

- Support for mounting CIFS (SMB) network shares via Docker volumes
- New `scripts/scan_uploads.php` script to generate metadata for imported files and folders
- `SCAN_ON_START` environment variable to trigger automatic scanning on container startup
- Documentation for configuring CIFS share mounting and scanning

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
  - Filters to only *direct* children of the current folder, hiding `profile_pics` and `trash`.  
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
  - **Admin Panel** only shown when `data.isAdmin` *and* on `demo.filerise.net`
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
- Inserted a **proxy-only auto-login** block *before* the usual session/auth checks:  
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

### Security

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

### `main.js`

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
