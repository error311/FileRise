# Changelog

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
  
*This changelog and feature summary reflect the improvements made during the refactor from a monolithic utils file to modular ES6 components, along with enhancements in UI responsiveness, sorting, file uploads, and file management operations.*

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
