#!/usr/bin/env bash
# === Update FileRise to v3.3.1 (safe rsync, no composer on demo) ===
set -Eeuo pipefail

VER="v3.3.1"
ASSET="FileRise-${VER}.zip"      # matches GitHub release asset name

WEBROOT="/var/www"
TMP="/tmp/filerise-update"

# 0) quick backup of critical bits (include Pro/demo stuff too)
stamp="$(date +%F-%H%M)"
mkdir -p /root/backups
tar -C "$WEBROOT" -czf "/root/backups/filerise-$stamp.tgz" \
  public/.htaccess \
  config \
  users \
  uploads \
  metadata \
  filerise-bundles \
  filerise-config \
  filerise-site || true
echo "Backup saved to /root/backups/filerise-$stamp.tgz"

# 1) Fetch the release zip
rm -rf "$TMP"
mkdir -p "$TMP"
curl -fsSL "https://github.com/error311/FileRise/releases/download/${VER}/${ASSET}" -o "$TMP/$ASSET"

# 2) Unzip to a staging dir
unzip -q "$TMP/$ASSET" -d "$TMP"
STAGE_DIR="$(find "$TMP" -maxdepth 1 -type d -name 'FileRise*' ! -path "$TMP" | head -n1 || true)"
[ -n "${STAGE_DIR:-}" ] || STAGE_DIR="$TMP"

# 3) Sync code into /var/www
#    - keep public/.htaccess
#    - keep data dirs and current config.php
#    - DO NOT touch filerise-site / bundles / demo config
#    - DO NOT touch vendor/ so Stripe + other libs stay intact on demo
rsync -a --delete \
  --exclude='/public/.htaccess' \
  --exclude='/uploads/***' \
  --exclude='/users/***' \
  --exclude='/metadata/***' \
  --exclude='/filerise-bundles/***' \
  --exclude='/filerise-config/***' \
  --exclude='/filerise-site/***' \
  --exclude='/vendor/***' \
  --exclude='/.github/***' \
  --exclude='/docker-compose.yml' \
  "$STAGE_DIR"/ "$WEBROOT"/

# 4) Ownership (Ubuntu/Debian w/ Apache)
chown -R www-data:www-data "$WEBROOT"

# 5) Composer — still disabled on demo
# if command -v composer >/dev/null 2>&1; then
#   cd "$WEBROOT" || { echo "cd to $WEBROOT failed" >&2; exit 1; }
#   composer install --no-dev --optimize-autoloader
# fi

# 6) Force demo mode ON in config/config.php
CFG_FILE="$WEBROOT/config/config.php"
if [[ -f "$CFG_FILE" ]]; then
  cp "$CFG_FILE" "${CFG_FILE}.bak.$stamp" || true
  sed -i "s/define('FR_DEMO_MODE',[[:space:]]*false);/define('FR_DEMO_MODE', true);/" "$CFG_FILE" || true
fi

# 7) Reload Apache (don’t fail the whole script if reload isn’t available)
systemctl reload apache2 2>/dev/null || true

echo "FileRise updated to ${VER} (code). Demo mode forced ON. Data, Pro bundles, site, and vendor/ (Stripe) preserved."