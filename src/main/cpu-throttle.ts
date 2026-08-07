import { config } from './config';
import { electronLog } from './logger';

export function menuThrottleRate(): number {
  return config.get('performance')?.throttleMenu ?? 1;
}

// CDP virtual-time slowdown (1 = off, 3 = heavy). Trades frame rate for lower
// CPU/GPU load and heat.
export function applyCpuThrottle(wc: Electron.WebContents, rate: number): void {
  if (wc.isDestroyed()) return;
  const clamped = Math.max(1, Math.min(3, Number(rate) || 1));
  // Rate 1 with no session attached: nothing to apply or undo
  if (clamped === 1 && !wc.debugger.isAttached()) return;
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  } catch (err) {
    electronLog.warn('[KCC] CPU throttle attach failed:', err);
    return;
  }
  wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: clamped })
    .catch((err) => electronLog.warn('[KCC] CPU throttle send failed:', err));
}

// Re-apply after events that drop the CDP state (renderer crash, DevTools
// stealing the debugger session while open).
export function attachThrottleRecovery(wc: Electron.WebContents, getRate: () => number, applyOnLoad = false): void {
  if (applyOnLoad) wc.once('did-finish-load', () => applyCpuThrottle(wc, getRate()));
  wc.on('render-process-gone', () => {
    setTimeout(() => { if (!wc.isDestroyed()) applyCpuThrottle(wc, getRate()); }, 500);
  });
  wc.on('devtools-closed', () => {
    if (!wc.isDestroyed()) applyCpuThrottle(wc, getRate());
  });
}
