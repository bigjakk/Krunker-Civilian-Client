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
# KCC_REQUIRE_SIGNED=1 (CI release builds) forbids the ad-hoc fallback — fail
# rather than ship a DMG that Gatekeeper would reject on every download.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APPNAME="Krunker Civilian Client"
VERSION="$(node -p "require('./package.json').version")"
OUTAPP="out/mac-arm64/$APPNAME.app"
DMG="out/$APPNAME-$VERSION-mac-arm64.dmg"

IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"')"

# A published release must be properly signed — an ad-hoc DMG trips Gatekeeper
# on the user's machine when they open the download.
if [ -n "$KCC_REQUIRE_SIGNED" ]; then
    if [ -z "$IDENTITY" ]; then
        echo "[dist-mac] ERROR: KCC_REQUIRE_SIGNED is set but no 'Developer ID Application' identity is available — refusing to build an ad-hoc-signed release artifact." >&2
        exit 1
    fi
    if [ -n "$KCC_SKIP_NOTARIZE" ]; then
        echo "[dist-mac] ERROR: KCC_REQUIRE_SIGNED and KCC_SKIP_NOTARIZE are mutually exclusive — a release artifact must be notarized." >&2
        exit 1
    fi
fi

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
# Give the mounted volume the app icon instead of the generic disk-image icon.
# Finder uses a .VolumeIcon.icns at the volume root, but only when the root also
# carries the "custom icon" attribute — and hdiutil create -srcfolder drops that
# attribute. So build a read-write image, set the bit on the live volume, then
# convert to a compressed read-only image (the conversion preserves the bit).
cp build/icon.icns "$STAGE/.VolumeIcon.icns"
SETFILE="$(xcrun -f SetFile 2>/dev/null || true)"
RWDIR="$(mktemp -d)"; RW="$RWDIR/rw.dmg"
rm -f "$DMG"
# hdiutil create intermittently fails with "Resource busy" on GitHub macOS
# runners (why electron-builder's dmg-builder retries it) — retry up to 3x.
ok=""
for attempt in 1 2 3; do
    if hdiutil create -volname "$APPNAME" -srcfolder "$STAGE" -ov -format UDRW -fs HFS+ "$RW" >/dev/null; then
        ok=1
        break
    fi
    echo "[dist-mac] hdiutil create failed (attempt $attempt/3), retrying in 5s..."
    sleep 5
done
[ -n "$ok" ] || { echo "[dist-mac] hdiutil create failed after 3 attempts"; rm -rf "$STAGE" "$RWDIR"; exit 1; }
rm -rf "$STAGE"
if [ -n "$SETFILE" ]; then
    MP="$(hdiutil attach "$RW" -nobrowse -readwrite | grep -o '/Volumes/.*$' | head -1)"
    "$SETFILE" -a C "$MP"
    hdiutil detach "$MP" >/dev/null 2>&1 || hdiutil detach "$MP" -force >/dev/null 2>&1
else
    echo "[dist-mac] WARNING: SetFile unavailable — mounted DMG keeps the generic volume icon"
fi
hdiutil convert "$RW" -format UDZO -o "$DMG" >/dev/null
rm -rf "$RWDIR"

# notarytool with whichever creds are set (CI API key vs local keychain profile),
# in one place so submit and the log fetch can't drift apart.
notary() {
    if [ -n "$APPLE_API_KEY" ]; then
        xcrun notarytool "$@" --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER"
    else
        xcrun notarytool "$@" --keychain-profile "${KCC_NOTARY_PROFILE:-kcc-notary}"
    fi
}

# Extract a field from notarytool's JSON output; empty on parse failure.
notary_field() {
    node -p "try{JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))[process.argv[2]]||''}catch(e){''}" "$1" "$2"
}

if [ -n "$IDENTITY" ] && [ -z "$KCC_SKIP_NOTARIZE" ]; then
    codesign --sign "$IDENTITY" "$DMG"
    echo "[dist-mac] notarizing (uploads to Apple, takes a few minutes)..."
    NOTARY_JSON="$(mktemp)"
    # Machine-readable result instead of grepping prose. notarytool's exit code is
    # unreliable (0 even on status Invalid), so decide on the parsed status; `|| true`
    # keeps set -e from killing us before we can report a submit/auth failure.
    notary submit "$DMG" --wait --output-format json > "$NOTARY_JSON" || true
    STATUS="$(notary_field "$NOTARY_JSON" status)"
    SUBMISSION_ID="$(notary_field "$NOTARY_JSON" id)"
    if [ "$STATUS" != "Accepted" ]; then
        echo "[dist-mac] NOTARIZATION FAILED (status: ${STATUS:-none})"
        cat "$NOTARY_JSON"
        rm -f "$NOTARY_JSON"
        if [ -n "$SUBMISSION_ID" ]; then
            echo "[dist-mac] fetching notarization log for $SUBMISSION_ID..."
            notary log "$SUBMISSION_ID" || true
        else
            echo "[dist-mac] no submission id — submit failed before upload (credentials or network); see notarytool output above"
        fi
        exit 1
    fi
    rm -f "$NOTARY_JSON"
    echo "[dist-mac] notarization accepted (id: $SUBMISSION_ID)"
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG" && echo "[dist-mac] notarized + stapled"
    spctl --assess --type open --context context:primary-signature -v "$DMG" && echo "[dist-mac] Gatekeeper: accepted"
elif [ -n "$IDENTITY" ]; then
    echo "[dist-mac] KCC_SKIP_NOTARIZE set — signed but NOT notarized (do not distribute)"
fi

echo "[dist-mac] done: $DMG ($(du -h "$DMG" | cut -f1))"
