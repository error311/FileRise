#!/usr/bin/env bash
# usage: scripts/stamp-assets.sh vX.Y.Z /path/to/target/dir
set -euo pipefail

VER="${1:?usage: stamp-assets.sh vX.Y.Z target_dir}"
QVER="${VER#v}"
TARGET="${2:-.}"

echo "Stamping assets in: $TARGET"
echo "VER=${VER}  QVER=${QVER}"

cd "$TARGET"

# Normalize CRLF to LF (if any files were edited on Windows)
# We only touch web assets.
find public \( -name '*.html' -o -name '*.php' -o -name '*.css' -o -name '*.js' \) -type f -print0 \
  | xargs -0 -r sed -i 's/\r$//'

# --- HTML/CSS/PHP: stamp ?v=... and {{APP_VER}} ---
# (?v=...) -> ?v=<QVER>
HTML_CSS_COUNT=0
while IFS= read -r -d '' f; do
  sed -E -i "s/(\?v=)[^\"'&<>\s]*/\1${QVER}/g" "$f"
  sed -E -i "s/\{\{APP_VER\}\}/${VER}/g" "$f"
  HTML_CSS_COUNT=$((HTML_CSS_COUNT+1))
done < <(find public -type f \( -name '*.html' -o -name '*.php' -o -name '*.css' \) -print0)

# --- JS: stamp placeholders and normalize any pre-existing ?v=... ---
JS_COUNT=0
while IFS= read -r -d '' f; do
  # Replace placeholders
  sed -E -i "s/\{\{APP_VER\}\}/${VER}/g" "$f"
  sed -E -i "s/\{\{APP_QVER\}\}/${QVER}/g" "$f"
  # Normalize any "?v=..." that appear in ESM imports or strings
  # This keeps any ".js" or ".mjs" then forces ?v=<QVER>
  perl -0777 -i -pe "s@(\.m?js)\?v=[^\"')]+@\1?v=${QVER}@g" "$f"
  JS_COUNT=$((JS_COUNT+1))
done < <(find public -type f -name '*.js' -print0)

# Force-write version.js (source of truth in stamped output)
if [[ -f public/js/version.js ]]; then
  printf "window.APP_VERSION = '%s';\n" "$VER" > public/js/version.js
fi

echo "Touched files: HTML/CSS/PHP=${HTML_CSS_COUNT}, JS=${JS_COUNT}"

# Final self-check: fail if anything is left
if grep -R -n -E "{{APP_QVER}}|{{APP_VER}}" public \
   --include='*.html' --include='*.php' --include='*.css' --include='*.js' 2>/dev/null; then
  echo "ERROR: Placeholders remain after stamping." >&2
  exit 2
fi

echo "✅ Stamped to ${VER} (${QVER})"