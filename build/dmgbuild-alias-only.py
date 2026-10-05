"""Run dmgbuild without its 'pBBk' background bookmark (used by scripts/dist-mac.sh).

dmgbuild 1.6.5 records the window background twice in .DS_Store: as an alias
(icvp backgroundImageAlias) and as a 'pBBk' bookmark. Its pure-Python bookmark
stores volume-relative paths that macOS 26 Finder can't resolve, and when 'pBBk'
is present Finder doesn't fall back to the alias, so the window renders white.
Upstream dropped 'pBBk' in dmgbuild 1.6.7 (dmgbuild#273, #275), which needs
Python >= 3.10; this does the same on 1.6.5. Every macOS version reads the alias.

Takes dmgbuild's normal command-line arguments.
"""
import sys

import dmgbuild.core
from dmgbuild.__main__ import main


class _NoBookmark:
    @staticmethod
    def for_file(path):
        return None


dmgbuild.core.Bookmark = _NoBookmark
sys.exit(main())
