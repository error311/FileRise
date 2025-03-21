# Multi File Upload Editor

https://github.com/user-attachments/assets/179e6940-5798-4482-9a69-696f806c37de

changelogs available here: <https://github.com/error311/multi-file-upload-editor-docker/>

Multi File Upload Editor is a lightweight, secure web application for uploading, editing, and managing files. It’s built with an Apache/PHP backend and a modern JavaScript frontend (ES6 modules) to provide a responsive, dynamic file management interface. The application is ideal for scenarios like document management, image galleries, firmware file hosting, or any situation where multiple files need to be uploaded and organized through a web interface.

---

## Features

- **Multiple File/Folder Uploads with Progress:**
  - Users can select and upload multiple files & folders at once.
  - Each file upload displays an individual progress bar with percentage and upload speed.
  - Image files show a small thumbnail preview (with default Material icons for other file types).
- **Built-in File Editing & Renaming:**
  - Text-based files (e.g., .txt, .html, .js) can be opened and edited in a modal window using CodeMirror for:
    - Syntax highlighting
    - Line numbering
    - Adjustable font sizes
  - Files can be renamed directly through the interface.
  - The renaming functionality now supports names with parentheses and checks for duplicate names, automatically generating a unique name (e.g., appending “ (1)”) when needed.
  - Folder-specific metadata is updated accordingly.
- **Built-in File Preview:**
  - Users can quickly preview images, videos, and PDFs directly in modal popups without leaving the page.
  - The preview modal supports inline display of images (with proper scaling) and videos with playback controls.
  - Navigation (prev/next) within image previews is supported for a seamless browsing experience.
- **Gallery (Grid) View:**
  - In addition to the traditional table view, users can toggle to a gallery view that arranges image thumbnails in a grid layout.
  - The gallery view offers multiple column options (e.g., 3, 4, or 5 columns) so that users can choose the layout that best fits their screen.
  - Action buttons (Download, Edit, Rename, Share) appear beneath each thumbnail for quick access.
- **Batch Operations (Delete/Copy/Move/Download):**
  - **Delete Files:** Delete multiple files at once.
  - **Copy Files:** Copy selected files to another folder with a unique-naming feature to prevent overwrites.
  - **Move Files:** Move selected files to a different folder, automatically generating a unique filename if needed to avoid data loss.
  - **Download Files as ZIP:** Download selected files as a ZIP archive. Users can specify a custom name for the ZIP file via a modal dialog.
  - **Drag & Drop:** Easily move files by selecting them from the file list and simply dragging them onto your desired folder in the folder tree. When you drop the files onto a folder, the system automatically moves them, updating your file organization in one seamless action.
- **Folder Management:**
  - Organize files into folders and subfolders with the ability to create, rename, and delete folders.
  - A dynamic folder tree in the UI allows users to navigate directories easily, and any changes are immediately reflected in real time.
  - **Per-Folder Metadata Storage:** Each folder has its own metadata JSON file (e.g., `root_metadata.json`, `FolderName_metadata.json`), and operations (copy/move/rename) update these metadata files accordingly.
- **Sorting & Pagination:**
  - The file list can be sorted by name, modified date, upload date, file size, or uploader.
  - Pagination controls let users navigate through files with selectable page sizes (10, 20, 50, or 100 items per page) and “Prev”/“Next” navigation buttons.
- **Share Link Functionality:**
  - Generate shareable links for files with configurable expiration times (e.g., 30, 60, 120, 180, 240 minutes, and a 1-day option) and optional password protection.
  - Share links are stored in a JSON file with details including the folder, file, expiration timestamp, and hashed password.
  - The share endpoint (`share.php`) validates tokens, expiration, and password before serving files (or forcing downloads).
  - The share URL is configurable via environment variables or auto-detected from the server.
- **User Authentication & Management:**
  - Secure, session-based authentication protects the file manager.
  - Admin users can add or remove users through the interface.
  - Passwords are hashed using PHP’s `password_hash()` for security.
  - All state-changing endpoints include CSRF token validation.
- **Responsive, Dynamic & Persistent UI:**
  - The interface is mobile-friendly and adapts to various screen sizes by hiding non-critical columns on small devices.
  - Asynchronous updates (via Fetch API and XMLHttpRequest) keep the UI responsive without full page reloads.
  - Persistent settings (such as items per page, dark/light mode preference, folder tree state, and the last open folder) ensure a smooth and customized user experience.
- **Dark Mode/Light Mode:**
  - The application automatically adapts to the operating system’s theme preference by default and offers a manual toggle.
  - The dark mode provides a darker background with lighter text and adjusts UI elements (including the CodeMirror editor) for optimal readability in low-light conditions.
  - The light mode maintains a bright interface for well-lit environments.
- **Server & Security Enhancements:**
  - The Apache configuration (or .htaccess files) is set to disable directory indexing (e.g., using `Options -Indexes` in the uploads directory), preventing unauthorized users from viewing directory contents.
  - Direct access to sensitive files (e.g., `users.txt`) is restricted through .htaccess rules.
  - A proxy download mechanism has been implemented (via endpoints like `download.php` and `downloadZip.php`) so that every file download request goes through a PHP script. This script validates the session and CSRF token before streaming the file, ensuring that even if a file URL is guessed, only authenticated users can access it.
  - Administrators are advised to deploy the app on a secure internal network or use the proxy download mechanism for public deployments to further protect file content.
- **Trash Management with Restore & Delete:**
  - **Trash Storage & Metadata:**
    - Deleted files are moved to a designated “Trash” folder rather than being immediately removed.
    - Metadata is stored in a JSON file (`trash.json`) that records:
      - Original folder and file name
      - Timestamp when the file was trashed
      - Uploader information (and optionally who deleted it)
      - Additional metadata (e.g., file type)
  - **Restore Functionality:**
    - Admins can view trashed files in a modal.
    - They can restore individual files (with conflict checks) or restore all files back to their original location.
  - **Delete Functionality:**
    - Users can permanently delete trashed files via:
      - **Delete Selected:** Remove specific files from the Trash and update `trash.json`.
      - **Delete All:** Permanently remove every file from the Trash after confirmation.
  - **Auto-Purge Mechanism:**
    - The system automatically purges (permanently deletes) any files in the Trash older than three days, helping manage storage and prevent the accumulation of outdated files.
  - **User Interface:**
    - The trash modal displays details such as file name, uploader/deleter, and the trashed date/time.
    - Material icons with tooltips visually represent the restore and delete actions.

---

## Screenshots

**Light mode**
![Light Mode](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/light-mode.png)

**Dark mode**
![Dark Mode](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/dark-mode.png)

![dark-editor](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/dark-editor.png)  
![dark-preview](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/dark-preview.png)  
![light-downloadzip](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/light-downloadzip.png)
![Login](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/login-page.png)

  **iphone:**  
<p align="center">
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/dark-iphone.png" width="45%">
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/light-preview-iphone.png" width="45%">
</p>

based off of:
<https://github.com/sensboston/uploader>

## Prerequisites

- Apache2, configured, up and running
- PHP 8.1 or higher
- Required PHP extensions: `php-json`, `php-curl`, `php-zip`
