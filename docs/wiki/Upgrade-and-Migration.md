# Upgrade and Migration

This page covers common upgrade paths for Docker and manual installs.

---

## Docker upgrade

1. Pull the new image tag:

```bash
docker pull error311/filerise-docker:vX.Y.Z
```

2. Recreate the container with the same volumes and env vars.

3. Keep these volumes the same:

- `/var/www/uploads`
- `/var/www/users`
- `/var/www/metadata`

---

## Manual upgrade

### Option A: scripted update (recommended)

If you installed FileRise from the release ZIP, you can use the helper script in your app folder:

```bash
sudo bash /path/to/filerise/scripts/update-filerise.sh vX.Y.Z
```

What it does:

- Creates a backup archive in `/root/backups` (config + data folders).
- Downloads the release ZIP from GitHub.
- Syncs new code into `/var/www` while preserving `config/config.php` and data dirs.
- Runs `composer install` only if `vendor/` is missing.

Requirements: `curl`, `unzip`, `rsync` (and `composer` only if needed).
If your install path is not `/var/www`, edit `WEBROOT` at the top of the script.

### Option B: manual replace

1. Back up:

- `/var/www/uploads`
- `/var/www/users`
- `/var/www/metadata`
- `config/config.php` (if you customized it)

2. Replace the app code with the latest release ZIP.
3. Restore your config and data directories.
4. Verify permissions and restart the web server.

---

## Migration tips

- Keep `PERSISTENT_TOKENS_KEY` the same across restores to avoid invalidating stored secrets.
- If moving to a new host, restore data to the same absolute paths or update `config/config.php`.
- If you use a reverse proxy, confirm `FR_PUBLISHED_URL` and `FR_BASE_PATH` after the move.

---

## Pro notes

If you use Pro:

- Pro bundle and license files live under `/var/www/users` by default.
- Backing up and restoring that directory preserves Pro settings.
