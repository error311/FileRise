Here are list of changes made to original code base:


<img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/main-screen.png" alt="main screen">

# Multi File Upload & Edit

This project is a lightweight, secure web application for uploading, editing, and managing files. It’s built with Apache, PHP, and modern front-end JavaScript, and it features a responsive interface with dynamic updates.

---

## Functionality & Features

- **Multi-file Upload:**  
  Users can select and upload multiple files at once. Each file’s upload is tracked individually with a progress bar showing percentage complete and upload speed (B/s, KB/s, or MB/s). If an image is selected, a small 32×32 pixel thumbnail preview is displayed; otherwise, a default file icon is shown.
  
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/multi-upload.png" alt="multi upload" width="600">

- **File Editing:**  
  Built-in editing functionality for text-based files allows quick modifications directly within the browser. Files open in a modal window with a consistent, rounded design. Edit window can be resized to allow for easier editting.
  
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/edit-larger-window.png" alt="edit larger window" width="600">
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/edit-small-window.png" alt="edit smaller window" width="600">

- **Batch Deleting:**  
  Users can select multiple files and delete them in one action, streamlining file management.

- **Sorting & Filtering:**  
  Files can be sorted by attributes such as name, date modified, upload date, size, or uploader, making it easier to navigate large file sets.

- **User Management:**  
  Secure, session-based authentication is implemented along with admin-only controls for adding and removing users. Passwords are hashed for security.
   
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/create-user.png" alt="new user" width="600">
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/remove-user.png" alt="remove user" width="600">

- **Dynamic UI Updates:**  
  The application uses asynchronous JavaScript (via the Fetch API and XMLHttpRequest) to update the file list and upload progress in real time without requiring full page reloads.

- **Progress Feedback:**  
  During uploads, each file shows a progress bar next to its name, complete with upload percentage and speed. Once all files have been uploaded, the progress list automatically clears after a short delay.
  
  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/progress-bar.png" alt="progress bar" width="600"> 

---

## Security

- **Password Hashing:**  
  PHP's `password_hash()` and `password_verify()` functions are used to securely store and check user credentials.

- **Session-based Authentication:**  
  User state is managed using PHP sessions, with proper access control for admin-specific actions.

- **Safe File Operations:**  
  Uploaded file metadata (including uploader and upload timestamp) is stored in a JSON file, minimizing exposure of sensitive data.

---

## User Experience & Interface

- **Responsive Design:**  
  The interface adapts seamlessly to different screen sizes, ensuring usability on desktops, tablets, and mobile devices.

- **Modern and Dynamic:**  
  The application uses dynamic UI updates (via the Fetch API and XMLHttpRequest) to show real-time progress for each file upload, including visual feedback with thumbnail previews and progress bars.

- **Clean and Intuitive Layout:**  
  A structured header with a logo, centered title, and action buttons (Logout, Add User, Remove User) provides an intuitive navigation experience.

---

## Extensibility & Maintainability

- **Modular Code Structure:**  
  The codebase is organized into separate files (e.g., `auth.js`, `upload.js`, `displayFileList.js`), making it easy to manage and extend.
  
- **Removal of Legacy Files:**  
  Files such as `checkUploadLimit.js`, `checkUploadLimit.php`, and `getUploadSize.php` are no longer used and have been removed to streamline the project.

- **Customization Options:**  
  The project is flexible and can be adapted to support additional file types, enhanced previews, or integration with other systems.

---

## Deployment & Real-world Use

- **Reverse Proxy Compatibility:**  
  With proper configuration, the application can be deployed behind a reverse proxy, providing an additional layer of security.

- **Practical Applications:**  
  This multi-file uploader with editing and user management is ideal for scenarios involving document management, image galleries, firmware updates, and more.

---
- **Login Page**

  <img src="https://raw.githubusercontent.com/error311/multi-file-upload-editor/refs/heads/master/resources/login-page.png" alt="login page" width="600">

      





fork of:
https://github.com/sensboston/uploader


# File Uploader

A simple file uploader web app that allows authenticated users to upload, list, and delete files. 
The application uses PHP, running on Apache2, Ubuntu (but definitely should work everywhere).

## Prerequisites

- Apache2, configured, up and running
- PHP 8.1 or higher
- Required PHP extensions: `php-json`, `php-curl`

...........

