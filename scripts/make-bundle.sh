#!/usr/bin/env bash
# Make a single-file backup of the whole code history (a "git bundle").
# Restore anywhere with:  git clone body-regeneration-method-<date>.bundle body-regeneration-method
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR="${1:-bundles}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/body-regeneration-method-$(date -u +%Y-%m-%d-%H%M)-$(git rev-parse --short HEAD).bundle"
git bundle create "$FILE" --all
git bundle verify "$FILE" >/dev/null
echo "✓ $FILE ($(du -h "$FILE" | cut -f1))"
