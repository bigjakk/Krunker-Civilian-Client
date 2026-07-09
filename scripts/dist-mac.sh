#!/bin/sh
# Build a macOS arm64 DMG: electron-builder --dir, ad-hoc sign, then hdiutil.
# For distribution, use a Developer ID cert + hardenedRuntime + notarize instead.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APPNAME="Krunker Civilian Client"
VERSION="$(node -p "require('./package.json').version")"
OUTAPP="out/mac-arm64/$APPNAME.app"
DMG="out/$APPNAME-$VERSION-mac-arm64.dmg"

echo "[dist-mac] building renderer/main bundles..."
npm run build

echo "[dist-mac] packaging app (electron-builder --dir, no dmg download)..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir

echo "[dist-mac] ad-hoc signing (arm64 must be signed to run)..."
codesign --force --deep --sign - "$OUTAPP"
codesign --verify --deep "$OUTAPP" && echo "[dist-mac] signature valid"

echo "[dist-mac] building DMG via hdiutil..."
STAGE="$(mktemp -d)"
ditto "$OUTAPP" "$STAGE/$APPNAME.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
# hdiutil create intermittently fails with "Resource busy" on GitHub macOS
# runners (why electron-builder's dmg-builder retries it) — retry up to 3x.
ok=""
for attempt in 1 2 3; do
    if hdiutil create -volname "$APPNAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null; then
        ok=1
        break
    fi
    echo "[dist-mac] hdiutil create failed (attempt $attempt/3), retrying in 5s..."
    sleep 5
done
[ -n "$ok" ] || { echo "[dist-mac] hdiutil create failed after 3 attempts"; rm -rf "$STAGE"; exit 1; }
rm -rf "$STAGE"

echo "[dist-mac] done: $DMG ($(du -h "$DMG" | cut -f1))"
