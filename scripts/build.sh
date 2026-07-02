#!/usr/bin/env bash
# Package FeedHacker into an installable, unpacked-or-zipped Chrome extension.
# Copies only the runtime files (no tests, node_modules, or tooling) into dist/
# and produces dist/feedhacker-<version>.zip ready to drag onto chrome://extensions
# or to "Load unpacked" from dist/feedhacker/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist"
STAGE="$OUT/feedhacker"
ZIP="$OUT/feedhacker-$VERSION.zip"

# Runtime files that ship in the extension. Keep in sync with manifest.json.
FILES=(
  manifest.json
  background.js
  inject.js
  filters.js
  logger.js
  matcher.js
  scorer.js
  feed.js
  content.js
  popup.html
  popup.js
  options.html
  options.js
  styles.css
  claudisms.json
)

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then echo "ERROR: missing runtime file: $f" >&2; exit 1; fi
  cp "$f" "$STAGE/"
done
cp -r icons "$STAGE/icons"

( cd "$STAGE" && zip -qr "../feedhacker-$VERSION.zip" . )

echo "Built:"
echo "  unpacked: $STAGE/   (Load unpacked)"
echo "  zip:      $ZIP"
