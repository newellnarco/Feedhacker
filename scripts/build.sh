#!/usr/bin/env bash
# Package FeedHacker into an installable, unpacked-or-zipped Chrome extension.
# Compiles the TypeScript sources (src/ -> build/), then assembles only the runtime
# files into dist/feedhacker/ and dist/feedhacker-<version>.zip. Load unpacked from
# dist/feedhacker/, or drag the zip onto chrome://extensions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Compiling TypeScript…"
npx tsc

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist"
STAGE="$OUT/feedhacker"
ZIP="$OUT/feedhacker-$VERSION.zip"

# Compiled JS (from build/) that ships in the extension.
JS_FILES=(
  background.js inject.js filters.js logger.js selectors.js matcher.js
  scorer.js authors.js customfilters.js feed.js content.js popup.js options.js
)
# Static assets that ship as-is from the repo root.
STATIC_FILES=(
  manifest.json popup.html options.html styles.css claudisms.json
)

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

for f in "${JS_FILES[@]}"; do
  if [[ ! -f "build/$f" ]]; then echo "ERROR: missing compiled file: build/$f" >&2; exit 1; fi
  cp "build/$f" "$STAGE/"
done
for f in "${STATIC_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then echo "ERROR: missing static file: $f" >&2; exit 1; fi
  cp "$f" "$STAGE/"
done
cp -r icons "$STAGE/icons"

( cd "$STAGE" && zip -qr "../feedhacker-$VERSION.zip" . )

# --- Windows one-click bundle: extension + installer scripts + docs ---
WIN_STAGE="$OUT/feedhacker-win"
WIN_ZIP="$OUT/feedhacker-$VERSION-win.zip"
rm -rf "$WIN_STAGE" "$WIN_ZIP"
mkdir -p "$WIN_STAGE"
cp -r "$STAGE" "$WIN_STAGE/feedhacker"        # prebuilt unpacked extension (for immediate manual load)
cp -r installer/windows "$WIN_STAGE/installer"
cp INSTALL.md "$WIN_STAGE/" 2>/dev/null || true
cat > "$WIN_STAGE/START-HERE.txt" <<'TXT'
FeedHacker for Windows
======================
Double-click  installer\install.bat  to install and set up auto-updates.
(No admin needed. It builds from GitHub, then guides a one-time "Load unpacked".)

Other scripts:
  installer\update.bat     - pull latest from GitHub and rebuild now
  installer\uninstall.bat  - remove the auto-update task (add nothing to keep files)

Prefer manual install? Open chrome://extensions, enable Developer mode,
click "Load unpacked", and pick the  feedhacker  folder in this archive.
See INSTALL.md for details.
TXT
( cd "$WIN_STAGE" && zip -qr "../feedhacker-$VERSION-win.zip" . )

echo "Built:"
echo "  unpacked:  $STAGE/   (Load unpacked)"
echo "  zip:       $ZIP"
echo "  windows:   $WIN_ZIP   (extension + installer)"
