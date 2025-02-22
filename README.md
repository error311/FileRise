Here are list of changes made to original code base:

# Functionality & Features

- **Multi-file Upload:**  
  Allows users to upload multiple files at once, which improves efficiency and user experience.

- **File Editing:**  
  Built-in editing functionality for text-based files enables quick modifications without leaving the interface.

- **Batch Deleting:**  
  The ability to select multiple files and delete them in one action streamlines file management.

- **Sorting & Filtering:**  
  Users can sort files by various attributes (name, date modified, uploaded date, size, uploader), making navigation easier.

- **User Management:**  
  Incorporates secure authentication (with hashed passwords) and admin-only controls for adding new users.

# Security

- **Password Hashing:**  
  Using PHP's `password_hash()` and `password_verify()` ensures that user credentials are securely stored and verified.

- **Session-based Authentication:**  
  Leveraging PHP sessions to maintain secure user state across the application.

- **Access Control:**  
  Admins have extra privileges (such as creating new users), which is properly enforced via session checks and restricted endpoints.

- **Safe File Operations:**  
  File metadata (including uploader info) is stored securely in JSON, helping avoid direct exposure of sensitive details.

# User Experience & Interface

- **Responsive Design:**  
  The layout adapts to different screen sizes, ensuring a good experience on both desktop and mobile devices.

- **Dynamic UI Updates:**  
  Uses modern JavaScript (Fetch API, asynchronous calls) to update the file list and authentication state without full page reloads.

- **Clear Feedback:**  
  Users receive immediate alerts and visual feedback for actions like login, file upload, and deletion.

# Extensibility & Maintainability

- **Modular Code Structure:**  
  The project is divided into distinct files (`auth.js`, `upload.js`, `displayFileList.js`, etc.), which makes it easier to manage and extend.

- **Customization Options:**  
  The codebase is flexible enough to allow the addition of more file types, new features (e.g., versioning, file previews), or integration with other systems.

- **Good Practices Demonstrated:**  
  The project illustrates the use of best practices in PHP (such as session management and secure password handling) and modern front-end JavaScript, making it a valuable learning resource.

# Deployment & Real-world Use

- **Reverse Proxy Compatibility:**  
  With proper server configuration and security measures, this project can be deployed behind a reverse proxy, offering an extra layer of security.

- **Real-world Scenario:**  
  A multi-file uploader with editing and user management is useful in many environments—whether for managing firmware, documents, images, or any files—making this a practical solution.



![](https://raw.githubusercontent.com/sensboston/uploader/ba3162b4061587055748f2a2392181b122402cd2/resources./main_screen.png =250x250)
      



Original readme:
# File Uploader

A simple file uploader web app that allows authenticated users to upload, list, and delete files. 
The application uses PHP, running on Apache2, Ubuntu (but definitely should work everywhere).

## Prerequisites

- Apache2, configured, up and running
- PHP 8.1 or higher
- Required PHP extensions: `php-json`, `php-curl`

Hint:
```
sudo apt update
sudo apt install apache2
sudo apt install php libapache2-mod-php
```


![screenshot](https://github.com/sensboston/uploader/assets/1036158/5428672d-7dcc-4d7a-a96f-dfe578618c75)

