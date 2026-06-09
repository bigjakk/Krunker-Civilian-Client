// ── Saved console ──
// Krunker overwrites console.* on its own page; we capture the originals at
// preload load (before that happens). Errors/warnings always forward to the
// main-process log file; plain logs forward only when verbose logging is on.

import { ipcRenderer } from 'electron';
import type { SavedConsole } from './utils';

let verbose = false;

export function setVerbose(enabled: boolean): void {
  verbose = enabled;
}

export const savedConsole: SavedConsole = {
  log: (...args: unknown[]) => {
    console.log(...args);
    if (verbose) ipcRenderer.send('verbose-log', 'log', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
    ipcRenderer.send('verbose-log', 'warn', ...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    ipcRenderer.send('verbose-log', 'error', ...args);
  },
};
