#!/usr/bin/env bash
# usage: scripts/stamp-assets.sh v1.6.12 /path/to/target/dir
set -euo pipefail
VER="${1:?usage: stamp-assets.sh vX.Y.Z target_dir}"
QVER="${VER#v}"
TARGET="${2:-.}"

cd "$TARGET"

# Build file lists. Prefer git ls-files if we're in a repo, else use find.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  mapfile -t HTML_CSS < <(git ls-files -- 'public/*.html' 'public/**/*.html' 'public/*.php' 'public/**/*.css' || true)
  mapfile -t JSFILES  < <(git ls-files -- 'public/*.js' 'public/**/*.js' 'js/*.js' 'js/**/*.js' || true)
else
  mapfile -t HTML_CSS < <(find public -type f \( -name '*.html' -o -name '*.php' -o -name '*.css' \) -print 2>/dev/null || true)
  mapfile -t JSFILES  < <(find public js -type f -name '*.js' -print 2>/dev/null || true)
fi

# HTML/CSS/PHP: stamp ?v=... and {{APP_VER}}
for f in "${HTML_CSS[@]}"; do
  sed -E -i "s/(\?v=)[^\"'&<>\s]*/\1${QVER}/g" "$f"
  sed -E -i "s/\{\{APP_VER\}\}/${VER}/g" "$f"
done

# JS: stamp placeholders and normalize any pre-existing ?v=...
for f in "${JSFILES[@]}"; do
  sed -E -i "s/\{\{APP_VER\}\}/${VER}/g" "$f"
  sed -E -i "s/\{\{APP_QVER\}\}/${QVER}/g" "$f"
  perl -0777 -i -pe "s@(\.m?js)\?v=[^\"')]+@\1?v=${QVER}@g" "$f"
done

# Optional: version.js fallback update
if [[ -f public/js/version.js ]]; then
  sed -E -i "s/(APP_VERSION\s*=\s*['\"])v[^'\"]+(['\"])/\1${VER}\2/" public/js/version.js
fi

echo "Stamped assets in ${TARGET} to ${VER} (${QVER})"