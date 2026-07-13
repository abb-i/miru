#!/bin/sh
# Miru — sync shared source into firefox/, then package both extensions
# into dist/miru-chrome-v<version>.zip and dist/miru-firefox-v<version>.zip.
set -eu
cd "$(dirname "$0")/.."
scripts/sync.sh

version() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$1"; }
V_CHROME=$(version chrome/manifest.json)
V_FIREFOX=$(version firefox/manifest.json)
if [ "$V_CHROME" != "$V_FIREFOX" ]; then
  echo "Version mismatch: chrome/manifest.json says $V_CHROME, firefox/manifest.json says $V_FIREFOX." >&2
  echo "Bump both manifests together, then rebuild." >&2
  exit 1
fi

mkdir -p dist
for BROWSER in chrome firefox; do
  OUT="dist/miru-$BROWSER-v$V_CHROME.zip"
  rm -f "$OUT"
  (cd "$BROWSER" && zip -qrX "../$OUT" . -x '.*' -x '*/.*')
  echo "built $OUT"
done
