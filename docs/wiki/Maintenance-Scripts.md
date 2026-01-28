# Maintenance Scripts

Scripts live in `./scripts` in the repo (or `/var/www/scripts` in the Docker image). Most users never need to run them.

---

## scan_uploads.php

Rebuilds per-folder metadata for files already on disk. Useful after copying files into `uploads/` or after a restore.

Docker:

```bash
docker exec -u www-data -it filerise php /var/www/scripts/scan_uploads.php
```

Manual:

```bash
php /var/www/scripts/scan_uploads.php
```

Tip: `SCAN_ON_START=true` runs this once when the container starts.

---

## update-filerise.sh (manual installs)

Updates a manual install in `/var/www` from a release ZIP while keeping `config/config.php` and data folders.

Requirements: `curl`, `unzip`, `rsync`.

```bash
sudo bash /var/www/scripts/update-filerise.sh vX.Y.Z
```

Notes:

- This script assumes the app lives in `/var/www`. If you installed elsewhere, edit `WEBROOT` inside the script.
- Not for Docker. For Docker, pull a new image tag and recreate the container.

---

## manual-sync.sh (demo-only)

Demo server sync script with extra excludes and a forced `FR_DEMO_MODE` toggle. Do not use this on production installs.

---

## gen-openapi.sh (dev)

Regenerates `openapi.json.dist` from annotations.

```bash
./scripts/gen-openapi.sh
```

Requires composer dependencies.

---

## stamp-assets.sh (release helper)

Updates asset cache-busters and version placeholders.

```bash
./scripts/stamp-assets.sh vX.Y.Z /path/to/repo
```

This updates `?v=...` values and writes `public/js/version.js`.
