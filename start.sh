#!/bin/bash
set -euo pipefail
umask 002
echo "🚀 Running start.sh..."

# ──────────────────────────────────────────────────────────────
# Helpers: NEVER crash the container just because chown/chmod isn't supported
# (exFAT/NTFS/CIFS/NFS root_squash, or running as non-root, etc.)
IS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then IS_ROOT=true; fi

safe_chown() {
  if [ "${IS_ROOT}" = "true" ]; then
    chown "$@" 2>&1 || echo "[startup] chown failed (continuing): chown $*"
  fi
}

safe_chmod() {
  if [ "${IS_ROOT}" = "true" ]; then
    chmod "$@" 2>&1 || echo "[startup] chmod failed (continuing): chmod $*"
  fi
}

safe_truncate() {
  # Truncate/create a file without killing the container if the FS is read-only, etc.
  : > "$1" 2>&1 || echo "[startup] could not write: $1"
}

# ──────────────────────────────────────────────────────────────
# 0) If NOT root, we can't remap/chown. Log a hint and skip those parts.
#    If root, remap www-data to PUID/PGID and (optionally) chown data dirs.
if [ "$(id -u)" -ne 0 ]; then
  echo "[startup] Running as non-root. Skipping PUID/PGID remap and chown."
  echo "[startup] Tip: remove '--user' and set PUID/PGID env vars instead."
else
  # Remap www-data to match provided PUID/PGID (e.g., Unraid 99:100 or 1000:1000)
  if [ -n "${PGID:-}" ]; then
    current_gid="$(getent group www-data | cut -d: -f3 || true)"
    if [ "${current_gid}" != "${PGID}" ]; then
      groupmod -o -g "${PGID}" www-data || true
    fi
  fi
  if [ -n "${PUID:-}" ]; then
    current_uid="$(id -u www-data 2>/dev/null || echo '')"
    target_gid="${PGID:-$(getent group www-data | cut -d: -f3)}"
    if [ "${current_uid}" != "${PUID}" ]; then
      usermod -o -u "${PUID}" -g "${target_gid}" www-data || true
    fi
  fi

  # Optional: normalize ownership on data dirs (good for first run on existing shares)
  if [ "${CHOWN_ON_START:-true}" = "true" ]; then
    echo "[startup] Normalizing ownership on uploads/metadata..."
    safe_chown -R www-data:www-data /var/www/metadata /var/www/uploads
    safe_chmod -R u+rwX /var/www/metadata /var/www/uploads
  fi
fi

# ──────────────────────────────────────────────────────────────
# 1) Token‐key warning (guarded for -u)
if [ "${PERSISTENT_TOKENS_KEY:-}" = "default_please_change_this_key" ] || [ -z "${PERSISTENT_TOKENS_KEY:-}" ]; then
  echo "⚠️ WARNING: Using default/empty persistent tokens key—override for production."
fi

# 1.5) Log virus-scan configuration (purely informational)
if [ "${VIRUS_SCAN_ENABLED:-false}" = "true" ]; then
  echo "[startup] VIRUS_SCAN_ENABLED=true"
  echo "[startup] Using virus scanner command: ${VIRUS_SCAN_CMD:-clamscan}"
else
  echo "[startup] Virus scanning disabled (VIRUS_SCAN_ENABLED != 'true')."
fi

