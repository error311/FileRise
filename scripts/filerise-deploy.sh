#!/usr/bin/env bash
# FileRise release deployer
# /usr/local/bin/filerise-deploy.sh and chmod +x /usr/local/bin/filerise-deploy.sh
# Usage:
#   filerise-deploy.sh [vX.Y.Z|latest] [force]
# Examples:
#   filerise-deploy.sh latest
#   filerise-deploy.sh v1.7.4
#   filerise-deploy.sh 1.7.4 force

set -euo pipefail

REPO="error311/FileRise"
DEST="/var/www"
OWNER="www-data:www-data"   # change if your web user differs (e.g., apache:apache)
PHPFPM_SERVICES=(php8.4-fpm php8.3-fpm php8.2-fpm php8.1-fpm php8.0-fpm)

TAG_INPUT="${1:-latest}"
FORCE="${2:-}"

EXCLUDES=(
  "--exclude=uploads"
  "--exclude=uploads/**"
  "--exclude=users"
  "--exclude=users/**"
  "--exclude=metadata"
  "--exclude=metadata/**"
  "--exclude=vendor"
  "--exclude=vendor/**"
  "--exclude=config/config.php"
  "--exclude=.env"
)

die() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

need curl
need unzip
need rsync

if [[ ! -d "$DEST" ]]; then
  die "DEST '$DEST' does not exist. Create it or set DEST variable in script."
fi

create_dir() {
  local sub="$1"
  install -d -m 2775 -o "${OWNER%:*}" -g "${OWNER#*:}" "${DEST}/${sub}"
  chmod g+s "${DEST}/${sub}" || true
}

ensure_writable_dirs() {
  create_dir uploads
  create_dir users
  create_dir metadata
}

normalize_tag() {
  local t="$1"
  [[ "$t" =~ ^v ]] && echo "$t" || echo "v${t}"
}

# --- pick release tag ---
if [[ "$TAG_INPUT" == "latest" ]]; then
  TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')" || die "Could not resolve latest tag"
else
  TAG="$(normalize_tag "$TAG_INPUT")"
fi
[[ -n "$TAG" ]] || die "Empty tag resolved."

# Skip if already on this version unless 'force'
if [[ -f "${DEST}/.filerise_version" ]] && grep -qx "${TAG}" "${DEST}/.filerise_version" && [[ "$FORCE" != "force" ]]; then
  echo "FileRise ${TAG} already installed; nothing to do."
  exit 0
fi

ensure_writable_dirs

ZIP_NAME="FileRise-${TAG}.zip"
ZIP_URL="https://github.com/${REPO}/releases/download/${TAG}/${ZIP_NAME}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Downloading ${ZIP_URL} …"
curl -fL --retry 3 -o "${WORKDIR}/${ZIP_NAME}" "${ZIP_URL}" || die "Download failed"

echo "Unzipping…"
unzip -q "${WORKDIR}/${ZIP_NAME}" -d "${WORKDIR}/unz" || die "Unzip failed"

# Determine source root inside the zip (prefer a directory with public/)
SRC_DIR=""
if [[ -d "${WORKDIR}/unz/public" ]]; then
  SRC_DIR="${WORKDIR}/unz"
else
  # find first top-level dir that contains public/
  while IFS= read -r -d '' d; do
    if [[ -d "$d/public" ]]; then SRC_DIR="$d"; break; fi
  done < <(find "${WORKDIR}/unz" -mindepth 1 -maxdepth 1 -type d -print0)

  # fallback: if nothing has public/, use unz root
  SRC_DIR="${SRC_DIR:-${WORKDIR}/unz}"
fi

echo "Using source root: ${SRC_DIR}"
echo "  - $(ls -1 ${SRC_DIR} | tr '\n' ' ')"
echo

# Sync to DEST while preserving data/secret bits
echo "Rsync → ${DEST} …"
rsync -a --delete "${EXCLUDES[@]}" "${SRC_DIR}/" "${DEST}/"

# Stamp version file
echo "${TAG}" > "${DEST}/.filerise_version"

# Ensure writable dirs stay correct (even if rsync changed perms on parents)
chown -R "${OWNER}" "${DEST}/uploads" "${DEST}/users" "${DEST}/metadata"
chmod -R u+rwX,g+rwX "${DEST}/uploads" "${DEST}/users" "${DEST}/metadata"
find "${DEST}/uploads" "${DEST}/users" "${DEST}/metadata" -type d -exec chmod g+s {} + || true

# --- Composer dependencies (install only if needed) ---
install_composer_deps() {
  need composer
  echo "Installing Composer deps in ${DEST}…"
  # optimize + authoritative for prod
  sudo -u "${OWNER%:*}" env COMPOSER_HOME="${DEST}" composer install \
    --no-dev --prefer-dist --no-interaction --no-progress \
    --optimize-autoloader --classmap-authoritative \
    -d "${DEST}"
  # record lock hash to trigger re-install only when lock changes
  if [[ -f "${DEST}/composer.lock" ]]; then
    sha256sum "${DEST}/composer.lock" | awk '{print $1}' > "${DEST}/.vendor_lock_hash"
  fi
}

should_install_vendor() {
  # no vendor dir → install
  [[ ! -d "${DEST}/vendor" ]] && return 0
  # empty vendor → install
  [[ -z "$(ls -A "${DEST}/vendor" 2>/dev/null || true)" ]] && return 0
  # if composer.lock exists and hash differs from last install → install
  if [[ -f "${DEST}/composer.lock" ]]; then
    local cur prev
    cur="$(sha256sum "${DEST}/composer.lock" | awk '{print $1}')"
    prev="$(cat "${DEST}/.vendor_lock_hash" 2>/dev/null || true)"
    [[ "$cur" != "$prev" ]] && return 0
  fi
  return 1
}

if should_install_vendor; then
  install_composer_deps
else
  echo "Composer deps already up to date."
fi

# Reload PHP-FPM (clear opcache) if present
for svc in "${PHPFPM_SERVICES[@]}"; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo "Reloading ${svc} …"
    systemctl reload "$svc" || true
    break
  fi
done

# Reload Apache if present
if systemctl is-active --quiet apache2 2>/dev/null; then
  echo "Reloading apache2 …"
  systemctl reload apache2 || true
fi

# Quick sanity check: DocumentRoot should contain index
if [[ ! -f "${DEST}/public/index.html" && ! -f "${DEST}/public/index.php" ]]; then
  echo "WARN: ${DEST}/public/index.(html|php) not found. Verify your release layout & DocumentRoot (${DEST}/public)."
fi

echo "Deployed FileRise ${TAG} → ${DEST}"