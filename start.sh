#!/bin/bash
set -euo pipefail
umask 002
echo "🚀 Running start.sh..."

# 1) Token‐key warning (guarded for -u)
if [ "${PERSISTENT_TOKENS_KEY:-}" = "default_please_change_this_key" ] || [ -z "${PERSISTENT_TOKENS_KEY:-}" ]; then
  echo "⚠️ WARNING: Using default/empty persistent tokens key—override for production."
fi

# 2) Update config.php based on environment variables
CONFIG_FILE="/var/www/config/config.php"
if [ -f "${CONFIG_FILE}" ]; then
  echo "🔄 Updating config.php from env vars..."
  [ -n "${TIMEZONE:-}" ]          && sed -i "s|define('TIMEZONE',[[:space:]]*'[^']*');|define('TIMEZONE', '${TIMEZONE}');|" "${CONFIG_FILE}"
  [ -n "${DATE_TIME_FORMAT:-}" ]  && sed -i "s|define('DATE_TIME_FORMAT',[[:space:]]*'[^']*');|define('DATE_TIME_FORMAT', '${DATE_TIME_FORMAT}');|" "${CONFIG_FILE}"
  if [ -n "${TOTAL_UPLOAD_SIZE:-}" ]; then
    sed -i "s|define('TOTAL_UPLOAD_SIZE',[[:space:]]*'[^']*');|define('TOTAL_UPLOAD_SIZE', '${TOTAL_UPLOAD_SIZE}');|" "${CONFIG_FILE}"
  fi
  [ -n "${SECURE:-}" ]            && sed -i "s|\$envSecure = getenv('SECURE');|\$envSecure = '${SECURE}';|" "${CONFIG_FILE}"
  [ -n "${SHARE_URL:-}" ]         && sed -i "s|define('SHARE_URL',[[:space:]]*'[^']*');|define('SHARE_URL', '${SHARE_URL}');|" "${CONFIG_FILE}"
fi

# 2.1) Prepare metadata/log & sessions
mkdir -p /var/www/metadata/log
chown www-data:www-data /var/www/metadata/log
chmod 775 /var/www/metadata/log

mkdir -p /var/www/sessions
chown www-data:www-data /var/www/sessions
chmod 700 /var/www/sessions

# 2.2) Prepare dynamic dirs (uploads/users/metadata)
for d in uploads users metadata; do
  tgt="/var/www/${d}"
  mkdir -p "${tgt}"
  chown www-data:www-data "${tgt}"
  chmod 775 "${tgt}"
done

# 3) Ensure PHP conf dir & set upload limits
mkdir -p /etc/php/8.3/apache2/conf.d
if [ -n "${TOTAL_UPLOAD_SIZE:-}" ]; then
  echo "🔄 Setting PHP upload limits to ${TOTAL_UPLOAD_SIZE}"
  cat > /etc/php/8.3/apache2/conf.d/99-custom.ini <<EOF
upload_max_filesize = ${TOTAL_UPLOAD_SIZE}
post_max_size = ${TOTAL_UPLOAD_SIZE}
EOF
fi

# 4) Adjust Apache LimitRequestBody
if [ -n "${TOTAL_UPLOAD_SIZE:-}" ]; then
  size_str=$(echo "${TOTAL_UPLOAD_SIZE}" | tr '[:upper:]' '[:lower:]')
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
  chown www-data:www-data /var/www/users/users.txt
  chmod 664 /var/www/users/users.txt
fi

if [ ! -f /var/www/metadata/createdTags.json ]; then
  echo "[]" > /var/www/metadata/createdTags.json
  chown www-data:www-data /var/www/metadata/createdTags.json
  chmod 664 /var/www/metadata/createdTags.json
fi

# 8.5) Harden scan script perms (before running it)
if [ -f /var/www/scripts/scan_uploads.php ]; then
  chown root:root /var/www/scripts/scan_uploads.php
  chmod 0644 /var/www/scripts/scan_uploads.php
fi

# 9) One-shot scan when the container starts (opt-in via SCAN_ON_START)
if [ "${SCAN_ON_START:-}" = "true" ]; then
  echo "[startup] Scanning uploads directory to build metadata..."
  if command -v runuser >/dev/null 2>&1; then
    runuser -u www-data -- /usr/bin/php /var/www/scripts/scan_uploads.php || echo "[startup] Scan failed (continuing)"
  else
    su -s /bin/sh -c "/usr/bin/php /var/www/scripts/scan_uploads.php" www-data || echo "[startup] Scan failed (continuing)"
  fi
fi

# 10) Final ownership sanity for data dirs
chown -R www-data:www-data /var/www/metadata /var/www/uploads
chmod -R u+rwX /var/www/metadata /var/www/uploads

echo "🔥 Starting Apache..."
exec apachectl -D FOREGROUND
