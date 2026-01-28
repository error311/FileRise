# Common environment variables

These environment variables can be set for Docker or other deployments. Most are optional unless marked required.

Full reference: https://github.com/error311/FileRise/wiki/Environment-Variables-Full-Reference

## Core

| Variable                | Required | Example                          | What it does |
|-------------------------|----------|----------------------------------|--------------|
| `TIMEZONE`              | yes      | `America/New_York`               | PHP / container timezone. |
| `TOTAL_UPLOAD_SIZE`     | yes      | `10G`                            | Max total upload size per request; also sets PHP upload limits and Apache `LimitRequestBody` in the container. |
| `SECURE`                | yes      | `false`                          | Set `true` when behind HTTPS / a reverse proxy so cookies/links use HTTPS. |
| `PERSISTENT_TOKENS_KEY` | yes      | `change_me_super_secret`         | Encrypts stored secrets (tokens, permissions, admin config). Do not leave default. |
| `DATE_TIME_FORMAT`      | no       | `Y-m-d H:i`                      | UI date/time format override. |
| `FR_IGNORE_REGEX`       | no       | `^snapshot/`                     | Newline-separated regex patterns to ignore entries in listings/indexing. |
| `SCAN_ON_START`         | no       | `true`                           | Run `scan_uploads.php` once at container start to index existing files. |
| `CHOWN_ON_START`        | no       | `true`                           | Recursively normalizes ownership/permissions on `uploads/` + `metadata/` at startup. |
| `PUID`                  | no       | `99`                             | Remap `www-data` user to this UID (e.g. Unraid). |
| `PGID`                  | no       | `100`                            | Remap `www-data` group to this GID. |

## URLs, proxy, and subpaths

| Variable             | Required | Example                          | What it does |
|----------------------|----------|----------------------------------|--------------|
| `FR_PUBLISHED_URL`   | no       | `https://example.com/files`      | Canonical public URL for share links, portals, redirects. |
| `FR_BASE_PATH`       | no       | `/files`                         | Force subpath when proxy strips prefixes (overrides auto-detect). |
| `FR_TRUSTED_PROXIES` | no       | `127.0.0.1,10.0.0.0/8`            | Comma-separated proxy IPs/CIDRs allowed to supply client IP headers. |
| `FR_IP_HEADER`       | no       | `X-Forwarded-For`                | Header to trust for real client IP. |
| `SHARE_URL`          | no       | `https://example.com/api/file/share.php` | Override share endpoint (use `FR_PUBLISHED_URL` if possible). |

## WebDAV and limits

| Variable                    | Required | Example   | What it does |
|----------------------------|----------|-----------|--------------|
| `FR_WEBDAV_MAX_UPLOAD_BYTES` | no     | `0`       | WebDAV upload cap in bytes (`0` = unlimited). |

## Integrations and services

| Variable                 | Required | Example            | What it does |
|--------------------------|----------|--------------------|--------------|
| `VIRUS_SCAN_ENABLED`     | no       | `true`             | Enable ClamAV upload scanning. |
| `VIRUS_SCAN_CMD`         | no       | `clamscan`         | Scanner command (`clamscan`, `clamdscan`, or wrapper). |
| `VIRUS_SCAN_EXCLUDE_DIRS`| no       | `snapshot, tmp`    | Exclude upload paths relative to the source root (use `s3:/snapshot` for a specific source id). |
| `CLAMAV_AUTO_UPDATE`     | no       | `true`             | Run `freshclam` on startup (root only). |
| `FR_FFMPEG_PATH`         | no       | `/usr/bin/ffmpeg`  | FFmpeg path for video thumbnails. |
| `FR_ENCRYPTION_MASTER_KEY` | no     | `base64:...`       | 32-byte key for encryption-at-rest (hex or `base64:...`). |

## Runtime / container

| Variable      | Required | Example | What it does |
|---------------|----------|---------|--------------|
| `HTTP_PORT`   | no       | `8080`  | Override Apache `Listen 80` inside the container. |
| `HTTPS_PORT`  | no       | `8443`  | Override Apache `Listen 443` inside the container. |
| `SERVER_NAME` | no       | `files.example.com` | Set Apache `ServerName`. |
| `LOG_STREAM`  | no       | `both`  | Stream logs to stdout: `error`, `access`, `both`, or `none`. |

## Pro (optional)

| Variable              | Required | Example                          | What it does |
|-----------------------|----------|----------------------------------|--------------|
| `FR_PRO_LICENSE`      | no       | `frp_...`                        | Inline Pro license string (optional). |
| `FR_PRO_LICENSE_FILE` | no       | `/var/www/users/proLicense.txt`  | Plain-text license file path. |
| `FR_PRO_BUNDLE_DIR`   | no       | `/var/www/users/pro`             | Pro bundle directory (default under users). |
| `FR_PRO_SEARCH_ENABLED` | no     | `true`                           | Force Search Everywhere on/off (Pro only). |
