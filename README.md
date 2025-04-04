# FileRise - Elevate your File Management

**Demo link:** https://demo.filerise.net
**UserName:** demo
**Password:** demo
Read only permissions but can view the interface.

**4/3/2025 Video demo:**

https://github.com/user-attachments/assets/221f6a53-85f5-48d4-9abe-89445e0af90e

**Dark mode:**
![Dark Header](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-header.png)

changelogs available here: <https://github.com/error311/FileRise-docker/>

FileRise is a lightweight, secure, self-hosted web application for uploading, syntax-highlight editing, drag & drop file management, and more. Built with an Apache/PHP backend and a modern JavaScript (ES6 modules) frontend, it offers a responsive and dynamic interface designed to simplify file handling. As an alternative to solutions like FileGator, TinyFileManager, or ProjectSend, FileRise provides an easy-to-set-up experience ideal for document management, image galleries, firmware hosting, and other file-intensive applications.

---

## Features

- **Multiple File/Folder Uploads with Progress (Resumable.js Integration):**
  - Users can effortlessly upload multiple files and folders simultaneously by either selecting them through the file picker or dragging and dropping them directly into the interface.
  - **Chunked Uploads:** Files are uploaded in configurable chunks (default set as 3 MB) to efficiently handle large files.
  - **Pause, Resume, and Retry:** Uploads can be paused and resumed at any time, with support for retrying failed chunks.
  - **Real-Time Progress:** Each file shows an individual progress bar that displays percentage complete and upload speed.
  - **File & Folder Grouping:** When many files are dropped, files are automatically grouped into a scrollable wrapper, ensuring the interface remains clean.
  - **Secure Uploads:** All uploads integrate CSRF token validation and other security checks.

- **Built-in File Editing & Renaming:**
  - Text-based files (e.g., .txt, .html, .js) can be opened and edited in a modal window using CodeMirror for:
    - Syntax highlighting
    - Line numbering
    - Adjustable font sizes
  - Files can be renamed directly through the interface.
  - The renaming functionality now supports names with parentheses and checks for duplicate names, automatically generating a unique name (e.g., appending “ (1)”) when needed.
  - Folder-specific metadata is updated accordingly.
  - **Enhanced File Editing Check:** Files with a Content-Length of 0 KB are now allowed to be edited.

- **Built-in File Preview:**
  - Users can quickly preview images, videos, audio and PDFs directly in modal popups without leaving the page.
  - The preview modal supports inline display of images (with proper scaling) and videos with playback controls.
  - Navigation (prev/next) within image previews is supported for a seamless browsing experience.

- **Gallery (Grid) View:**
  - In addition to the traditional table view, users can toggle to a gallery view that arranges image thumbnails in a grid layout.
  - The gallery view offers multiple column options (e.g., 3, 4, or 5 columns) so that users can choose the layout that best fits their screen.
  - Action buttons (Download, Edit, Rename, Share) appear beneath each thumbnail for quick access.

- **Batch Operations (Delete/Copy/Move/Download/Extract Zip):**
  - **Delete Files:** Delete multiple files at once.
  - **Copy Files:** Copy selected files to another folder with a unique-naming feature to prevent overwrites.
  - **Move Files:** Move selected files to a different folder, automatically generating a unique filename if needed to avoid data loss.
  - **Download Files as ZIP:** Download selected files as a ZIP archive. Users can specify a custom name for the ZIP file via a modal dialog.
  - **Extract Zip:** When one or more ZIP files are selected, users can extract the archive(s) directly into the current folder.
  - **Drag & Drop (File Movement):** Easily move files by selecting them from the file list and dragging them onto your desired folder in the folder tree or breadcrumb. When you drop the files onto a folder, the system automatically moves them, updating your file organization in one seamless action.
  - **Enhanced Context Menu & Keyboard Shortcuts:**
    - **Right-Click Context Menu:**
      - A custom context menu appears on right-clicking within the file list.
      - For multiple selections, options include Delete Selected, Copy Selected, Move Selected, Download Zip, and (if applicable) Extract Zip.
      - When exactly one file is selected, additional options (Preview, Edit [if editable], Rename, and Tag File) are available.
    - **Keyboard Shortcut for Deletion:**
      - A global keydown listener detects Delete/Backspace key presses (when no input is focused) to trigger the delete operation.

