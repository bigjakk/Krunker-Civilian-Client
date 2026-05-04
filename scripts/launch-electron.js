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

// NVIDIA proprietary driver env vars — only applied if we're on NVIDIA.
// __GL_SYNC_TO_VBLANK=0 disables driver-level vsync (Chromium's --disable-gpu-vsync
// only reaches Chromium's compositor, not the underlying GLX/EGL swap). On
// XWayland this is the closest analogue to Windows D3D11's flip-discard.
// __GL_THREADED_OPTIMIZATIONS=1 enables the NVIDIA driver's threaded GL command
// submission, which significantly reduces CPU overhead on the GPU process at
// high frame rates.
const env = { ...process.env };
if (process.platform === 'linux') {
    args.unshift('--ozone-platform=x11');
    env.__GL_SYNC_TO_VBLANK = '0';
    env.__GL_THREADED_OPTIMIZATIONS = '1';
}
// pass through any extra args from the npm caller
args.push(...process.argv.slice(2));

const child = spawn(electron, args, { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), env });
child.on('exit', (code) => process.exit(code ?? 0));
