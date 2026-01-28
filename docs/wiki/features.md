# Features

FileRise is a self-hosted web file manager built for speed, strong ACLs, and zero-database simplicity. This page is a full feature inventory; for setup and deep dives, see the wiki index.

## Core features (full list)

### Uploads and transfers

- Multi-file and folder uploads via drag-and-drop or file picker
- Chunked, resumable uploads with pause, resume, and retry
- Per-file progress and upload queue
- CSRF-protected upload endpoints

### File operations

- Create files, upload files, rename, copy, move, and delete
- Batch operations (delete, copy, move, download as zip, extract archives)
- Drag-and-drop moves from the file list to the tree/breadcrumb
- Collision-safe naming for copies/moves

### Previews and editors

- Image, video, audio, and PDF previews in the browser
- Gallery/grid view for media
- Hover previews with quick metadata (desktop)
- Inline text/code editor (CodeMirror)

### Organization and navigation

- Folder tree with breadcrumb navigation
- Dual-pane mode for fast workflows
- Sorting and pagination
- Keyboard shortcuts and a contextual right-click menu
- Shift-click range selection for multi-select
- Tags with colors, tag reuse, and multi-file tagging

### Search

- Fuzzy search by name, tags, and uploader
- Optional content search for text files (advanced mode)

### Trash and recovery

- Soft delete to Trash with restore
- Trash retention and purge

### Sharing

- File share links with expiration and optional password
- Folder share links with optional uploads
- Published URL support for correct external links
- Shares respect ACLs and encryption restrictions

### WebDAV and API

- WebDAV endpoint for OS mounts and clients (ACL-aware)
- OpenAPI v3 spec at `api.php?spec=1` with Redoc UI at `api.php`
- `openapi.json.dist` shipped for offline tooling

### Access control and auth

- Per-folder ACLs: view (all/own), upload, create file, edit, rename, copy, move, delete, extract, share, manage
- Folder-only users scoped to `/uploads/<username>`
- Account flags: read-only and disable upload
- Login methods: form login, Basic Auth, OIDC SSO, and TOTP 2FA
- Optional reverse-proxy header auth

### Security and data protection

- CSRF protection on state-changing endpoints
- Password hashing and login throttling
- Optional folder-level encryption at rest (libsodium)
- Optional ClamAV upload scanning

### UI and UX

- Responsive layout with dark/light mode
- Persistent UI settings (view mode, page size, tree state)
- In-browser previews and code editor

### Admin and operations

- Admin panel for users, auth options, WebDAV, antivirus, encryption
- Storage and disk usage summary
- Share link management

### Optional integrations

- ONLYOFFICE Document Server (DOCX/XLSX/PPTX, plus ODT/ODS/ODP and PDF view)
- FFmpeg for video thumbnails
- ClamAV for upload scanning (core) with Pro virus log

### Deployment and scale

- No external database required
- Reverse-proxy and subpath aware (`FR_PUBLISHED_URL`, `FR_BASE_PATH`)
- Works behind Nginx, Traefik, Caddy, or Apache
- Tested with very large folder trees

## Encryption at rest (optional)

- Encrypts entire folders (and descendants) on disk using libsodium
- Encrypted folders disable WebDAV, sharing, zip create/extract, and ONLYOFFICE
- Requires a master key (`FR_ENCRYPTION_MASTER_KEY` or metadata key file)

## FileRise Pro

Pro adds advanced collaboration and storage features:

- User groups with ACL inheritance
- Client upload portals and branding options
- Audit logs with filters and CSV export
- Global search across files, folders, users, and permissions
- Storage explorer (ncdu-style)
- Multi-storage Sources (local, S3-compatible, SMB/CIFS, SFTP, FTP, WebDAV, Google Drive, OneDrive, Dropbox)
- Per-source Trash and cross-source copy/move

See [filerise.net](https://filerise.net) for Pro details.
