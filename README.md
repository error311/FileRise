# Multi File Upload & Edit

![Main Screen](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/main-screen.png)

changelogs available here: <https://github.com/error311/multi-file-upload-editor-docker/>

This project is a lightweight, secure web application for uploading, editing, and managing files. It’s built with Apache, PHP, and modern front-end JavaScript, and it features a responsive interface with dynamic updates.

---

## Functionality & Featuraes

- **Multi-file Upload:**  
  - Users can select and upload multiple files at once.
  - Each file’s upload is tracked individually with a progress bar showing percentage and upload speed (B/s, KB/s, or MB/s).
  - For image files, a 32×32 pixel thumbnail preview is shown; for other files, a default file icon is displayed.
  
  ![Multi Upload](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/multi-upload.png)

- **File Editing & Renaming:**  
  - Text-based files can be edited directly in a modal window.
  - Files open in a modal that can be resized for ease of editing.
  - **Rename functionality:** Every file now has a “Rename” button in the Actions column (in addition to the “Edit” button for editable files) so that any file can be renamed without editing.
  
  ![Edit Larger Window](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/edit-larger-window.png)  
  ![Edit Smaller Window](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/edit-small-window.png)

- **Batch Deleting, Copying & Moving:**  
  - Users can select multiple files and perform batch actions like delete, copy, or move.
  - The action buttons remain visible (if files exist) and only become active when one or more files are selected.
  - The folder dropdown for copy/move actions is hidden when no files are present.

- **Sorting & Pagination:**  
  - Files can be sorted by attributes such as name, date modified, upload date, size, or uploader.
  - A custom date parser converts dates from the "MM/DD/YY hh:mma" format (e.g. "03/07/25 01:01AM") to timestamps for reliable sorting.
  - Pagination is implemented so users can view 10, 20, 50, or 100 items per page with navigation controls ("Prev"/"Next" and page numbers).

- **User Management & Authentication:**  
  - Secure, session-based authentication is implemented.
  - Admin-only controls allow for adding and removing users.
  - Passwords are hashed using PHP’s `password_hash()` function.
  
  ![Create User](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/create-user.png)  
  ![Remove User](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/remove-user.png)

- **Dynamic & Responsive UI:**  
  - Real-time UI updates (via Fetch API and XMLHttpRequest) refresh the file list, upload progress, and folder list without a full page reload.
  - On smaller screens, less critical columns (Date Modified, Upload Date, File Size, Uploader) are hidden for a cleaner mobile experience.
  - A centered header with a logo and navigation buttons provides an intuitive interface.

- **Progress Feedback:**  
  - During file uploads, a progress list displays the status for each file (for the first 10 files) along with an indication if additional files are being uploaded.
  - The file list refreshes immediately after uploads finish, while the progress list remains visible for a set period for user confirmation.

---

## Security

- **Password Hashing:**  
  - Uses PHP’s `password_hash()` and `password_verify()` functions to securely store and check user credentials.
- **Session-based Authentication:**  
  - User state is managed via PHP sessions.
- **Safe File Operations:**  
  - Uploaded file metadata (uploader, upload timestamp) is stored securely in a JSON file.
- **No-caching:**  
  - Appropriate headers are set (or timestamps appended) to ensure that file and folder lists are always up-to-date.

---

## User Experience & Interface

- **Responsive Design:**  
  - The interface adapts to different screen sizes using media queries.
  - Critical information (filename and actions) remains visible on small screens, while secondary columns are hidden.
- **Modern Look:**  
  - A dynamic UI with asynchronous updates ensures real-time progress display and a modern user experience.
- **Intuitive Navigation:**  
  - A structured header with a centered title and clearly laid out action buttons makes navigation easy.

---

## Extensibility & Maintainability

- **Modular Code Structure:**  
  - The code is organized into separate ES6 modules:
    - `networkUtils.js` – HTTP request handling.
    - `domUtils.js` – DOM manipulation and UI update functions.
    - `fileManager.js` – File operations, rendering, sorting, pagination, editing, and renaming.
    - `folderManager.js` – Folder operations (loading, renaming, deleting).
    - `upload.js` – File upload handling and progress display.
    - `auth.js` – User authentication and management.
- **Improved Sorting:**  
  - A custom date parser converts date strings to timestamps for reliable sorting of date columns.
- **UI Updates:**  
  - Real-time updates and event reattachment ensure the file list and action buttons are always current.
- **Responsive & Accessible:**  
  - Media queries and dynamic button states improve usability across devices.
- **Clean & Extendable:**  
  - Legacy files have been removed and the code is structured for easy future enhancements.

---

## Deployment & Real-world Use

- **Reverse Proxy Compatibility:**  
  - Can be deployed behind a reverse proxy with proper configuration.
- **Practical Applications:**  
  - Ideal for document management, image galleries, firmware updates, and more.
- **Security & Scalability:**  
  - Session-based authentication, secure file operations, and modular code design ensure the application is secure and scalable.

---

## Changelog

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

- **Login Page**
  ![Login](https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/login-page.png)  

based off of:
<https://github.com/sensboston/uploader>

## Prerequisites

- Apache2, configured, up and running
- PHP 8.1 or higher
- Required PHP extensions: `php-json`, `php-curl`

...........