# 2) Update config.php based on environment variables
CONFIG_FILE="/var/www/config/config.php"
if [ -f "${CONFIG_FILE}" ]; then
  echo "🔄 Updating config.php from env vars..."
  [ -n "${TIMEZONE:-}" ]         && sed -i "s|define('TIMEZONE',[[:space:]]*'[^']*');|define('TIMEZONE', '${TIMEZONE}');|" "${CONFIG_FILE}"
  [ -n "${DATE_TIME_FORMAT:-}" ] && sed -i "s|define('DATE_TIME_FORMAT',[[:space:]]*'[^']*');|define('DATE_TIME_FORMAT', '${DATE_TIME_FORMAT}');|" "${CONFIG_FILE}"
  if [ -n "${TOTAL_UPLOAD_SIZE:-}" ]; then
    sed -i "s|define('TOTAL_UPLOAD_SIZE',[[:space:]]*'[^']*');|define('TOTAL_UPLOAD_SIZE', '${TOTAL_UPLOAD_SIZE}');|" "${CONFIG_FILE}"
  fi
  [ -n "${SECURE:-}" ]           && sed -i "s|\$envSecure = getenv('SECURE');|\$envSecure = '${SECURE}';|" "${CONFIG_FILE}"
  # NOTE: SHARE_URL is read from getenv in PHP; no sed needed.
fi

