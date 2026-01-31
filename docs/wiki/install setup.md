# Installation & Setup

You can run FileRise with Docker (recommended) or install it on a PHP web server. This page mirrors the README, with additional details for common setups.

## 1) Docker (recommended)

### Quick start

```bash
docker run -d \
  --name filerise \
  -p 8080:80 \
  -e TIMEZONE="America/New_York" \
  -e TOTAL_UPLOAD_SIZE="10G" \
  -e SECURE="false" \
  -e PERSISTENT_TOKENS_KEY="change_me" \
  -e SCAN_ON_START="true" \
  -e CHOWN_ON_START="true" \
  -v ~/filerise/uploads:/var/www/uploads \
  -v ~/filerise/users:/var/www/users \
  -v ~/filerise/metadata:/var/www/metadata \
  error311/filerise-docker:latest
```

Visit:

```
http://your-server-ip:8080
```

On first launch you will be prompted to create the admin user.

> Tip: After permissions are correct, set `CHOWN_ON_START="false"` to avoid recursive chowns on every start.

### docker-compose.yml

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
      PERSISTENT_TOKENS_KEY: "change_me"
      SCAN_ON_START: "true"   # one-time scan
      CHOWN_ON_START: "true"  # normalize uploads/metadata perms on first run
    volumes:
      - ./uploads:/var/www/uploads
      - ./users:/var/www/users
      - ./metadata:/var/www/metadata
```

### Uploads folder recommendation

Bind `/var/www/uploads` to a **dedicated folder** (not the root of a massive share). If you want FileRise over an existing share, use a **subfolder** (e.g. `/mnt/media/filerise_root`).

## 2) Manual install (PHP web server)

### Requirements

- PHP **8.3+**
- Web server (Apache / Nginx / Caddy + PHP-FPM)
- PHP extensions: `json`, `curl`, `zip`, and standard defaults
- No database required

### Recommended layout (default paths)

By default FileRise uses absolute paths:

- `/var/www/uploads`
- `/var/www/users`
- `/var/www/metadata`

Install the app code in `/var/www/filerise` and set your DocumentRoot to:

```
/var/www/filerise/public
```

### Install from release ZIP (recommended)

Get the latest tag from [Releases](https://github.com/error311/FileRise/releases).

```bash
cd /var/www
sudo mkdir -p filerise
sudo chown -R $USER:$USER /var/www/filerise
cd /var/www/filerise

VERSION="vX.Y.Z"
ASSET="FileRise-${VERSION}.zip"

curl -fsSL "https://github.com/error311/FileRise/releases/download/${VERSION}/${ASSET}" -o "${ASSET}"
unzip "${ASSET}"
```

### Install from git (developer mode)

```bash
cd /var/www
sudo git clone https://github.com/error311/FileRise.git filerise
sudo chown -R $USER:$USER /var/www/filerise

cd /var/www/filerise
composer install
```

### Create data directories

```bash
sudo mkdir -p /var/www/uploads /var/www/users /var/www/metadata
sudo chown -R www-data:www-data /var/www/uploads /var/www/users /var/www/metadata
sudo chmod -R 775 /var/www/uploads /var/www/users /var/www/metadata
```

### Sessions directory (manual installs)

Docker creates `/var/www/sessions` automatically on startup. For manual installs:

- If you keep PHP's default session path, no extra setup is needed.
- If you set `session.save_path = /var/www/sessions` (like the Docker image does), create it:

```bash
sudo mkdir -p /var/www/sessions
sudo chown -R www-data:www-data /var/www/sessions
sudo chmod 700 /var/www/sessions
```

### Proxy / subpath notes

- Set `FR_PUBLISHED_URL` to the public URL (e.g. `https://example.com/files`).
- If your proxy strips the prefix, set `FR_BASE_PATH` or send `X-Forwarded-Prefix`.
- If you are behind a reverse proxy, set `FR_TRUSTED_PROXIES` and `FR_IP_HEADER`.

### Block direct access to /uploads, /users, /metadata (required)

Uploaded file data and app metadata must go through the API. Do **not** expose `/uploads`, `/users`, or `/metadata` directly.

Apache:

```
<LocationMatch "^/(uploads|users|metadata)(?:/|$)">
    Require all denied
</LocationMatch>
```

Nginx:

```
location ~* ^/(uploads|users|metadata)(/|$) {
    return 403;
}
```

If you previously added aliases for `/uploads`, `/users`, or `/metadata`, remove them.

### First-run security checklist

- Set `PERSISTENT_TOKENS_KEY` to a strong value.
- Set `SECURE=true` when running behind TLS.
- Back up `/var/www/uploads`, `/var/www/users`, `/var/www/metadata`.
