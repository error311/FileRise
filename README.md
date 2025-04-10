# FileRise

**Elevate your File Management** – A modern, self-hosted web file manager.
Upload, organize, and share files through a sleek web interface. **FileRise** is lightweight yet powerful: think of it as your personal cloud drive that you control. With drag-and-drop uploads, in-browser editing, secure user logins (with SSO and 2FA support), and one-click sharing, **FileRise** makes file management on your server a breeze.

**4/3/2025 Video demo:**

<https://github.com/user-attachments/assets/221f6a53-85f5-48d4-9abe-89445e0af90e>

**Dark mode:**
![Dark Header](https://raw.githubusercontent.com/error311/FileRise/refs/heads/master/resources/dark-header.png)

---

## Features at a Glance or [Full Features Wiki](https://github.com/error311/FileRise/wiki/Features)

- 🚀 **Easy File Uploads:** Upload multiple files and folders via drag & drop or file picker. Supports large files with pause/resumable chunked uploads and shows real-time progress for each file. No more failed transfers – FileRise will pick up where it left off if your connection drops.

- 🗂️ **File Management:** Full set of file/folder operations – move or copy files (via intuitive drag-drop or dialogs), rename items, and delete in batches. You can even download selected files as a ZIP archive or extract uploaded ZIP files server-side. Organize content with an interactive folder tree and breadcrumb navigation for quick jumps.

- 🗃️ **Folder Sharing & File Sharing:** Easily share entire folders via secure, expiring public links. Folder shares can be password-protected, and shared folders support file uploads from outside users with a separate, secure upload mechanism. Folder listings are paginated (10 items per page) with navigation controls, and file sizes are displayed in MB for clarity. Share files with others using one-time or expiring public links (with password protection if desired) – convenient for sending individual files without exposing the whole app.

- 📝 **Built-in Editor & Preview:** View images, videos, audio, and PDFs inline with a preview modal – no need to download just to see them. Edit text/code files right in your browser with a CodeMirror-based editor featuring syntax highlighting and line numbers. Great for config files or notes – tweak and save changes without leaving FileRise.

- 🏷️ **Tags & Search:** Categorize your files with color-coded tags (labels) and later find them easily. The global search bar filters by filename or tag, making it simple to locate that “important” document in seconds. Tag management is built-in – create, reuse, or remove tags as needed.

- 🔒 **User Authentication & User Permissions:** Secure your portal with username/password login. Supports multiple users – create user accounts (admin UI provided) for family or team members. User permissions such as User “Folder Only” feature assigns each user a dedicated folder within the root directory, named after their username, restricting them from viewing or modifying other directories. User Read Only and Disable Upload are additional permissions. FileRise also integrates with Single Sign-On (OIDC) providers (e.g., OAuth2/OIDC for Google/Authentik/Keycloak) and offers optional TOTP two-factor auth for extra security.

- 🎨 **Responsive UI (Dark/Light Mode):** FileRise is mobile-friendly out of the box – manage files from your phone or tablet with a responsive layout. Choose between Dark mode or Light theme, or let it follow your system preference. The interface remembers your preferences (layout, items per page, last visited folder, etc.) for a personalized experience each time.

- 🌐 **Internationalization & Localization:** FileRise supports multiple languages via an integrated i18n system. Users can switch languages through a user panel dropdown, and their choice is saved in local storage for a consistent experience across sessions. Currently available in English, Spanish, and French—please report any translation issues you encounter.

- 🗑️ **Trash & File Recovery:** Mistakenly deleted files? No worries – deleted items go to the Trash instead of immediate removal. Admins can restore files from Trash or empty it to free space. FileRise auto-purges old trash entries (default 3 days) to keep your storage tidy.

- ⚙️ **Lightweight & Self-Contained:** FileRise runs on PHP 8.1+ with no external database required – data is stored in files (users, metadata) for simplicity. It’s a single-folder web app you can drop into any Apache/PHP server or run as a container. Docker & Unraid ready: use our pre-built image for a hassle-free setup. Memory and CPU footprint is minimal, yet the app scales to thousands of files with pagination and sorting features.

(For a full list of features and detailed changelogs, see the [Wiki](https://github.com/error311/FileRise/wiki), [changelog](https://github.com/error311/FileRise/blob/master/CHANGELOG.md) or the [releases](https://github.com/error311/FileRise/releases) pages.)

---

## Live Demo

Curious about the UI? **Check out the live demo:** <https://demo.filerise.net> (login with username “demo” and password “demo”). *The demo is read-only for security*. Explore the interface, switch themes, preview files, and see FileRise in action!

---

## Installation & Setup

You can deploy FileRise either by running the **Docker container** (quickest way) or by a **manual installation** on a PHP web server. Both methods are outlined below.

### 1. Running with Docker (Recommended)

If you have Docker installed, you can get FileRise up and running in minutes:

- **Pull the image from Docker Hub:**

``` bash
docker pull error311/filerise-docker:latest
```

*(For Apple Silicon (M1/M2) users, use --platform linux/amd64 tag until multi-arch support is added.)*  

- **Run a container:**

``` bash
docker run -d \
  -p 8080:80 \
  -e TIMEZONE="America/New_York" \
  -e TOTAL_UPLOAD_SIZE="5G" \
  -e SECURE="false" \
  -v ~/filerise/uploads:/var/www/uploads \
  -v ~/filerise/users:/var/www/users \
  -v ~/filerise/metadata:/var/www/metadata \
  --name filerise \
  error311/filerise-docker:latest
  ```

  This will start FileRise on port 8080. Visit `http://your-server-ip:8080` to access it. Environment variables shown above are optional – for instance, set `SECURE="true"` to enforce HTTPS (assuming you have SSL at proxy level) and adjust `TIMEZONE` as needed. The volume mounts ensure your files and user data persist outside the container.

- **Using Docker Compose:**
Alternatively, use **docker-compose**. Save the snippet below as docker-compose.yml and run `docker-compose up -d`:

``` yaml
version: '3'
services:
  filerise:
    image: error311/filerise-docker:latest
    ports:
      - "8080:80"
    environment:
      TIMEZONE: "UTC"
      TOTAL_UPLOAD_SIZE: "10G"
      SECURE: "false"
      PERSISTENT_TOKENS_KEY: "please_change_this_@@"
    volumes:
      - ./uploads:/var/www/uploads
      - ./users:/var/www/users
      - ./metadata:/var/www/metadata
```

FileRise will be accessible at `http://localhost:8080` (or your server’s IP). The above example also sets a custom `PERSISTENT_TOKENS_KEY` (used to encrypt “remember me” tokens) – be sure to change it to a random string for security.

**First-time Setup:** On first launch, FileRise will detect no users and prompt you to create an **Admin account**. Choose your admin username & password, and you’re in! You can then head to the **User Management** section to add additional users if needed.

### 2. Manual Installation (PHP/Apache)

If you prefer to run FileRise on a traditional web server (LAMP stack or similar):

- **Requirements:** PHP 8.1 or higher, Apache (with mod_php) or another web server configured for PHP. Ensure PHP extensions json, curl, and zip are enabled. No database needed.
- **Download Files:** Clone this repo or download the [latest release archive](https://github.com/error311/FileRise/releases).

``` bash
git clone https://github.com/error311/FileRise.git  
```

Place the files into your web server’s directory (e.g., `/var/www/html/filerise`). It can be in a subfolder (just adjust the `BASE_URL` in config as below).

- **Composer Dependencies:** If you plan to use OIDC (SSO login), install Composer and run `composer install` in the FileRise directory. (This pulls in a couple of PHP libraries like jumbojett/openid-connect for OAuth support.) If you skip this, FileRise will still work, but OIDC login won’t be available.

- **Folder Permissions:** Ensure the server can write to the following directories (create them if they don’t exist):

``` bash
mkdir -p uploads users metadata
chown -R www-data:www-data uploads users metadata   # www-data is Apache user; use appropriate user
chmod -R 775 uploads users metadata
```

The uploads/ folder is where files go, users/ stores the user credentials file, and metadata/ holds metadata like tags and share links.

- **Configuration:** Open the `config.php` file in a text editor. You may want to adjust:

  - `BASE_URL` – the URL where you will access FileRise (e.g., `“https://files.mydomain.com/”`). This is used for generating share links.
  
  - `TIMEZONE` and `DATE_TIME_FORMAT` – match your locale (for correct timestamps).
  
  - `TOTAL_UPLOAD_SIZE` – max aggregate upload size (default 5G). Also adjust PHP’s `upload_max_filesize` and `post_max_size` to at least this value (the Docker start script auto-adjusts PHP limits).
  
  - `PERSISTENT_TOKENS_KEY` – set a unique secret if you use “Remember Me” logins, to encrypt the tokens.
  
  - Other settings like `UPLOAD_DIR`, `USERS_FILE` etc. generally don’t need changes unless you move those folders. Defaults are set for the directories mentioned above.

- **Web Server Config:** If using Apache, ensure `.htaccess` files are allowed or manually add the rules from `.htaccess` to your Apache config – these disable directory listings and prevent access to certain files. For Nginx or others, you’ll need to replicate those protections (see Wiki: [Nginx Setup for examples](https://github.com/error311/FileRise/wiki/Nginx-Setup)). Also enable mod_rewrite if not already, as FileRise may use pretty URLs for share links.

Now navigate to the FileRise URL in your browser. On first load, you’ll be prompted to create the Admin user (same as Docker setup). After that, the application is ready to use!

---

## FAQ / Troubleshooting

- **“Upload failed” or large files not uploading:** Make sure `TOTAL_UPLOAD_SIZE` in config and PHP’s `post_max_size` / `upload_max_filesize` are all set high enough. For extremely large files, you might also need to increase max_execution_time in PHP or rely on the resumable upload feature in smaller chunks.

- **How to enable HTTPS?** FileRise itself doesn’t handle TLS. Run it behind a reverse proxy like Nginx, Caddy, or Apache with SSL, or use Docker with a companion like nginx-proxy or Caddy. Set `SECURE="true"` env var in Docker so FileRise knows to generate https links.

- **Changing Admin or resetting password:** Admin can change any user’s password via the UI (User Management section). If you lose admin access, you can edit the `users/users.txt` file on the server – passwords are hashed (bcrypt), but you can delete the admin line and then restart the app to trigger the setup flow again.

- **Where are my files stored?** In the `uploads/` directory (or the path you set for `UPLOAD_DIR`). Within it, files are organized in the folder structure you see in the app. Deleted files move to `uploads/trash/`. Tag information is in `metadata/file_metadata`.json and trash metadata in `metadata/trash.json`, etc. Regular backups of these folders is recommended if the data is important.

- **Updating FileRise:** If using Docker, pull the new image and recreate the container. For manual installs, download the latest release and replace the files (preserve your `config.php` and the uploads/users/metadata folders). Clear your browser cache if you have issues after an update (in case CSS/JS changed).

For more Q&A or to ask for help, please check the Discussions or open an issue.

---

## Contributing

Contributions are welcome! If you have ideas for new features or have found a bug, feel free to open an issue. Check out the [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. You can also join the conversation in GitHub Discussions or on Reddit (see links below) to share feedback and suggestions.

Areas where you can help: translations, bug fixes, UI improvements, or building integration with other services. If you like FileRise, giving the project a ⭐ star ⭐ on GitHub is also a much-appreciated contribution!

---

## Community and Support

- **Reddit:** [r/selfhosted: FileRise Discussion](https://www.reddit.com/r/selfhosted/comments/1jl01pi/introducing_filerise_a_modern_selfhosted_file/) – (Announcement and user feedback thread).
- **Unraid Forums:** [FileRise Support Thread](https://forums.unraid.net/topic/187337-support-filerise/) – for Unraid-specific support or issues.
- **GitHub Discussions:** Use the Q&A category for any setup questions, and the Ideas category to suggest enhancements.

---

## License

This project is open-source under the MIT License. That means you’re free to use, modify, and distribute **FileRise**, with attribution. We hope you find it useful and contribute back!
