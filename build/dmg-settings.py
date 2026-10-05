# dmgbuild settings for the macOS DMG (used by scripts/dist-mac.sh).
# dmgbuild writes the Finder layout (.DS_Store) itself, so it needs no Finder or
# GUI session and behaves the same locally and on CI runners.
#
# Pass the packaged app with:  -D app=/path/to/Krunker Civilian Client.app
# Paths are repo-relative: dist-mac.sh runs dmgbuild from the repo root.
# Icon slots must line up with the cards and arrow in build/dmg-background.png.
import os.path

app = defines["app"]  # noqa: F821
appname = os.path.basename(app)

format = "UDZO"
compression_level = 9
filesystem = "HFS+"

files = [app]
symlinks = {"Applications": "/Applications"}

# Mounted-volume icon. dmgbuild sets the custom-icon bit on the volume root.
icon = "build/icon.icns"

# dmgbuild picks up dmg-background@2x.png alongside and makes a HiDPI TIFF.
background = "build/dmg-background.png"

window_rect = ((200, 120), (660, 428))  # 400px content + title bar
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
show_icon_preview = False
include_icon_view_settings = True

icon_size = 128
text_size = 13
arrange_by = None
icon_locations = {
    appname: (170, 235),
    "Applications": (490, 235),
}
