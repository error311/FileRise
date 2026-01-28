# Logs and Diagnostics

This page lists where FileRise writes logs and what to collect when you need support.

## Log locations (Docker image)

- `/var/www/metadata/log/error.log`
- `/var/www/metadata/log/access.log`
- `/var/www/users/fail2ban.log` (failed login log)
- `/var/www/users/failed_logins.json` (rate-limit metadata)

## Stream logs to Docker

The Docker image can stream logs to stdout with `LOG_STREAM`:

- `error` (default)
- `access`
- `both`
- `none`

Examples:

```bash
docker logs -f filerise
docker exec -it filerise tail -f /var/www/metadata/log/error.log
```

## Manual installs

For non-Docker setups, check your web server and PHP error logs:

- Apache: error log and access log
- Nginx: error log and access log
- PHP-FPM: error log (if separate)

If you want FileRise-style log paths, point your web server logs to `/var/www/metadata/log` and ensure permissions are correct.

## What to capture for support

- FileRise version (footer or `public/js/version.js`)
- Install method (Docker tag, release ZIP, or git)
- Reverse proxy and subpath (if any)
- Steps to reproduce
- Error log lines around the event

## Tips

- Do not post secrets in logs or screenshots. Mask tokens and passwords.
- For intermittent issues, keep a `tail -f` running and reproduce once.
