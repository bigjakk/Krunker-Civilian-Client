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

export function applyPlatformFlags(info: PlatformInfo, advanced: AppConfig['advanced'], performance: AppConfig['performance']): void {
  // ── FPS uncap ──
  // disable-frame-rate-limit causes compositor CPU spin on Chromium 84+, starving
  // input events. On Electron 42 (Chromium 147), this is fixed by a patch to
  // cc/scheduler/scheduler.cc in our custom Electron build. The latency recovery
  // flags below are no-ops on Chromium 94+ (features were removed), but are
  // harmless to keep — Chromium ignores unknown feature flags.
  if (performance.fpsUnlocked) {
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('disable-gpu-vsync');
    app.commandLine.appendSwitch('max-gum-fps', '9999');
    app.commandLine.appendSwitch('enable-features', 'ImplLatencyRecovery,MainLatencyRecovery');
  }

  // ── Always-on platform flags ──
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-threaded-scrolling');
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
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,HardwareMediaKeyHandling');
  }

  if (info.isLinux) {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    // GPU sandbox can fail inside AppImage FUSE mounts and on certain Mesa driver versions,
    // causing the GPU process to crash and leaving a black screen.
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }

  // ── Remove useless features ──
  if (advanced.removeUselessFeatures) {
    app.commandLine.appendSwitch('disable-breakpad');
    app.commandLine.appendSwitch('disable-crash-reporter');
    app.commandLine.appendSwitch('disable-crashpad-forwarding');
    app.commandLine.appendSwitch('disable-print-preview');
    app.commandLine.appendSwitch('disable-metrics-reporting');
    app.commandLine.appendSwitch('disable-metrics');
    app.commandLine.appendSwitch('disable-2d-canvas-clip-aa');
    app.commandLine.appendSwitch('disable-logging');
    app.commandLine.appendSwitch('disable-hang-monitor');
    app.commandLine.appendSwitch('disable-component-update');
    app.commandLine.appendSwitch('disable-bundled-ppapi-flash');
    app.commandLine.appendSwitch('disable-nacl');
    app.commandLine.appendSwitch('disable-features', 'NativeNotifications,MediaRouter,PerformanceInterventionUI,HappinessTrackingSurveysForDesktopDemo');
  }

  // ── GPU rasterization ──
  // OOP rasterization is always-on when GPU rasterization is enabled (Chromium 100+)
  if (advanced.gpuRasterizing) {
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('disable-zero-copy');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');
  }

  // ── Helpful flags ──
  if (advanced.helpfulFlags) {
    app.commandLine.appendSwitch('enable-javascript-harmony');
    app.commandLine.appendSwitch('enable-future-v8-vm-features');
    app.commandLine.appendSwitch('enable-webgl');
    app.commandLine.appendSwitch('disable-background-timer-throttling');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-best-effort-tasks');
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
    app.commandLine.appendSwitch('enable-features', 'V8VmFuture,WebAssemblyBaseline,WebAssemblyTiering,WebAssemblyLazyCompilation');
  }

  // ── Increase limits ──
  if (advanced.increaseLimits) {
    app.commandLine.appendSwitch('renderer-process-limit', '100');
    app.commandLine.appendSwitch('max-active-webgl-contexts', '100');
    app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
  }

  // ── Low latency ──
  // High-res timers and QUIC are default on Chromium 100+. Accelerated 2D canvas
  // is default on Chromium 42+. These enable flags were removed from the source.
  if (advanced.lowLatency) {
    app.commandLine.appendSwitch('force-high-performance-gpu');
    app.commandLine.appendSwitch('enable-quic');
    app.commandLine.appendSwitch('quic-max-packet-length', '1460');
    app.commandLine.appendSwitch('raise-timer-frequency');
  }

  // ── Experimental flags ──
  // Removed dead flags: enable-accelerated-video-decode (default since Chromium 132),
  // enable-native-gpu-memory-buffers (Linux-only), high-dpi-support (removed in ~M54,
  // HiDPI is default since M108). Renamed ignore-gpu-blacklist → ignore-gpu-blocklist.
  if (advanced.experimentalFlags) {
    app.commandLine.appendSwitch('disable-low-end-device-mode');
    app.commandLine.appendSwitch('disable-gpu-watchdog');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('no-pings');
    app.commandLine.appendSwitch('no-proxy-server');
    app.commandLine.appendSwitch('enable-features', 'BlinkCompositorUseDisplayThreadPriority,GpuUseDisplayThreadPriority');
  }
}