# 2.1) Prepare metadata/log & sessions
mkdir -p /var/www/metadata/log
safe_chown www-data:www-data /var/www/metadata/log
safe_chmod 775 /var/www/metadata/log
safe_truncate /var/www/metadata/log/error.log
safe_truncate /var/www/metadata/log/access.log
safe_chown www-data:www-data /var/www/metadata/log/*.log

mkdir -p /var/www/sessions
safe_chown www-data:www-data /var/www/sessions
safe_chmod 700 /var/www/sessions

# 2.2) Prepare dynamic dirs (uploads/users/metadata)
for d in uploads users metadata; do
  tgt="/var/www/${d}"
  mkdir -p "${tgt}"
  safe_chown www-data:www-data "${tgt}"
  safe_chmod 775 "${tgt}"
done

# 2.3) Optional: log quick permission hints (non-fatal)
if [ "$(id -u)" -eq 0 ]; then
  if command -v runuser >/dev/null 2>&1; then
    for p in /var/www/uploads /var/www/users /var/www/metadata /var/www/sessions; do
      runuser -u www-data -- test -w "$p" 2>/dev/null || echo "[startup] WARNING: www-data may not be able to write to $p"
    done
  fi
fi

# 3) Ensure PHP conf dir & set upload limits
mkdir -p /etc/php/8.3/apache2/conf.d
if [ -n "${TOTAL_UPLOAD_SIZE:-}" ]; then
  echo "🔄 Setting PHP upload limits to ${TOTAL_UPLOAD_SIZE}"
  cat > /etc/php/8.3/apache2/conf.d/99-custom.ini <<EOF
upload_max_filesize = ${TOTAL_UPLOAD_SIZE}
post_max_size = ${TOTAL_UPLOAD_SIZE}
EOF
fi

# 3.3) Update ClamAV signatures if not explicitly disabled
if [ "${CLAMAV_AUTO_UPDATE:-true}" = "true" ]; then
  if command -v freshclam >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      echo "[startup] Updating ClamAV signatures via freshclam..."
      # Suppress noisy "NotifyClamd" warnings – we don't run clamd in this container.
      freshclam >/dev/null 2>&1 \
        || echo "[startup] freshclam failed; continuing with existing signatures (if any)."
    else
      echo "[startup] Not running as root; skipping freshclam (requires root)."
    fi
  else
    echo "[startup] ClamAV installed but 'freshclam' not found; skipping DB update."
  fi
else
  echo "[startup] CLAMAV_AUTO_UPDATE=false; skipping freshclam."
fi

# 4) Adjust Apache LimitRequestBody
if [ -n "${TOTAL_UPLOAD_SIZE:-}" ]; then
  size_str="$(echo "${TOTAL_UPLOAD_SIZE}" | tr '[:upper:]' '[:lower:]')"
  case "${size_str: -1}" in
    g) factor=$((1024*1024*1024)); num=${size_str%g} ;;
    m) factor=$((1024*1024));       num=${size_str%m} ;;
    k) factor=1024;                 num=${size_str%k} ;;
    *) factor=1;                    num=${size_str}   ;;
  esac
  LIMIT_REQUEST_BODY=$(( num * factor ))
  echo "🔄 Setting Apache LimitRequestBody to ${LIMIT_REQUEST_BODY} bytes"
  cat > /etc/apache2/conf-enabled/limit_request_body.conf <<EOF
<Directory "/var/www/public">
    LimitRequestBody ${LIMIT_REQUEST_BODY}
</Directory>
EOF
fi

# 5) Configure Apache timeout (600s)
cat > /etc/apache2/conf-enabled/timeout.conf <<EOF
Timeout 600
EOF

# 6) Override ports if provided
if [ -n "${HTTP_PORT:-}" ]; then
  sed -i "s/^Listen 80$/Listen ${HTTP_PORT}/" /etc/apache2/ports.conf || true
  sed -i "s/<VirtualHost \*:80>/<VirtualHost *:${HTTP_PORT}>/" /etc/apache2/sites-available/000-default.conf || true
fi
if [ -n "${HTTPS_PORT:-}" ]; then
  sed -i "s/^Listen 443$/Listen ${HTTPS_PORT}/" /etc/apache2/ports.conf || true
fi

# 7) Set ServerName (idempotent)
SN="${SERVER_NAME:-FileRise}"
if grep -qE '^ServerName\s' /etc/apache2/apache2.conf; then
  sed -i "s|^ServerName .*|ServerName ${SN}|" /etc/apache2/apache2.conf
else
  echo "ServerName ${SN}" >> /etc/apache2/apache2.conf
fi

# 8) Initialize persistent files if absent
if [ ! -f /var/www/users/users.txt ]; then
  echo "" > /var/www/users/users.txt
  safe_chown www-data:www-data /var/www/users/users.txt
  safe_chmod 664 /var/www/users/users.txt
fi

if [ ! -f /var/www/metadata/createdTags.json ]; then
  echo "[]" > /var/www/metadata/createdTags.json
  safe_chown www-data:www-data /var/www/metadata/createdTags.json
  safe_chmod 664 /var/www/metadata/createdTags.json
fi

# 8.5) Harden scan script perms (only if root)
if [ -f /var/www/scripts/scan_uploads.php ] && [ "$(id -u)" -eq 0 ]; then
  chown root:root /var/www/scripts/scan_uploads.php || true
  chmod 0644 /var/www/scripts/scan_uploads.php || true
fi

# 9) One-shot scan when the container starts (opt-in via SCAN_ON_START)
if [ "${SCAN_ON_START:-}" = "true" ]; then
  echo "[startup] Scanning uploads directory to build metadata..."
  if [ "$(id -u)" -eq 0 ]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u www-data -- /usr/bin/php /var/www/scripts/scan_uploads.php || echo "[startup] Scan failed (continuing)"
    else
      su -s /bin/sh -c "/usr/bin/php /var/www/scripts/scan_uploads.php" www-data || echo "[startup] Scan failed (continuing)"
    fi
  else
    # Non-root fallback: run as current user (permissions may limit writes)
    /usr/bin/php /var/www/scripts/scan_uploads.php || echo "[startup] Scan failed (continuing)"
  fi
fi

# 9.6) Stream Apache logs to the container console (optional toggle)
LOG_STREAM="${LOG_STREAM:-error}"
case "${LOG_STREAM,,}" in
  none)   STREAM_ERR=false; STREAM_ACC=false ;;
  access) STREAM_ERR=false; STREAM_ACC=true  ;;
  both)   STREAM_ERR=true;  STREAM_ACC=true  ;;
  error|*)STREAM_ERR=true;  STREAM_ACC=false ;;
esac

echo "🔥 Starting Apache (foreground)..."
echo "[startup] FileRise startup complete. Any further output will be Apache logs (errors by default)."
# Stream only the chosen logs; -n0 = don't dump history, -F = follow across rotations/creation
[ "${STREAM_ERR}" = "true" ] && tail -n0 -F /var/www/metadata/log/error.log 2>/dev/null &
[ "${STREAM_ACC}" = "true" ] && tail -n0 -F /var/www/metadata/log/access.log 2>/dev/null &
exec apachectl -D FOREGROUND
