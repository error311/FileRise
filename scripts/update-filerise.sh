#!/usr/bin/env bash
# Update FileRise in /var/www from a GitHub release ZIP
set -Eeuo pipefail

# Usage: ./update-filerise.sh v2.5.2
VERSION="${1:-v2.5.2}"
ASSET="FileRise-${VERSION}.zip"

WEBROOT="/var/www"
TMP="/tmp/filerise-update"

echo "Updating FileRise in ${WEBROOT} to ${VERSION}"

# 0) Backup config + data
stamp="$(date +%F-%H%M)"
mkdir -p /root/backups
tar -C "$WEBROOT" -czf "/root/backups/filerise-$stamp.tgz"   config   uploads   users   metadata || true
echo "Backup saved to /root/backups/filerise-$stamp.tgz"

# 1) Fetch the release zip
rm -rf "$TMP"
mkdir -p "$TMP"
curl -fsSL "https://github.com/error311/FileRise/releases/download/${VERSION}/${ASSET}" -o "$TMP/$ASSET"

# 2) Unzip to a staging dir
unzip -q "$TMP/$ASSET" -d "$TMP"
STAGE_DIR="$(find "$TMP" -maxdepth 1 -type d -name 'FileRise*' ! -path "$TMP" | head -n1 || true)"
[ -n "${STAGE_DIR:-}" ] || STAGE_DIR="$TMP"

# 3) Sync code into /var/www
#    - keep existing config/config.php
#    - keep data dirs (uploads/users/metadata)
#    - don't sync CI/docker stuff
rsync -a --delete   --exclude='config/config.php'   --exclude='uploads/***'   --exclude='users/***'   --exclude='metadata/***'   --exclude='.github/***'   --exclude='docker-compose.yml'   "$STAGE_DIR"/ "$WEBROOT"/

# 4) Ownership (Ubuntu/Debian w/ Apache)
chown -R www-data:www-data "$WEBROOT"

# 5) Composer (usually not needed; release ZIP includes vendor/)
if [ ! -d "$WEBROOT/vendor" ] && command -v composer >/dev/null 2>&1; then
  (cd "$WEBROOT" && composer install --no-dev --optimize-autoloader)
fi

echo "FileRise updated to ${VERSION} in ${WEBROOT}"