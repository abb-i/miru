#!/bin/sh
# Miru — keep firefox/ identical to chrome/ except each browser's manifest.json.
# Edit source in chrome/, then run this (build.sh runs it for you).
set -eu
cd "$(dirname "$0")/.."
rsync -a --delete --exclude manifest.json --exclude '.DS_Store' chrome/ firefox/
