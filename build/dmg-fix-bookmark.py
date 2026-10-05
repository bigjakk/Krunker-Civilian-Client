"""Replace dmgbuild's background bookmark with one macOS generates itself.

dmgbuild writes the window background's 'pBBk' bookmark with a pure-Python
reimplementation that macOS 26 (Tahoe) Finder can't resolve, so the window
renders plain white. A bookmark from Foundation (NSURL) resolves on Tahoe and
needs no Finder/GUI session, so it works on CI too.

Run with dmgbuild's Python against the mounted read-write volume:
    python build/dmg-fix-bookmark.py /Volumes/<name>
"""
import base64
import glob
import os
import subprocess
import sys

from ds_store import DSStore, store

mount = sys.argv[1]
backgrounds = glob.glob(os.path.join(mount, ".background.*"))
if len(backgrounds) != 1:
    sys.exit(f"expected one .background.* in {mount}, found {backgrounds}")

jxa = """
ObjC.import('Foundation');
function run(argv) {
  var url = $.NSURL.fileURLWithPath(argv[0]);
  var data = url.bookmarkDataWithOptionsIncludingResourceValuesForKeysRelativeToURLError(0, $(), $(), null);
  return data.base64EncodedStringWithOptions(0).js;
}
"""
out = subprocess.run(
    ["osascript", "-l", "JavaScript", "-e", jxa, backgrounds[0]],
    check=True, capture_output=True, text=True,
).stdout.strip()
bookmark = base64.b64decode(out)
if not bookmark.startswith(b"book"):
    sys.exit("NSURL returned no bookmark data")

# Store the raw bytes instead of round-tripping through mac_alias's Bookmark codec.
store.codecs.pop(b"pBBk", None)
with DSStore.open(os.path.join(mount, ".DS_Store"), "r+") as d:
    d["."]["pBBk"] = ("blob", bookmark)
print(f"[dmg-fix-bookmark] pBBk -> {os.path.basename(backgrounds[0])} ({len(bookmark)} bytes)")
