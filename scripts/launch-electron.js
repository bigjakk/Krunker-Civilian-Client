'use strict';

// Cross-platform Electron launcher. On Linux, injects --ozone-platform=x11
// to force XWayland. Required because Chromium's native Wayland pointer-
// constraints implementation breaks pointer lock on multi-monitor setups
// (cursor escapes the window mid-game, breaking FPS aim), and ANGLE on
// native Wayland segfaults the GPU process on NVIDIA proprietary during
// command-buffer creation. XWayland uses XGrabPointer + GLX which both work.
//
// app.commandLine.appendSwitch('ozone-platform', ...) is silently ignored —
// Chromium parses --ozone-platform during early C++ startup, before any JS
// runs. The flag must be on the launcher's CLI from the very first invocation.

const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const args = ['.'];
if (process.platform === 'linux') {
    args.unshift('--ozone-platform=x11');
}
// pass through any extra args from the npm caller
args.push(...process.argv.slice(2));

const child = spawn(electron, args, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
child.on('exit', (code) => process.exit(code ?? 0));
