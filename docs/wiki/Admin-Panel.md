# Admin Panel

The Admin Panel is where you manage users, folder access, authentication, integrations, and system settings. Only admin accounts can open it.

## Access

- Open the **Admin Panel** from the top-right menu in the FileRise UI.
- Some controls are locked when an environment variable or config.php constant is set.
- Pro-only sections show a "Pro" badge when the bundle is not active.
- Use the Search button in the Admin Panel header to reveal the settings search box, then filter sections and settings.

## Sections and options

### Users & Access

- **Manage users**: add users, remove users, reset passwords.
- **Account-level flags** (apply across all folders):
  - **Read-only**: view/download only.
  - **Disable upload**: blocks uploads.
  - **Can share**: allow share links (still subject to ACLs).
  - **Bypass ownership**: relax owner-only restrictions for the user.
- **Folder Access**: per-folder ACLs (view, view own, create file, upload, edit, rename, copy, move, delete, extract, share, manage).
- **Pro**: User Groups and Client Portals are managed here when Pro is active.

### Appearance & UI

- **Header title** and **default language**.
- **Pro branding**: logo upload, header colors, footer text.
- **Display tuning**: hover preview size limits and file list summary depth.
- **FFmpeg path**: optional override (locked by `FR_FFMPEG_PATH` if set).

### Auth & WebDAV (OIDC/TOTP)

- Enable/disable **Login form**, **HTTP Basic**, and **OIDC** login.
- **Proxy-only login**: trust a reverse-proxy auth header and disable built-in logins.
- **Auth header name** for proxy-only mode.
- **WebDAV** enable/disable toggle.
- **OIDC settings**: provider URL, redirect URI, client ID/secret (replace to update), public client toggle, debug logging, allow-demote, global OTPAuth URL, and a test button.

### Uploads & Antivirus

- **Resumable chunk size (MB)**: applies to file picker uploads (Resumable.js). Lower it if a reverse proxy limits request size (for example, Cloudflare Tunnels 100 MB).
- **ClamAV** upload scanning toggle (locked by `VIRUS_SCAN_ENABLED` when set).
- **Run self-test** button.
- **Pro**: Virus detection log (read-only preview in Core).

### Sharing & Links

- **Shared max upload size** (bytes) for share uploads.
- View and delete active file and folder share links.

### Network & Proxy

- **Published URL** override for share links and redirects (locked by `FR_PUBLISHED_URL` when set).
- Effective **base path** and **share URL** display (read-only).

### Encryption at rest

- Status, master key source, and key file controls.
- Generate or clear the key file (blocked when locked by env).
- See [Encryption at Rest](https://github.com/error311/FileRise/wiki/Encryption-at-Rest) for details.

### ONLYOFFICE

- Enable ONLYOFFICE integration.
- Document Server origin and JWT secret (replace to update).
- Built-in CSP helper and connection tests.
- Locked when ONLYOFFICE_* constants are set in `config.php`.

### Storage / Disk Usage

- Storage summary and disk-usage insights (scan-backed).

### Sources

- Enable Sources, add/edit/test connections, set source read-only, and optionally bypass trash (permanent delete).
- See [Pro Sources](https://github.com/error311/FileRise/wiki/Pro-Sources) for details.

### Pro Features

- **Search Everywhere**: enable/disable and default limit (env-locked when set).
- **Audit logs**: enable, level, and size caps.

### FileRise Pro

- Pro license status, plan info, bundle install/update, and instance ID.

### Thanks / Sponsor / Donations

- Sponsorship links and support info.

## Notes

- Changes apply immediately after **Save**; some UI changes (header/branding) update instantly.
- Source read-only and account-level flags still override per-folder ACLs.
