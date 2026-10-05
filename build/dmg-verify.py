"""Check the finished DMG's Finder layout (used by scripts/dist-mac.sh).

dmgbuild doesn't fail when a layout step goes wrong (it ignores SetFile's exit
code, for one), so this fails the build instead of shipping a window without
its background, volume icon or icon positions.

    python build/dmg-verify.py /Volumes/<name> "<app name>.app"
"""
import os
import subprocess
import sys

from ds_store import DSStore, store
from mac_alias import Alias

mount, app = sys.argv[1], sys.argv[2]
errors = []

for name in (".background.tiff", ".VolumeIcon.icns"):
    if not os.path.isfile(os.path.join(mount, name)):
        errors.append(f"{name} missing from the volume")

# The volume icon only shows when the root carries kHasCustomIcon (0x0400),
# stored in the Finder flags at bytes 8-9 of its FinderInfo.
info = subprocess.run(
    ["/usr/bin/xattr", "-px", "com.apple.FinderInfo", mount], capture_output=True, text=True
).stdout
info = bytes.fromhex("".join(info.split()))
if len(info) < 10 or not int.from_bytes(info[8:10], "big") & 0x0400:
    errors.append("volume root lacks the custom-icon flag")

# Read 'pBBk' raw: it should be absent, and decoding a foreign one could throw.
store.codecs.pop(b"pBBk", None)
with DSStore.open(os.path.join(mount, ".DS_Store"), "r") as d:
    entries = [(e.filename, e.code, e.value) for e in d]
root = {code: value for filename, code, value in entries if filename == "."}
positioned = {filename for filename, code, _ in entries if code == b"Iloc"}

icvp = root.get(b"icvp") or {}
alias_bytes = icvp.get("backgroundImageAlias")
if icvp.get("backgroundType") != 2 or not alias_bytes:
    errors.append("window background isn't set to the image alias")
else:
    # It must point at the background, recorded at the volume's own mount point
    # (not "/Volumes/<name> 1" from a same-named volume mounted during the build).
    alias = Alias.from_bytes(alias_bytes)
    if alias.target.filename != ".background.tiff":
        errors.append(f"background alias points at {alias.target.filename!r}")
    if alias.volume.posix_path != "/Volumes/" + alias.volume.name:
        errors.append(f"background alias recorded mount point {alias.volume.posix_path!r}")
if b"pBBk" in root:
    errors.append("'pBBk' bookmark present (macOS 26 Finder uses it instead of the alias)")
for name in (app, "Applications"):
    if name not in positioned:
        errors.append(f"no icon position for {name}")

if errors:
    sys.exit("[dmg-verify] " + "; ".join(errors))
print("[dmg-verify] background alias, volume icon and icon positions OK")
