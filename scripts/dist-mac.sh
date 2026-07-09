#!/bin/sh
# Build a macOS arm64 DMG.
# With a "Developer ID Application" identity in the keychain: electron-builder signs
# the app (hardened runtime + build/entitlements.mac.plist), then the DMG is signed,
# notarized (notarytool) and stapled — Gatekeeper-clean for distribution.
# Without one: ad-hoc signed test build (arm64 must be signed to run at all).
#
# Notary credentials: keychain profile "kcc-notary" (xcrun notarytool
# store-credentials), overridable via KCC_NOTARY_PROFILE. CI instead sets
# APPLE_API_KEY (path to .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER.
# KCC_SKIP_NOTARIZE=1 skips notarization for a quick signed local build.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APPNAME="Krunker Civilian Client"
VERSION="$(node -p "require('./package.json').version")"
OUTAPP="out/mac-arm64/$APPNAME.app"
DMG="out/$APPNAME-$VERSION-mac-arm64.dmg"

IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"')"

echo "[dist-mac] building renderer/main bundles..."
npm run build

if [ -n "$IDENTITY" ]; then
    echo "[dist-mac] packaging + signing as: $IDENTITY"
    npx electron-builder --mac --dir
    codesign --verify --deep --strict "$OUTAPP" && echo "[dist-mac] signature valid"
else
    echo "[dist-mac] no Developer ID identity — packaging unsigned, ad-hoc signing (test build)..."
    CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir
    codesign --force --deep --sign - "$OUTAPP"
    codesign --verify --deep "$OUTAPP" && echo "[dist-mac] ad-hoc signature valid"
fi

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

if [ -n "$IDENTITY" ] && [ -z "$KCC_SKIP_NOTARIZE" ]; then
    codesign --sign "$IDENTITY" "$DMG"
    echo "[dist-mac] notarizing (uploads to Apple, takes a few minutes)..."
    NOTARY_OUT="$(mktemp)"
    if [ -n "$APPLE_API_KEY" ]; then
        xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" \
            --issuer "$APPLE_API_ISSUER" --wait 2>&1 | tee "$NOTARY_OUT"
    else
        xcrun notarytool submit "$DMG" --keychain-profile "${KCC_NOTARY_PROFILE:-kcc-notary}" \
            --wait 2>&1 | tee "$NOTARY_OUT"
    fi
    if ! grep -q "status: Accepted" "$NOTARY_OUT"; then
        SUBMISSION_ID="$(grep -m1 "id:" "$NOTARY_OUT" | awk '{print $2}')"
        echo "[dist-mac] NOTARIZATION FAILED — fetching log for $SUBMISSION_ID..."
        if [ -n "$APPLE_API_KEY" ]; then
            xcrun notarytool log "$SUBMISSION_ID" --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER"
        else
            xcrun notarytool log "$SUBMISSION_ID" --keychain-profile "${KCC_NOTARY_PROFILE:-kcc-notary}"
        fi
        rm -f "$NOTARY_OUT"
        exit 1
    fi
    rm -f "$NOTARY_OUT"
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG" && echo "[dist-mac] notarized + stapled"
    spctl --assess --type open --context context:primary-signature -v "$DMG" && echo "[dist-mac] Gatekeeper: accepted"
elif [ -n "$IDENTITY" ]; then
    echo "[dist-mac] KCC_SKIP_NOTARIZE set — signed but NOT notarized (do not distribute)"
fi

echo "[dist-mac] done: $DMG ($(du -h "$DMG" | cut -f1))"
