// Krunker keeps updating Howler's listener; once Howler suspends its idle AudioContext, Chromium keeps every update and the page slows to a crawl.

import { savedConsole as _console } from './saved-console';

export function disableHowlerAutoSuspend(attempt = 0): void {
  const H = (window as any).Howler;
  if (!H) { // howler.js loads after the preload
    if (attempt < 100) setTimeout(() => disableHowlerAutoSuspend(attempt + 1), 200);
    else _console.warn('[KCC] window.Howler never appeared; audio auto-suspend left on');
    return;
  }
  // Howler re-checks this inside its 30 s suspend timer, so a suspend already pending is cancelled too
  H.autoSuspend = false;
  _console.log('[KCC] Howler auto-suspend disabled');
}
