# Performance Tuning

Tips for large trees, heavy usage, and stable deployments.

---

## Storage layout

- Use a **dedicated uploads directory** instead of mounting the root of a huge share.
- If mounting a large share, use a subfolder so scans and permission fixes are scoped.

---

## Scans and ownership

- `SCAN_ON_START=true` is meant for first run or occasional rescan.
- Keep `SCAN_ON_START=false` for normal restarts.
- `CHOWN_ON_START=true` is helpful initially; disable once perms are correct.

---

## PHP tuning (manual installs)

- Enable OPcache.
- Increase `realpath_cache_size` and `realpath_cache_ttl`.
- Set `upload_max_filesize` and `post_max_size` >= `TOTAL_UPLOAD_SIZE`.
- Use `custom-php.ini` as a baseline (Docker already loads it); copy into your PHP conf.d and restart.

---

## Reverse proxy

- Set `client_max_body_size 0;` (Nginx) if you allow very large uploads.
- Set `FR_PUBLISHED_URL` to avoid URL generation issues.

---

## Encrypted folders

Encryption at rest disables range requests and some features; this is expected and can affect perceived performance for large media.
