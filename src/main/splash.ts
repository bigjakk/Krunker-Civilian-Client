import { BrowserWindow } from 'electron';
import { devWindowIcon } from './platform';
import { SPLASH_POSTER } from './splash-image';
import { escapeHtml, renderMarkdown } from '../shared/markdown';

// Branded startup splash: shows the KCC poster art while the update check and
// the initial game load run, and doubles as the update UI (status text, progress
// bar, and accept/skip buttons render in its bottom overlay). One window covers
// the whole launch, so there is never a zero-window moment where the
// window-all-closed handler would quit the app mid-startup.

const SPLASH_WIDTH = 760;
const SPLASH_HEIGHT = 400;

function buildSplashHTML(version: string): string {
  // Buttons and the close control signal via console.log — captured by
  // webContents 'console-message' in main. Works on data: URLs without a preload.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 100vw; height: 100vh; overflow: hidden;
    background: #0b0b10;
    user-select: none; cursor: default;
    -webkit-app-region: drag;
  }
  #poster {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
  #close {
    position: absolute; top: 8px; right: 10px;
    z-index: 2;
    -webkit-app-region: no-drag;
    color: rgba(255,255,255,0.55);
    font-size: 14px; line-height: 1;
    padding: 6px 8px;
    cursor: pointer;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    transition: color 0.15s;
  }
  #close:hover { color: #fff; }
  #overlay {
    position: absolute; left: 0; right: 0; bottom: 0;
    z-index: 1;
    padding: 34px 16px 12px;
    background: linear-gradient(180deg, rgba(5,7,10,0) 0%, rgba(5,7,10,0.88) 70%);
    display: flex; flex-direction: column; gap: 9px;
  }
  #row { display: flex; align-items: center; gap: 12px; min-height: 26px; }
  #status {
    flex: 1;
    font-size: 13px;
    color: rgba(255,255,255,0.88);
    text-shadow: 0 1px 3px rgba(0,0,0,0.85);
    line-height: 1.4;
  }
  #version {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    text-shadow: 0 1px 3px rgba(0,0,0,0.85);
    white-space: nowrap;
  }
  #buttons { display: none; gap: 8px; -webkit-app-region: no-drag; }
  #notes {
    display: none;
    -webkit-app-region: no-drag;
    max-height: 176px;
    overflow-y: auto;
    background: rgba(8,10,14,0.6);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12px;
    line-height: 1.55;
    color: rgba(255,255,255,0.78);
  }
  #notes h1, #notes h2, #notes h3 {
    font-size: 12.5px; font-weight: 600;
    color: #fff;
    margin: 10px 0 4px;
  }
  #notes h1:first-child, #notes h2:first-child, #notes h3:first-child { margin-top: 0; }
  #notes ul { padding-left: 16px; margin: 4px 0; }
  #notes li { margin: 3px 0; }
  #notes li::marker { color: rgba(46,229,157,0.8); }
  #notes strong { color: #fff; }
  #notes::-webkit-scrollbar { width: 8px; }
  #notes::-webkit-scrollbar-track { background: transparent; }
  #notes::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 4px; }
  #notes::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
  #skipRow {
    display: none;
    align-items: center; gap: 6px;
    align-self: flex-end;
    -webkit-app-region: no-drag;
    font-size: 11px;
    color: rgba(255,255,255,0.65);
    text-shadow: 0 1px 3px rgba(0,0,0,0.85);
    cursor: pointer;
  }
  #skipRow input { cursor: pointer; accent-color: #2ee59d; margin: 0; }
  button {
    padding: 7px 16px;
    border: none; border-radius: 4px;
    color: #fff;
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: filter 0.15s, background 0.15s;
  }
  button.primary { background: linear-gradient(90deg, #0fa96c, #2ee59d); }
  button.primary:hover { filter: brightness(1.12); }
  button.secondary { background: rgba(255,255,255,0.14); }
  button.secondary:hover { background: rgba(255,255,255,0.24); }
  .progress-container {
    width: 100%; height: 3px;
    background: rgba(255,255,255,0.14);
    border-radius: 2px;
    overflow: hidden;
    opacity: 0;
    transition: opacity 0.25s;
  }
  .progress-container.active { opacity: 1; }
  .progress-bar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, #0fa96c, #2ee59d);
    border-radius: 2px;
    transition: width 0.3s ease;
  }
  /* Indeterminate sweep for steps with no measurable progress (check, verify, install). */
  .progress-container.indeterminate .progress-bar {
    width: 40%;
    transition: none;
    animation: kcc-indet 1.15s ease-in-out infinite;
  }
  @keyframes kcc-indet {
    0%   { transform: translateX(-110%); }
    100% { transform: translateX(260%); }
  }
</style></head>
<body>
  <img id="poster" src="${SPLASH_POSTER}" alt="">
  <div id="close" title="Close">&#10005;</div>
  <div id="overlay">
    <div id="notes"></div>
    <div id="row">
      <div id="status">Starting...</div>
      <div id="buttons">
        <button class="secondary" id="btnSecondary"></button>
        <button class="primary" id="btnPrimary"></button>
      </div>
      <div id="version">v${version}</div>
    </div>
    <label id="skipRow"><input type="checkbox" id="skipChk"><span>Don't ask again for this version</span></label>
    <div class="progress-container" id="progress">
      <div class="progress-bar" id="progressBar"></div>
    </div>
  </div>
  <script>
    document.getElementById('close').addEventListener('click', () => console.log('KCC_SPLASH:close'));
    document.getElementById('btnPrimary').addEventListener('click', () => console.log('KCC_SPLASH:primary'));
    document.getElementById('btnSecondary').addEventListener('click', () =>
      console.log('KCC_SPLASH:secondary' + (document.getElementById('skipChk').checked ? ':skip' : '')));
  </script>
</body></html>`;
}

/**
 * Pull the logged string out of a 'console-message' event, tolerating both the old
 * (event, level, message, ...) and new (single event-object) Electron signatures.
 */
function extractConsoleMessage(args: unknown[]): string {
  for (const arg of args) {
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg === 'object' && 'message' in arg && typeof (arg as { message: unknown }).message === 'string') {
      return (arg as { message: string }).message;
    }
  }
  return '';
}

// Single-use per process: the splash is created once at startup and this module
// state is not reset by a second createSplash().
let splash: BrowserWindow | null = null;
let splashCreatedAt = 0;
let closedByApp = false;
type PromptChoice = 'primary' | 'secondary' | 'secondary-skip' | 'closed';
let pendingPrompt: ((choice: PromptChoice) => void) | null = null;
const userClosedCallbacks: Array<() => void> = [];

function resolvePrompt(choice: PromptChoice): void {
  const resolve = pendingPrompt;
  pendingPrompt = null;
  if (resolve) resolve(choice);
}

export function createSplash(version: string): void {
  splashCreatedAt = Date.now();
  splash = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#0b0b10',
    title: 'Krunker Civilian Client',
    icon: devWindowIcon(),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  splash.removeMenu();
  // Display-only surface: never navigate away (e.g. a file dragged onto the
  // window) or open child windows.
  splash.webContents.on('will-navigate', (e) => e.preventDefault());
  splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splash.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) splash.show();
  });

  splash.webContents.on('console-message', (...args: unknown[]) => {
    const message = extractConsoleMessage(args);
    if (message === 'KCC_SPLASH:close') {
      // User close — the 'closed' handler below fires the callbacks. With no
      // other window open, window-all-closed then quits the app.
      if (splash && !splash.isDestroyed()) splash.close();
    } else if (message === 'KCC_SPLASH:primary') {
      resolvePrompt('primary');
    } else if (message === 'KCC_SPLASH:secondary') {
      resolvePrompt('secondary');
    } else if (message === 'KCC_SPLASH:secondary:skip') {
      resolvePrompt('secondary-skip');
    }
  });

  splash.on('closed', () => {
    splash = null;
    resolvePrompt('closed');
    if (!closedByApp) {
      for (const cb of userClosedCallbacks) cb();
    }
  });

  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildSplashHTML(version)));
}

export function splashAlive(): boolean {
  return splash !== null && !splash.isDestroyed();
}

/** Milliseconds since the splash was created (Infinity if it never was). */
export function splashElapsed(): number {
  return splashCreatedAt ? Date.now() - splashCreatedAt : Infinity;
}

export function getSplash(): BrowserWindow | null {
  return splashAlive() ? splash : null;
}

/** Runs cb when the splash is closed by the user (not via closeSplash). */
export function onSplashUserClosed(cb: () => void): void {
  userClosedCallbacks.push(cb);
}

/**
 * Update the status line and progress bar. percent >= 0 → determinate width;
 * percent < 0 → indeterminate sweep; omitted → progress bar hidden.
 * Also hides the prompt buttons, so a status update always exits prompt state.
 */
export function splashStatus(message: string, percent?: number): void {
  if (!splashAlive()) return;
  const pct = typeof percent === 'number' ? percent : NaN;
  splash!.webContents.executeJavaScript(`(() => {
    const s = document.getElementById('status');
    const b = document.getElementById('buttons');
    const v = document.getElementById('version');
    const c = document.getElementById('progress');
    const p = document.getElementById('progressBar');
    const k = document.getElementById('skipRow');
    const n = document.getElementById('notes');
    if (s) s.textContent = ${JSON.stringify(message)};
    if (b) b.style.display = 'none';
    if (k) k.style.display = 'none';
    if (n) n.style.display = 'none';
    if (v) v.style.display = '';
    if (c && p) {
      const pct = ${pct};
      if (Number.isNaN(pct)) { c.classList.remove('active', 'indeterminate'); }
      else if (pct >= 0) { c.classList.add('active'); c.classList.remove('indeterminate'); p.style.width = pct + '%'; }
      else { c.classList.add('active', 'indeterminate'); }
    }
  })()`).catch(() => {});
}

/**
 * Show an update prompt in the splash overlay. 'install' offers Skip / Update Now;
 * 'notice' (builds that can't self-install) offers Later / Download. Non-empty
 * notes (release markdown) render in a card above the buttons. Resolves
 * 'primary' (update/download), 'secondary' (skip/later), 'secondary-skip' (skip
 * with "don't ask again for this version" ticked), or 'closed' if the user
 * closed the splash — the caller should treat 'closed' as the app quitting.
 */
export function splashPrompt(kind: 'install' | 'notice', newVersion: string, currentVersion: string, notes = ''): Promise<PromptChoice> {
  if (!splashAlive()) return Promise.resolve('closed');

  const message = kind === 'install'
    ? `Update v${newVersion} is available — you're on v${currentVersion}.`
    : `Update v${newVersion} is available. This build can't update itself — Download opens the releases page.`;
  const primaryLabel = kind === 'install' ? 'Update Now' : 'Download';
  const secondaryLabel = kind === 'install' ? 'Skip' : 'Later';
  // Links render as plain text — the splash blocks all navigation.
  const notesHtml = notes.trim()
    ? `<h2>What's new in v${escapeHtml(newVersion)}</h2>` + renderMarkdown(notes, { links: false })
    : '';

  splash!.webContents.executeJavaScript(`(() => {
    const s = document.getElementById('status');
    const b = document.getElementById('buttons');
    const v = document.getElementById('version');
    const c = document.getElementById('progress');
    if (s) s.textContent = ${JSON.stringify(message)};
    if (v) v.style.display = 'none';
    if (c) c.classList.remove('active', 'indeterminate');
    if (b) b.style.display = 'flex';
    const k = document.getElementById('skipRow');
    const kc = document.getElementById('skipChk');
    if (k) k.style.display = 'flex';
    if (kc) kc.checked = false;
    const n = document.getElementById('notes');
    if (n) { n.innerHTML = ${JSON.stringify(notesHtml)}; n.style.display = ${JSON.stringify(notesHtml ? 'block' : 'none')}; }
    const bp = document.getElementById('btnPrimary');
    const bs = document.getElementById('btnSecondary');
    if (bp) bp.textContent = ${JSON.stringify(primaryLabel)};
    if (bs) bs.textContent = ${JSON.stringify(secondaryLabel)};
  })()`).catch(() => {});

  return new Promise((resolve) => {
    pendingPrompt = resolve;
  });
}

/** Close the splash from app code (e.g. once the main window is shown). */
export function closeSplash(): void {
  if (!splashAlive()) return;
  closedByApp = true;
  splash!.close();
}
