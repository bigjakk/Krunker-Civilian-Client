import { app } from 'electron';
import type { AppConfig } from './config';

export type Platform = 'win32' | 'linux' | 'darwin';
export type GpuBackend = 'angle' | 'opengl' | 'vulkan' | 'default';

export interface PlatformInfo {
  os: Platform;
  isWindows: boolean;
  isLinux: boolean;
  useNativeTitlebar: boolean;
  gpuBackend: GpuBackend;
}

export function detectPlatform(): PlatformInfo {
  const os = process.platform as Platform;
  const isWindows = os === 'win32';
  const isLinux = os === 'linux';

  return {
    os,
    isWindows,
    isLinux,
    useNativeTitlebar: isLinux,
    gpuBackend: isWindows ? 'angle' : 'default',
  };
}

/** Canonical set of valid `angleBackend` values per platform. The settings UI dropdown must stay in sync. */
export function getValidAngleBackends(info: PlatformInfo): readonly string[] {
  return info.isWindows
    ? ['default', 'gl', 'd3d11', 'd3d11on12']
    : ['default', 'gl', 'vulkan'];
}

export function applyPlatformFlags(info: PlatformInfo, advanced: AppConfig['advanced'], performance: AppConfig['performance']): void {
  // Chromium's CommandLine stores ONE value per switch name — every
  // `appendSwitch('enable-features', X)` call overwrites the previous one.
  // Accumulate into Sets and emit a single combined value at the end.
  const enabledFeatures = new Set<string>();
  const disabledFeatures = new Set<string>();
  const enableFeatures = (...names: string[]): void => { for (const n of names) enabledFeatures.add(n); };
  const disableFeatures = (...names: string[]): void => { for (const n of names) disabledFeatures.add(n); };

  // ── FPS uncap ──
  // disable-frame-rate-limit causes compositor CPU spin on Chromium 84+, starving
  // input events. On Electron 43 (Chromium 150), this is fixed by a patch to
  // cc/scheduler/scheduler.cc in our custom Electron build.
  if (performance.fpsUnlocked) {
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('disable-gpu-vsync');
    app.commandLine.appendSwitch('max-gum-fps', '9999');
    // Opt-in deeper compositor frame queue (depth 2 vs the patched default of 1).
    // Read by the custom Electron's CustomMaxPendingFrames feature param. Off → not
    // emitted → the binary keeps its compiled default of 1. Trades input latency on
    // low-end machines for higher peak FPS on present-bound (capable) ones.
    if (performance.higherMaxFps) enableFeatures('CustomMaxPendingFrames:count/2');
  }

  // ── Always-on platform flags ──
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  // Never throttle the game while unfocused/alt-tabbed (completes the switch
  // above), and let game audio start without a first click.
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('overscroll-history-navigation', '0');
  app.commandLine.appendSwitch('pull-to-refresh', '0');
  // WebGL is mandatory for Krunker — force it past any GPU blocklist.
  // On Chromium 134+ the blocklist is stricter and silently disables WebGL on many Linux GPUs.
  app.commandLine.appendSwitch('ignore-gpu-blocklist');

  // ── ANGLE backend ──
  // 'default' means platform default: D3D11 on Windows, no override on Linux
  if (advanced.angleBackend && advanced.angleBackend !== 'default') {
    app.commandLine.appendSwitch('use-angle', advanced.angleBackend);
  } else if (info.isWindows) {
    app.commandLine.appendSwitch('use-angle', 'd3d11');
  }

  if (info.isWindows) {
    disableFeatures('CalculateNativeWinOcclusion', 'HardwareMediaKeyHandling');
  }

  if (info.isLinux) {
    // NOTE: --ozone-platform must be set on the launcher CLI — Chromium parses it
    // during early C++ startup, before our JS runs, so app.commandLine.appendSwitch
    // is silently ignored at module-load time. The x11 flag is injected by:
    //   - npm start / npm run dev → scripts/launch-electron.js
    //   - packaged AppImage → scripts/afterPack-linux.js (wrapper)
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    // GPU sandbox can fail inside AppImage FUSE mounts and on certain Mesa driver versions,
    // causing the GPU process to crash and leaving a black screen.
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    // NVIDIA proprietary doesn't implement VAAPI; if the GPU process probes libva
    // it logs `vaInitialize failed` and can segfault during command-buffer creation.
    // Krunker doesn't use HW video decode anyway, so disable defensively.
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
    app.commandLine.appendSwitch('disable-accelerated-video-encode');
    app.commandLine.appendSwitch('disable-accelerated-mjpeg-decode');
  }

  // ── Remove useless features ──
  // Pruned to switches that exist in Electron 43 — chrome-layer switches (print
  // preview, component update, metrics, hyperlink pings) are not compiled into
  // Electron and never had any effect.
  if (advanced.removeUselessFeatures) {
    app.commandLine.appendSwitch('disable-breakpad');
    app.commandLine.appendSwitch('disable-logging');
    app.commandLine.appendSwitch('disable-hang-monitor');
    app.commandLine.appendSwitch('disable-2d-canvas-clip-aa');
    disableFeatures('MediaRouter');
  }

  // ── Extra performance tweaks ──
  // Force-past-safety switches: GPU rasterization past the driver blocklist,
  // driver bug workarounds off, no software-rasterizer fallback, discrete GPU
  // on dual-GPU machines, 1ms Windows timer frequency, no best-effort task
  // deferral, and no proxy resolution (breaks proxied setups).
  if (advanced.perfTweaks) {
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    // Keep Chromium's driver-bug workarounds ON for mac: disabling them makes
    // Krunker's draws fail command-buffer validation on ANGLE Metal
    // (GL_INVALID_OPERATION "Vertex buffer is not big enough" spam; confirmed
    // 2026-07-08 — errors vanish with workarounds active, Crankshaft never
    // disables them). Windows/Linux keep the switch.
    if (info.os !== 'darwin') app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('force-high-performance-gpu');
    app.commandLine.appendSwitch('raise-timer-frequency');
    app.commandLine.appendSwitch('disable-best-effort-tasks');
    app.commandLine.appendSwitch('no-proxy-server');
  }

  // ── Single emission of accumulated feature flag sets ──
  if (enabledFeatures.size) app.commandLine.appendSwitch('enable-features', [...enabledFeatures].join(','));
  if (disabledFeatures.size) app.commandLine.appendSwitch('disable-features', [...disabledFeatures].join(','));
}