- **File Tagging and Global Tag Management:**
  - **Context Menu Tagging:**
    - Single-file tagging: “Tag File” option in the right-click menu opens a modal to add a tag (with name and color) to the file.
    - Multi-file tagging: When multiple files are selected, a “Tag Selected” option opens a multi‑file tagging modal to apply the same tag to all selected files.
  - **Tagging Modals & Custom Dropdown:**
    - Dedicated modals provide an interface for adding and updating tags.
    - A custom dropdown in each modal displays available global tags with a colored preview and a remove icon.
  - **Global Tag Store:**
    - Tags are stored globally (persisted in a JSON file) for reuse across files and sessions.
    - New tags added to any file are automatically added to the global store.
    - Users can remove a global tag directly from the dropdown, which removes it from the available tag list for all files.
  - **Unified Search Filtering:**
    - The single search box now filters files based on both file names and tag names (case‑insensitive).

- **Folder Management:**
  - Organize files into folders and subfolders with the ability to create, rename, and delete folders.
  - A dynamic folder tree in the UI allows users to navigate directories easily, with real-time updates.
  - **Per-Folder Metadata Storage:** Each folder has its own metadata JSON file (e.g., `root_metadata.json`, `FolderName_metadata.json`), updated with operations like copy/move/rename.
  - **Intuitive Breadcrumb Navigation:** Clickable breadcrumbs enable users to quickly jump to any parent folder; supports drag & drop for moving files.
  - **Folder Manager Context Menu:**
    - Right-clicking on a folder brings up a custom context menu with options for creating, renaming, and deleting folders.
  - **Keyboard Shortcut for Folder Deletion:**
    - A global key listener (Delete/Backspace) triggers folder deletion with safeguards to prevent deletion of the root folder.

- **Sorting & Pagination:**
  - Files can be sorted by name, modified date, upload date, file size, or uploader.
  - Pagination controls let users navigate through files with selectable page sizes (10, 20, 50, or 100 items per page) and “Prev”/“Next” buttons.

- **Share Link Functionality:**
  - Generate shareable links for files with configurable expiration times (e.g., 30, 60, 120, 180, 240 minutes, and 1 day) and optional password protection.
  - Share links are stored in a JSON file with details including folder, file, expiration timestamp, and hashed password.
  - The share endpoint validates tokens, expiration, and password before serving files (or forcing downloads).
  - The share URL is configurable via environment variables or auto-detected from the server.

- **User Authentication & Management:**
  - Secure, session-based authentication protects the file manager.
  - Admin users can add or remove users through the interface.
  - Passwords are hashed using PHP’s `password_hash()` for security.
  - All state-changing endpoints include CSRF token validation.
  - Password change functionality is supported for all users.
  - Basic Auth is available for login.
  - **Persistent Login (Remember Me) with Encrypted Tokens:**
    - Users can remain logged in across sessions securely.
    - Persistent tokens are encrypted using AES‑256‑CBC before being stored in a JSON file.
    - On auto-login, tokens are decrypted on the server to re-establish user sessions without re-authentication.

- **Responsive, Dynamic & Persistent UI:**
  - The interface is mobile-friendly and adapts to various screen sizes by hiding non-critical columns on small devices.
  - Asynchronous updates (via Fetch API and XMLHttpRequest) keep the UI responsive without full page reloads.
  - Persistent settings (such as items per page, dark/light mode preference, folder tree state, and the last open folder) ensure a smooth, customized user experience.

- **Dark Mode/Light Mode:**
  - The application automatically adapts to the operating system’s theme preference by default, with a manual toggle available.
  - Dark mode provides a darker background with lighter text, and UI elements (including the CodeMirror editor) are adjusted for optimal readability in low-light conditions.
  - Light mode maintains a bright interface suitable for well-lit environments.

- **Server & Security Enhancements:**
  - Apache (or .htaccess) configurations disable directory indexing (e.g., using `Options -Indexes` in the uploads directory), preventing unauthorized file browsing.
  - Direct access to sensitive files (e.g., `users.txt`) is restricted via .htaccess rules.
  - A proxy download mechanism (via endpoints like `download.php` and `downloadZip.php`) routes all file downloads through PHP, ensuring session and CSRF token validation before file access.
  - Administrators are advised to deploy the app on a secure internal network or use the proxy download mechanism for public deployments.

- **Trash Management with Restore & Delete:**
  - **Trash Storage & Metadata:**
    - Deleted files are moved to a designated “Trash” folder rather than being immediately removed.
    - Metadata is stored in a JSON file (`trash.json`) that records:
      - Original folder and file name
      - Timestamp when the file was trashed
      - Uploader information (and optionally who deleted it)
      - Additional metadata (e.g., file type)
  - **Restore Functionality:**
    - Admins can view trashed files in a modal and restore individual or all files back to their original location (with conflict checks).
  - **Delete Functionality:**
    - Users can permanently delete trashed files via:
      - **Delete Selected:** Remove specific files from the Trash and update `trash.json`.
      - **Delete All:** Permanently remove every file from the Trash after confirmation.
  - **Auto-Purge Mechanism:**
    - The system automatically purges files in the Trash older than three days, managing storage and preventing accumulation of outdated files.
  - **Trash UI:**
    - The trash modal displays file name, uploader/deleter, and trashed date/time.
    - Material icons with tooltips represent restore and delete actions.

