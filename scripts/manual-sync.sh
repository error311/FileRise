# === Update FileRise to v1.9.1 (safe rsync) ===
set -euo pipefail

VER="v1.9.1"
ASSET="FileRise-${VER}.zip"          # If the asset name is different, set it exactly (e.g. FileRise-v1.9.0.zip)
WEBROOT="/var/www"
TMP="/tmp/filerise-update"

# 0) (optional) quick backup of critical bits
stamp="$(date +%F-%H%M)"
mkdir -p /root/backups
tar -C "$WEBROOT" -czf "/root/backups/filerise-$stamp.tgz" \
  public/.htaccess config users uploads metadata || true
echo "Backup saved to /root/backups/filerise-$stamp.tgz"

# 1) Fetch the release zip
rm -rf "$TMP" && mkdir -p "$TMP"
curl -L "https://github.com/error311/FileRise/releases/download/${VER}/${ASSET}" -o "$TMP/$ASSET"

# 2) Unzip to a staging dir
unzip -q "$TMP/$ASSET" -d "$TMP"
STAGE_DIR="$(find "$TMP" -maxdepth 1 -type d -name 'FileRise*' ! -path "$TMP" | head -n1 || true)"
[ -n "${STAGE_DIR:-}" ] || STAGE_DIR="$TMP"

# 3) Sync code into /var/www
#    - keep public/.htaccess
#    - keep data dirs and current config.php
rsync -a --delete \
  --exclude 'public/.htaccess' \
  --exclude 'uploads/***' \
  --exclude 'users/***' \
  --exclude 'metadata/***' \
  --exclude 'config/config.php' \
  --exclude '.github/***' \
  --exclude 'docker-compose.yml' \
  "$STAGE_DIR"/ "$WEBROOT"/

# 4) Ownership (Ubuntu/Debian w/ Apache)
chown -R www-data:www-data "$WEBROOT"

# 5) (optional) Composer autoload optimization if composer is available
if command -v composer >/dev/null 2>&1; then
  cd "$WEBROOT"
  composer install --no-dev --optimize-autoloader
fi

# 6) Reload Apache
systemctl reload apache2

echo "✅ FileRise updated to ${VER} (code). Data and public/.htaccess preserved."