# Environment Variables (Full Reference)

This page lists all known environment variables read by FileRise core and the Docker startup script.

Notes:
- Defaults reflect current code. Your deployment may override them.
- Docker sets some defaults via the image (see `Dockerfile`/`start.sh`).

---

## Core behavior

| Variable | Default | Notes |
|---|---|---|
| `TIMEZONE` | `America/New_York` | App timezone (used by PHP and UI). |
| `DATE_TIME_FORMAT` | `m/d/y  h:iA` | UI date/time format. |
| `TOTAL_UPLOAD_SIZE` | `5G` | Max total upload size per request; used to set PHP upload limits and Apache `LimitRequestBody` in Docker. |
| `SECURE` | auto | Set `true` when behind HTTPS to generate secure cookies/links. |
| `PERSISTENT_TOKENS_KEY` | `default_please_change_this_key` | Encrypts stored secrets (tokens, permissions, admin config). Always change in production. |
| `FR_IGNORE_REGEX` | empty | Newline-separated regex patterns to ignore entries in listings/indexing; env overrides admin config. |

---

## Startup / container (Docker)

| Variable | Default | Notes |
|---|---|---|
| `SCAN_ON_START` | `false` | When `true`, runs `scripts/scan_uploads.php` on container start. |
| `CHOWN_ON_START` | `true` | Normalizes ownership/permissions on `uploads/` + `metadata/` at startup. |
| `PUID` | `99` | Remaps `www-data` UID (Dockerfile default). |
| `PGID` | `100` | Remaps `www-data` GID (Dockerfile default). |
| `LOG_STREAM` | `error` | Log streaming to stdout: `error`, `access`, `both`, or `none`. |
| `HTTP_PORT` | `80` | Override Apache `Listen 80` in the container. |
| `HTTPS_PORT` | `443` | Override Apache `Listen 443` in the container. |
| `SERVER_NAME` | `FileRise` | Sets Apache `ServerName`. |

---

## URLs, proxy, and subpaths

| Variable | Default | Notes |
|---|---|---|
| `FR_PUBLISHED_URL` | empty | Canonical public URL for share links, portals, redirects. Env wins over admin config. |
| `FR_BASE_PATH` | auto | Force a subpath when your proxy strips prefixes (overrides auto-detect). |
| `FR_TRUSTED_PROXIES` | empty | Comma-separated IPs/CIDRs allowed to supply the client IP header. |
| `FR_IP_HEADER` | `X-Forwarded-For` | Header to trust for the real client IP. |
| `SHARE_URL` | auto | Override share endpoint URL (use `FR_PUBLISHED_URL` if possible). |

---

## WebDAV

| Variable | Default | Notes |
|---|---|---|
| `FR_WEBDAV_MAX_UPLOAD_BYTES` | `0` | WebDAV upload cap in bytes (`0` = unlimited). |

---

## Antivirus / ClamAV

| Variable | Default | Notes |
|---|---|---|
| `VIRUS_SCAN_ENABLED` | empty | If set, overrides admin setting (`true`/`false`). |
| `VIRUS_SCAN_CMD` | `clamscan` | Scanner command (`clamscan`, `clamdscan`, or wrapper). |
| `VIRUS_SCAN_EXCLUDE_DIRS` | empty | Comma or newline separated paths relative to the source root (example: `snapshot`, `tmp`). For Pro sources you can prefix with source id (`s3:/snapshot`). |
| `CLAMAV_AUTO_UPDATE` | `true` | Run `freshclam` on startup when root. |

---

## Encryption at rest

| Variable | Default | Notes |
|---|---|---|
| `FR_ENCRYPTION_MASTER_KEY` | empty | 32-byte master key (hex 64 chars or `base64:...`). If set, admin key file is ignored. |

---

## Media

| Variable | Default | Notes |
|---|---|---|
| `FR_FFMPEG_PATH` | empty | Path to FFmpeg for video thumbnails. Env locks the admin field. |

---

## OIDC / SSO

| Variable | Default | Notes |
|---|---|---|
| `FR_OIDC_AUTO_CREATE` | `true` | Auto-create users on first OIDC login. |
| `FR_OIDC_GROUP_CLAIM` | `groups` | Claim name for IdP groups. |
| `FR_OIDC_EXTRA_SCOPES` | empty | Extra OIDC scopes to request (space/comma separated). |
| `FR_OIDC_ADMIN_GROUP` | `filerise-admins` | IdP group that maps to FileRise admin. |
| `FR_OIDC_PRO_GROUP_PREFIX` | empty | Optional prefix for mapping IdP groups to Pro groups. |
| `FR_OIDC_ALLOW_DEMOTE` | unset | If set (`1/true`), allows IdP to demote admins. |
| `FR_OIDC_DEBUG` | `false` | Enable OIDC debug logging when set. |

---

## Pro

| Variable | Default | Notes |
|---|---|---|
| `FR_PRO_LICENSE` | empty | Inline Pro license string. |
| `FR_PRO_LICENSE_FILE` | `/var/www/users/proLicense.txt` | Plain-text license file path. |
| `FR_PRO_BUNDLE_DIR` | `/var/www/users/pro` | Pro bundle directory. |
| `FR_PRO_SEARCH_ENABLED` | empty | Force Search Everywhere on/off (Pro only). |

---

## Testing / development

| Variable | Default | Notes |
|---|---|---|
| `FR_TEST_UPLOAD_DIR` | empty | Override upload dir for tests/dev. |
| `FR_TEST_USERS_DIR` | empty | Override users dir for tests/dev. |
| `FR_TEST_META_DIR` | empty | Override metadata dir for tests/dev. |