- **Drag & Drop Cards with Dedicated Drop Zones:**
  - **Sidebar Drop Zone:**  
    - Cards (e.g., upload or folder management) can be dragged into a dedicated sidebar drop zone for quick access to frequently used operations.
    - The sidebar drop zone expands dynamically to accept drops anywhere within its visual area.
  - **Top Bar Drop Zone:**  
    - A top drop zone is available for reordering or managing cards quickly.
    - Dragging a card to the top drop zone provides immediate visual feedback, ensuring a fluid and customizable workflow.
  - **Header Drop Zone with State Preservation:**
    - Cards can be dragged into the header drop zone, where they are represented by a compact material icon.
    - **State Preservation:** Instead of removing the card from the DOM, the original card is moved into a hidden container. This ensures that dynamic features (such as the folder tree in the Folder Management card or file selection in the Upload card) remain fully initialized and retain their state on page refresh.
    - **Modal Display:** When the user interacts (via hover or click) with the header icon, the card is temporarily moved into a modal overlay for full interaction. When the modal is closed, the card is returned to the hidden container, keeping its state persistent.
  - **Seamless Interaction:**  
    - Both drop zones support smooth drag-and-drop interactions with animations and pointer event adjustments, ensuring reliable card placement regardless of screen position.

## 🔒 Admin Panel, TOTP & OpenID Connect (OIDC) Integration

- **Flexible Authentication:**
  - Supports multiple authentication methods including Form-based Login, Basic Auth, OpenID Connect (OIDC), and TOTP-based Two-Factor Authentication.
  - Ensures continuous secure access by allowing administrators to disable only two of the available login options at any time.

- **Secure OIDC Authentication:**
  - Seamlessly integrates with OIDC providers (e.g., Keycloak, Okta).
  - Provides admin-configurable OIDC settings—including Provider URL, Client ID, Client Secret, and Redirect URI.
  - Stores all sensitive configurations in an encrypted JSON file.

- **TOTP Two-Factor Authentication:**
  - Enhances security by integrating Time-based One-Time Password (TOTP) functionality.
  - The new User Panel automatically displays the TOTP setup modal when users enable TOTP, presenting a QR code for easy configuration in authenticator apps.
  - Administrators can customize a global OTPAuth URL template for consistent TOTP provisioning across accounts.

- **Dynamic Admin Panel:**
  - Features an intuitive interface with Material Icons for quick recognition and access.
  - Allows administrators to manage authentication settings, user management, and login methods in real time.
  - Includes real-time validation that prevents the accidental disabling of all authentication methods simultaneously.
  - **User Permissions Options:**
    - *Folder Only* gives user their own root folder.
    - *Read Only* makes it so the user can only read the files.
    - *Disable Upload* prevents file uploads.

---

## Screenshots

**Admin Panel:**
![Light Admin Panel](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/light-admin-panel.png)

**Light mode:**
![Dark SideBar](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-sidebar.png)

**Light mode default:**
![Default Layout](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/light-topbar.png)

**Dark editor:**
![dark-editor](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-editor.png)

**Light preview**
![dark-preview](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/light-preview.png)

**Restore or Delete Trash:**
![restore-delete](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/light-trash.png)

**Dark TOTP Setup:**
![Login](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-totp-setup.png)

**Gallery view:**
![Login](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-gallery.png)

  **iphone screenshots:**  
<p align="center">
  <img src="https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-iphone.png" width="45%">
  <img src="https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/light-preview-iphone.png" width="45%">
</p>

---

## Installation & Setup

### Manual Installation

1. **Clone or Download the Repository:**
   - **Clone:**  

     ```bash
     git clone https://github.com/error311/FileRise.git
     ```

   - **Download:**  
     Download the latest release from the GitHub releases page and extract it into your desired directory.

2. **Deploy to Your Web Server:**
   - Place the project files in your Apache web directory (e.g., `/var/www/html`).
   - Ensure PHP 8.1+ is installed along with the required extensions (`php-json`, `php-curl`, `php-zip`, etc.).

3. **Install Composer Dependencies (Required for OIDC Support):**
   - Install Composer if you haven't already ([Installation Guide](https://getcomposer.org/download/)).
   - Navigate to the project directory and run:

     ```bash
     composer install
     ```

   - This step will install necessary dependencies like `jumbojett/openid-connect-php` and `phpseclib/phpseclib`.

