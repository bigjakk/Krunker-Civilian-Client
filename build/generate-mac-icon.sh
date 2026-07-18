#!/bin/bash
# Generate the macOS app icon (build/icon.icns) from the full-bleed master.
#
# macOS 26 (Tahoe) masks every app icon into a rounded "Liquid Glass" tile and,
# for an icon with transparency, shrinks it and paints a light tile behind it.
# So the mac icon uses an opaque, full-bleed background (kcc_icon_1024_mac.png)
# rather than the transparent shield used for Windows/Linux
# (kcc_icon_1024_tight.png -> icon.ico / icon.png). Ship a full square; macOS
# rounds the corners itself, so pre-rounding here would only misfire on older
# macOS and re-expose the light tile on Tahoe.
#
# Requires macOS (sips + iconutil).
set -euo pipefail
cd "$(dirname "$0")"

SRC="kcc_icon_1024_mac.png"
SET="icon.iconset"

rm -rf "$SET"
mkdir "$SET"
sips -z 16 16   "$SRC" --out "$SET/icon_16x16.png"      >/dev/null
sips -z 32 32   "$SRC" --out "$SET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32   "$SRC" --out "$SET/icon_32x32.png"      >/dev/null
sips -z 64 64   "$SRC" --out "$SET/icon_32x32@2x.png"   >/dev/null
sips -z 128 128 "$SRC" --out "$SET/icon_128x128.png"    >/dev/null
sips -z 256 256 "$SRC" --out "$SET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC" --out "$SET/icon_256x256.png"    >/dev/null
sips -z 512 512 "$SRC" --out "$SET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC" --out "$SET/icon_512x512.png"    >/dev/null
cp "$SRC" "$SET/icon_512x512@2x.png"
iconutil -c icns "$SET" -o icon.icns
rm -rf "$SET"
echo "Wrote icon.icns from $SRC"
