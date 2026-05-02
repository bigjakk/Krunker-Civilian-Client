'use strict';

// electron-builder afterPack hook (Linux): wrap the Electron binary so
// --ozone-platform=x11 and the right sandbox flag land on argv before
// Chromium's early C++ init parses them. app.commandLine.appendSwitch in
// main.js runs too late; electron-builder's linux.executableArgs only covers
// AppRun and the .desktop Exec line, so wrapping the binary itself is the
// only place that catches every entry point reliably.
//
// Sandbox: AppImage's chrome-sandbox can't be SUID root (FUSE mount is
// user-owned + nosuid), so we prefer the namespace sandbox via
// --disable-setuid-sandbox and fall back to --no-sandbox only if unprivileged
// userns with uid mapping is blocked (Ubuntu 24+ AppArmor restriction or
// kernels with userns disabled). Userscripts run in the renderer, so keeping
// renderer isolation matters when the kernel allows it.

const fs = require('fs');
const path = require('path');

const WRAPPER = `#!/bin/sh
SELF=$(dirname "$(readlink -f "$0")")/krunker-civilian-client-bin

# Chromium child processes (renderer/gpu/utility) — pass through unchanged.
for arg in "$@"; do
  case "$arg" in --type=*) exec "$SELF" "$@" ;; esac
done

if unshare -U --map-root-user /bin/true >/dev/null 2>&1; then
  SANDBOX=--disable-setuid-sandbox
else
  echo "[KCC] userns blocked; --no-sandbox fallback. To restore sandboxing: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0" >&2
  SANDBOX=--no-sandbox
fi

exec "$SELF" --ozone-platform=x11 "$SANDBOX" "$@"
`;

exports.default = async ({ electronPlatformName, appOutDir }) => {
    if (electronPlatformName !== 'linux') return;
    const orig = path.join(appOutDir, 'krunker-civilian-client');
    const renamed = orig + '-bin';
    if (!fs.existsSync(orig)) throw new Error(`afterPack-linux: ${orig} not found`);
    if (fs.existsSync(renamed)) fs.unlinkSync(renamed);
    fs.renameSync(orig, renamed);
    fs.writeFileSync(orig, WRAPPER, { mode: 0o755 });
    console.log('[afterPack-linux] wrapped binary (--ozone-platform=x11 + sandbox handling)');
};