4. **Directory Setup & Permissions:**
   - Create the following directories if they do not exist, and set appropriate permissions:
     - `uploads/` – for file storage.
     - `users/` – to store `users.txt` (user authentication data).
     - `metadata/` – for storing `file_metadata.json` and other metadata.
   - Example commands:

     ```bash
     mkdir -p /var/www/uploads /var/www/users /var/www/metadata
     chmod -R 775 /var/www/uploads /var/www/users /var/www/metadata
     ```

5. **Configure Apache:**
   - Ensure that directory indexing is disabled (using `Options -Indexes` in your `.htaccess` or Apache configuration).
   - Make sure the Apache configuration allows URL rewriting if needed.

6. **Configuration File:**
   - Open `config.php` and adjust the following constants as necessary:
     - `BASE_URL`: Set this to your web app’s base URL.
     - `UPLOAD_DIR`: Adjust the directory path for uploads.
     - `TIMEZONE`: Set to your preferred timezone.
     - `TOTAL_UPLOAD_SIZE`: Ensure it matches PHP’s `upload_max_filesize` and `post_max_size` settings in your `php.ini`.

### Initial Setup Instructions

- **First Launch Admin Setup:**  
  On first launch, if no users exist, the application will enter a setup mode. You will be prompted to create an admin user. This is handled automatically by the application (e.g., via a “Create Admin” form).  
  **Note:** No default credentials are provided. You must create the first admin account to log in and manage additional users.

---

## Docker Usage

For users who prefer containerization, a Docker image is available.

**Note:** The Docker image already includes Composer dependencies pre-installed (including OIDC support).

### Quickstart

1. **Pull the Docker Image:**

   ```bash
   docker pull error311/filerise-docker:latest
   ```

   macos M series:

   ```bash
   docker pull --platform linux/x86_64 error311/filerise-docker:latest
   ```

2. **Run the Container:**

   ```bash
   docker run -d \
   -p 80:80 \
   -e TIMEZONE="America/New_York" \
   -e TOTAL_UPLOAD_SIZE="5G" \
   -e SECURE="false" \
   -v /path/to/your/uploads:/var/www/uploads \
   -v /path/to/your/users:/var/www/users \
   -v /path/to/your/metadata:/var/www/metadata \
   --name FileRise \
   error311/filerise-docker:latest
   ```

3. **Using Docker Compose:**

   Create a docker-compose.yml file with the following content:

   ```yaml
   version: "3.8"
   services:
     web:
       image: error311/filerise-docker:latest
       ports:
         - "80:80"
       environment:
         TIMEZONE: "America/New_York"
         TOTAL_UPLOAD_SIZE: "5G"
         SECURE: "false"
         PERSISTENT_TOKENS_KEY: "default_please_change_this_key"
       volumes:
         - /path/to/your/uploads:/var/www/uploads
         - /path/to/your/users:/var/www/users
         - /path/to/your/metadata:/var/www/metadata
   ```

**Then start the container with:**

   ```bash
   docker-compose up -d
   ```

---

## Configuration Guidance

The `config.php` file contains several key constants that may need adjustment for your deployment:

- **BASE_URL:**  
  Set to the URL where your application is hosted (e.g., `http://yourdomain.com/uploads/`).

- **UPLOAD_DIR, USERS_DIR, META_DIR:**  
  Define the directories for uploads, user data, and metadata. Adjust these to match your server environment or Docker volume mounts.

- **TIMEZONE & DATE_TIME_FORMAT:**  
  Set according to your regional settings.

- **TOTAL_UPLOAD_SIZE:**  
  Defines the maximum upload size (default is `5G`). Ensure that PHP’s `upload_max_filesize` and `post_max_size` in your `php.ini` are consistent with this setting. The startup script (`start.sh`) updates PHP limits at runtime based on this value.

- **Environment Variables (Docker):**  
  The Docker image supports overriding configuration via environment variables. For example, you can set `SECURE`, `SHARE_URL`, `PERSISTENT_TOKENS_KEY` and port settings via the container’s environment.

---

## Additional Information

- **Security:**  
  All state-changing endpoints use CSRF token validation. Ensure that sessions and tokens are correctly configured as per your deployment environment.

- **Permissions:**  
  Both manual and Docker installations include steps to ensure that file and directory permissions are set correctly for the web server to read and write as needed.

- **Logging & Troubleshooting:**  
  Check Apache logs (located in `/var/log/apache2/`) for troubleshooting any issues during deployment or operation.

---

## Contributing

We welcome contributions! Please check out our [Contributing Guidelines](CONTRIBUTING.md) before getting started.
