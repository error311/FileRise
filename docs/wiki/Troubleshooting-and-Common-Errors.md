# Troubleshooting and Common Errors

Most issues come down to permissions, paths, or reverse-proxy settings. Start with the quick checks below before diving deeper.

## Quick triage

1. Check the error log (see the Logs and Diagnostics page).
2. Confirm the data directories exist and are writable:
   - `/var/www/uploads`
   - `/var/www/users`
   - `/var/www/metadata`
3. Confirm your web server DocumentRoot points to `public/`.
4. If you are behind a proxy or subpath, set `FR_PUBLISHED_URL` and `FR_BASE_PATH` (or send `X-Forwarded-Prefix`).

---

## Common issues

### "Failed to write users file" / permission denied

- Ensure `/var/www/users` is writable by the web server user.
- If you installed outside `/var/www`, update paths in `config/config.php`.
- Check `open_basedir` includes `/var/www` and `/tmp`.

### Files copied into uploads do not appear

- Run a metadata rebuild:
  - Docker: `docker exec -it <container> php /var/www/scripts/scan_uploads.php`
  - Manual: `php /var/www/scripts/scan_uploads.php`
- Or set `SCAN_ON_START=true` and restart once.

### Uploads fail (413, 500, or timeouts)

- Verify `TOTAL_UPLOAD_SIZE` and PHP upload limits.
- Reverse proxies also cap size (for example: Nginx `client_max_body_size`, Traefik `maxRequestBodyBytes`).
- WebDAV uploads are also limited by `FR_WEBDAV_MAX_UPLOAD_BYTES`.

### Login loop or "session not established"

- Clear cookies and confirm `SECURE=true` when behind HTTPS.
- Docker uses `/var/www/sessions` (created at startup).
- Manual installs must ensure `session.save_path` is writable by the web server user.

### WebDAV 401/403

- Enable WebDAV in the Admin Panel.
- Confirm the user has View + Upload/Edit/Delete as needed (ACLs apply).
- Use the full endpoint: `https://your-host/webdav.php/`

### Share links wrong or 404

- Set `FR_PUBLISHED_URL` to the external URL.
- For subpaths, set `FR_BASE_PATH` or send `X-Forwarded-Prefix`.

### ONLYOFFICE not loading

- Confirm the Document Server origin is reachable from the browser.
- Add the CSP header from the ONLYOFFICE page.
- See the ONLYOFFICE wiki for exact settings.

### Features disabled unexpectedly

- Encrypted-at-rest folders disable WebDAV, sharing, ZIP operations, and ONLYOFFICE.
- Admin options can be locked when an environment variable is set.

### Performance feels slow on huge trees

- Avoid mounting the root of a massive share; use a dedicated subfolder.
- See the Performance Tuning page for caching and UI settings.

---

## Still stuck?

Gather logs and details (version, install method, proxy) and open an issue or discussion.
