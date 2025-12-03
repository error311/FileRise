# FileRise

[![GitHub stars](https://img.shields.io/github/stars/error311/FileRise?style=social)](https://github.com/error311/FileRise)
[![Docker pulls](https://img.shields.io/docker/pulls/error311/filerise-docker)](https://hub.docker.com/r/error311/filerise-docker)
[![Docker CI](https://img.shields.io/github/actions/workflow/status/error311/filerise-docker/main.yml?branch=main&label=Docker%20CI)](https://github.com/error311/filerise-docker/actions/workflows/main.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/error311/FileRise/ci.yml?branch=master&label=CI)](https://github.com/error311/FileRise/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://demo.filerise.net)
[![Release](https://img.shields.io/github/v/release/error311/FileRise?include_prereleases&sort=semver)](https://github.com/error311/FileRise/releases)
[![License](https://img.shields.io/github/license/error311/FileRise)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join_chat-5865F2?logo=discord&logoColor=white)](https://discord.gg/7WN6f56X2e)
[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-❤-red)](https://github.com/sponsors/error311)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-orange)](https://ko-fi.com/error311)

**FileRise** is a modern, self-hosted web file manager / WebDAV server.  
Drag & drop uploads, ACL-aware sharing, OnlyOffice integration, and a clean UI — all in a single PHP app that you control.

- 💾 **Self-hosted “cloud drive”** – Runs anywhere with PHP (or via Docker). No external DB required.
- 🔐 **Granular per-folder ACLs** – View / Own / Upload / Edit / Delete / Share, enforced across UI, API, and WebDAV.
- 🔄 **Fast drag-and-drop uploads** – Chunked, resumable uploads with pause/resume and progress.
- 🌳 **Scales to huge trees** – Tested with **100k+ folders** in the sidebar tree.
- 🧩 **ONLYOFFICE support (optional)** – Edit DOCX/XLSX/PPTX using your own Document Server.
- 🌍 **WebDAV** – Mount FileRise as a drive from macOS, Windows, Linux, or Cyberduck/WinSCP.
- 📊 **Storage / disk usage summary** – CLI scanner with snapshots, total usage, and per-volume breakdowns in the admin panel.
- 🎨 **Polished UI** – Dark/light mode, responsive layout, in-browser previews & code editor.
- 🔑 **Login + SSO** – Local users, TOTP 2FA, and OIDC (Auth0 / Authentik / Keycloak / etc.).
- 👥 **Pro: user groups, client portals & storage explorer** – Group-based ACLs, brandable client upload portals, and an ncdu-style explorer to drill into folders, largest files, and clean up storage inline.

Full list of features available at [Full Feature Wiki](https://github.com/error311/FileRise/wiki/Features)

![FileRise](https://raw.githubusercontent.com/error311/FileRise/master/resources/filerise-v2.3.2.png)

> 💡 Looking for **FileRise Pro** (brandable header, **user groups**, **client upload portals**, license handling)?
> Check out [filerise.net](https://filerise.net) – FileRise Core stays fully open-source (MIT).

---

## Quick links

- 🚀 **Live demo:** [Demo](https://demo.filerise.net) (username: `demo` / password: `demo`)  
- 📚 **Docs & Wiki:** [Wiki](https://github.com/error311/FileRise/wiki)  
  - [Features overview](https://github.com/error311/FileRise/wiki/Features)
  - [WebDAV](https://github.com/error311/FileRise/wiki/WebDAV)
  - [ONLYOFFICE](https://github.com/error311/FileRise/wiki/ONLYOFFICE)
- 🐳 **Docker image:** [Docker](https://github.com/error311/filerise-docker)
- 💬 **Discord:** [Join the FileRise server](https://discord.gg/YOUR_CODE_HERE)
- 📝 **Changelog:** [Changes](https://github.com/error311/FileRise/blob/master/CHANGELOG.md)

---

## 1. What FileRise does

FileRise turns a folder on your server into a **web-based file explorer** with:

- Folder tree + breadcrumbs for fast navigation
- Multi-file/folder drag-and-drop uploads
- Move / copy / rename / delete / extract ZIP
- Public share links (optionally password-protected & expiring)
- Tagging and search by name, tag, uploader, and content
- Trash with restore/purge
- Inline previews (images, audio, video, PDF) and a built-in code editor

Everything flows through a single ACL engine, so permissions are enforced consistently whether users are in the browser UI, using WebDAV, or hitting the API.

---

## 2. Install (Docker – recommended)

The easiest way to run FileRise is the official Docker image.

### Option A – Quick start (docker run)

```bash
docker run -d \
  --name filerise \
  -p 8080:80 \
  -e TIMEZONE="America/New_York" \
  -e TOTAL_UPLOAD_SIZE="10G" \
  -e SECURE="false" \
  -e PERSISTENT_TOKENS_KEY="default_please_change_this_key" \
  -e SCAN_ON_START="true" \
  -e CHOWN_ON_START="true" \
  -v ~/filerise/uploads:/var/www/uploads \
  -v ~/filerise/users:/var/www/users \
  -v ~/filerise/metadata:/var/www/metadata \
  error311/filerise-docker:latest
```

Then visit:

```text
http://your-server-ip:8080
```

On first launch you’ll be guided through creating the **initial admin user**.

> 💡 After the first run, you can set `CHOWN_ON_START="false"` if permissions are already correct and you don’t want a recursive `chown` on every start.

> ⚠️ **Uploads folder recommendation**
>
> It’s strongly recommended to bind `/var/www/uploads` to a **dedicated folder**
> (for example `~/filerise/uploads` or `/mnt/user/appdata/FileRise/uploads`),
> not the root of a huge media share.
>
> If you really want FileRise to sit “on top of” an existing share, use a
> subfolder (e.g. `/mnt/user/media/filerise_root`) instead of the share root,
> so scans and permission changes stay scoped to that folder.

---

### Option B – docker-compose.yml

```yaml
services:
  filerise:
    image: error311/filerise-docker:latest
    container_name: filerise
    ports:
      - "8080:80"
    environment:
      TIMEZONE: "America/New_York"
      TOTAL_UPLOAD_SIZE: "10G"
      SECURE: "false"
      PERSISTENT_TOKENS_KEY: "default_please_change_this_key"
      SCAN_ON_START: "true"   # auto-index existing files on startup
      CHOWN_ON_START: "true"  # fix permissions on uploads/users/metadata on startup
    volumes:
      - ./uploads:/var/www/uploads
      - ./users:/var/www/users
      - ./metadata:/var/www/metadata
```

Bring it up with:

```bash
docker compose up -d
```

---

### Common environment variables

| Variable                | Required | Example                          | What it does                                                                  |
|-------------------------|----------|----------------------------------|-------------------------------------------------------------------------------|
| `TIMEZONE`              | ✅       | `America/New_York`               | PHP / container timezone.                                                     |
| `TOTAL_UPLOAD_SIZE`     | ✅       | `10G`                            | Max total upload size per request (e.g. `5G`, `10G`).                         |
| `SECURE`                | ✅       | `false`                          | `true` when running behind HTTPS / reverse proxy, else `false`.               |
| `PERSISTENT_TOKENS_KEY` | ✅       | `default_please_change_this_key` | Secret used to sign “remember me” tokens. **Change this.**                    |
| `SCAN_ON_START`         | Optional | `true`                           | If `true`, scan `uploads/` on startup and index existing files.               |
| `CHOWN_ON_START`        | Optional | `true`                           | If `true`, chown `uploads/`, `users/`, `metadata/` on startup.                |
| `DATE_TIME_FORMAT`      | Optional | `Y-m-d H:i`                      | Overrides `DATE_TIME_FORMAT` in `config.php` (controls how dates are shown).  |

> If `DATE_TIME_FORMAT` is not set, FileRise uses the default from `config/config.php`
> (currently `m/d/y  h:iA`).
> 🗂 **Using an existing folder tree**
>
> - Point `/var/www/uploads` at the folder you want FileRise to manage.
> - Set `SCAN_ON_START="true"` on the first run to index existing files, then
>   usually set it to `"false"` so the container doesn’t rescan on every restart.
> - `CHOWN_ON_START="true"` is handy on first run to fix permissions. If you map
>   a large share or already manage ownership yourself, set it to `"false"` to
>   avoid recursive `chown` on every start.
>
> Volumes:  
> - `/var/www/uploads` – your actual files  
> - `/var/www/users` – user & pro jsons  
> - `/var/www/metadata` – tags, search index, share links, etc.

**More Docker / orchestration options (Unraid, Portainer, k8s, reverse proxy, etc.)**  
- [Install & Setup](https://github.com/error311/FileRise/wiki/Installation-Setup)  
- [Nginx](https://github.com/error311/FileRise/wiki/Nginx-Setup)  
- [FAQ](https://github.com/error311/FileRise/wiki/FAQ)  
- [Kubernetes / k8s deployment](https://github.com/error311/FileRise/wiki/Kubernetes---k8s-deployment)  
- Portainer templates: add this URL in Portainer → Settings → App Templates:  
  `https://raw.githubusercontent.com/error311/filerise-portainer-templates/refs/heads/main/templates.json` 
- See also the Docker repo: [error311/filerise-docker](https://github.com/error311/filerise-docker)

---

## 3. Manual install (PHP web server)

Prefer bare-metal or your own stack? FileRise is just PHP + a few extensions.

**Requirements**  

- PHP **8.3+**
- Web server (Apache / Nginx / Caddy + PHP-FPM)
- PHP extensions: `json`, `curl`, `zip` (and usual defaults)
- No database required

**Steps**  

1. Clone or download FileRise into your web root:

   ```bash
   git clone https://github.com/error311/FileRise.git
   ```

2. Create data directories and set permissions:

   ```bash
   cd FileRise
   mkdir -p uploads users metadata
   chown -R www-data:www-data uploads users metadata   # adjust for your web user
   chmod -R 775 uploads users metadata
   ```

3. (Optional) Install PHP dependencies with Composer:

   ```bash
   composer install
   ```

4. Configure PHP (upload limits / timeouts) and ensure rewrites are enabled.  
   - Apache: allow `.htaccess` or copy its rules into your vhost.  
   - Nginx/Caddy: mirror the basic protections (no directory listing, block sensitive files).

5. Browse to your FileRise URL and follow the **admin setup** screen.

For detailed examples and reverse proxy snippets, see the **Installation** page in the Wiki [Install & Setup](https://github.com/error311/FileRise/wiki/Installation-Setup).

---

## 4. WebDAV & ONLYOFFICE (optional)

### WebDAV

Once enabled in the Admin panel, FileRise exposes a WebDAV endpoint (e.g. `/webdav.php`). Use it with:

- **macOS Finder** – Go → Connect to Server → `https://your-host/webdav.php/`
- **Windows File Explorer** – Map Network Drive → `https://your-host/webdav.php/`
- **Linux (GVFS/Nautilus)** – `dav://your-host/webdav.php/`
- Clients like **Cyberduck**, **WinSCP**, etc.

WebDAV operations honor the same ACLs as the web UI.

See: [WebDAV](https://github.com/error311/FileRise/wiki/WebDAV)

### ONLYOFFICE integration

If you run an ONLYOFFICE Document Server you can open/edit Office documents directly from FileRise (DOCX, XLSX, PPTX, ODT, ODS, ODP; PDFs view-only).

Configure it in **Admin → ONLYOFFICE**:

- Enable ONLYOFFICE
- Set your Document Server origin (e.g. `https://docs.example.com`)
- Configure a shared JWT secret
- Copy the suggested Content-Security-Policy header into your reverse proxy

Docs: [ONLYOFFICE](https://github.com/error311/FileRise/wiki/ONLYOFFICE)

---

## 5. Security & updates

- FileRise is actively maintained and has published security advisories.  
- See **SECURITY.md** and GitHub Security Advisories for details.
- To upgrade:
  - **Docker:** `docker pull error311/filerise-docker:latest` and recreate the container with the same volumes.
  - **Manual:** replace app files with the latest release (keep `uploads/`, `users/`, `metadata/`, and your config).

Please report vulnerabilities responsibly via the channels listed in **SECURITY.md**.

---

## 6. Community, support & contributing

- 🧵 **GitHub Discussions & Issues:** ask questions, report bugs, suggest features.  
- 💬 **Unraid forum thread:** for Unraid-specific setup and tuning.  
- 🌍 **Reddit / self-hosting communities:** occasional release posts & feedback threads.

Contributions are welcome — from bug fixes and docs to translations and UI polish.  
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If FileRise saves you time or becomes your daily driver, a ⭐ on GitHub or sponsorship is hugely appreciated:

- ❤️ [GitHub Sponsors](https://github.com/sponsors/error311)
- ☕ [Ko-fi](https://ko-fi.com/error311)

---

## 7. License & third-party code

FileRise Core is released under the **MIT License** – see [LICENSE](LICENSE).

It bundles a small set of well-known client and server libraries (Bootstrap, CodeMirror, DOMPurify, Fuse.js, Resumable.js, sabre/dav, etc.).  
All third-party code remains under its original licenses.

See `THIRD_PARTY.md` and the `licenses/` folder for full details.

## 8. Press

- [Heise / iX Magazin – “FileRise 2.0: Web-Dateimanager mit Client Portals” (DE)](https://www.heise.de/news/FileRise-2-0-Web-Dateimanager-mit-Client-Portals-11092171.html)
- [Heise / iX Magazin – “FileRise 2.0: Web File Manager with Client Portals” (EN)](https://www.heise.de/en/news/FileRise-2-0-Web-File-Manager-with-Client-Portals-11092376.html)
