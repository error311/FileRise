# FAQ / Troubleshooting

## Upload failed or large files not uploading

- Set `TOTAL_UPLOAD_SIZE` high enough (Docker will update PHP limits automatically).
- For manual installs, raise `upload_max_filesize` and `post_max_size` in PHP.
- For Nginx, set `client_max_body_size 0;` if you allow very large uploads.

## Share links look wrong behind a proxy

- Set `FR_PUBLISHED_URL` to the public URL (including subpath).
- If the proxy strips the prefix, set `FR_BASE_PATH` or send `X-Forwarded-Prefix`.
- Set `SECURE=true` when behind HTTPS.

## Permission errors / cannot write files

- Ensure these paths are writable by the web user:
  - `/var/www/uploads`
  - `/var/www/users`
  - `/var/www/metadata`
- In Docker, use `CHOWN_ON_START=true` on first run.
- If running as root, set `PUID`/`PGID` to match your host UID/GID.

## Where is my data stored?

- Files: `/var/www/uploads`
- Users + admin config + Pro license: `/var/www/users`
- Metadata + logs: `/var/www/metadata` (logs in `/var/www/metadata/log`)

Back up all three.

## Reset admin / lost password

- If another admin exists, use the Admin UI to reset a password.
- As a last resort:
  - Back up `/var/www/users/users.txt`
  - Remove the admin line (or delete the file)
  - Restart FileRise to trigger the setup flow

## WebDAV auth issues (Windows)

Windows requires HTTPS for WebDAV by default. If you must use HTTP, enable BasicAuth over HTTP in the registry (see the WebDAV page).

## Updating FileRise

- Docker: pull the new image and recreate the container with the same volumes.
- Manual: replace app files with the latest release ZIP (keep `/uploads`, `/users`, `/metadata`).

If you still have issues, open a GitHub issue with logs and your install details.
