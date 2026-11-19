#!/usr/bin/env bash
# Re-runnable: resizes source photos and strips all metadata (EXIF/GPS).
# Needs macOS `sips` and ffmpeg. Temp files live outside the repo.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/assets/img"
PORTRAITS="/Users/timmuangkeo/Desktop/code/ttmuangkeo.github.io/.superpowers/portraits"
SOCIAL="/Users/timmuangkeo/Desktop/social"
FFMPEG="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"
Q=4   # ffmpeg -q:v (lower = better); ~JPEG quality 70-75

# src:dest:maxpx
ENTRIES=(
  "$PORTRAITS/dome.jpg:tim-dome.jpg:1600"
  "$PORTRAITS/beach.jpg:tim-beach.jpg:1200"
  "$PORTRAITS/basalt.jpg:tim-basalt.jpg:1200"
  "$SOCIAL/DSC09724.jpg:alaska-glacier.jpg:1200"
  "$SOCIAL/TIM06627.jpg:alaska-fjord.jpg:1200"
  "$SOCIAL/TIM06311.jpg:alaska-door.jpg:1200"
  "$SOCIAL/DJI_20260807124911_0141_D.jpg:rainier.jpg:1200"
  "$SOCIAL/DSC04510-HDR.jpg:rig.jpg:1200"
  "$SOCIAL/DSC04043.jpg:trucks.jpg:1200"
  "$SOCIAL/DSC04201.jpg:milky-way.jpg:1200"
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

for entry in "${ENTRIES[@]}"; do
  IFS=: read -r src dest maxpx <<<"$entry"
  tmp="$TMP/$dest"
  sips -Z "$maxpx" "$src" --out "$tmp" >/dev/null
  "$FFMPEG" -y -loglevel error -i "$tmp" -map_metadata -1 -q:v "$Q" "$OUT/$dest"
  echo "wrote $dest"
done

# Open Graph card: 1200x630 crop of the dome portrait, shifted to keep the face.
OG_Y="${OG_Y:-60}"
sips -Z 1600 "$PORTRAITS/dome.jpg" --out "$TMP/og-src.jpg" >/dev/null
"$FFMPEG" -y -loglevel error -i "$TMP/og-src.jpg" -map_metadata -1 -q:v "$Q" \
  -vf "scale=1200:-1,crop=1200:630:0:$OG_Y" "$OUT/og.jpg"
echo "wrote og.jpg"
