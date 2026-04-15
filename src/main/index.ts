import { app, BrowserWindow, Menu, clipboard, ipcMain, safeStorage, session, shell } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, promises as fsp } from 'fs';
import { get as httpsGet } from 'https';
import { execFile } from 'child_process';
import * as os from 'os';
import { detectPlatform, applyPlatformFlags } from './platform';
import { config, Keybind, DEFAULT_KEYBINDS, SavedAccount } from './config';
import { initSwapperProtocol, registerSwapperFileProtocol, ResourceSwapper } from './swapper';
import { UserscriptManager } from './userscripts';
import { ALL_CLIENT_CSS } from './client-ui';
import { electronLog, getLogPath, closeLogStreams } from './logger';
import { checkForUpdate, downloadUpdate, installUpdate } from './updater';
import { showUpdateWindow } from './update-window';
import { DiscordRPC } from './discord-rpc';
import { listThemes, getThemeCSS, listLoadingThemes, getLoadingScreenCSS } from './css-themes';
import { TabManager } from './tab-manager';
import { openRankedQueue } from './ranked-queue';

// ── App version for API calls ──
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appVersion: string = require('../../package.json').version;

// ── Region ping cache ──
const SERVER_MAP: Record<string, string> = {
  'us-ca-sv': 'SV', 'jb-hnd': 'TOK', 'de-fra': 'FRA',
  'as-mb': 'MBI', 'au-syd': 'SYD', 'sgp': 'SIN',
  'us-tx': 'DAL', 'me-bhn': 'BHN', 'brz': 'BRZ', 'us-nj': 'NY',
};
let pingCache: Record<string, number> = {};
let pingCacheTime = 0;

function osPing(host: string): Promise<number> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const args = isWin ? ['-n', '1', '-w', '1500', host] : ['-c', '1', '-W', '2', host];
    execFile('ping', args, { timeout: 3000 }, (err, stdout) => {
      if (err) { resolve(-1); return; }
      const match = stdout.match(/time[=<]([\d.]+)\s*ms/i);
      if (match) resolve(Math.round(parseFloat(match[1])));
      else resolve(-1);
    });
  });
}

// ── Platform flags (must run before app.ready) ──
const platformInfo = detectPlatform();
const advancedDefaults = {
  removeUselessFeatures: true,
  gpuRasterizing: false,
  helpfulFlags: true,
  increaseLimits: false,
  lowLatency: false,
  experimentalFlags: false,
};
const advancedConfig = { ...advancedDefaults, ...config.get('advanced') };
const perfConfig = { fpsUnlocked: true, ...config.get('performance') };
applyPlatformFlags(platformInfo, advancedConfig, perfConfig);

// ── App identity (must match electron-builder appId for taskbar pin persistence) ──
app.setAppUserModelId('com.krunkercivilian.client');

// ── Resource swapper protocol (must register before app.ready) ──
initSwapperProtocol();

// ── Ad-blocking URL patterns (matched in C++ layer, never hits JS for non-matches) ──
const BLOCKED_URL_PATTERNS = [
  '*://*.pollfish.com/*',
  '*://www.paypalobjects.com/*',
  '*://fran-cdn.frvr.com/*',
  '*://c.amazon-adsystem.com/*',
  '*://cdn.frvr.com/fran/*',
  '*://cookiepro.com/*',
  '*://*.cookiepro.com/*',
  '*://www.googletagmanager.com/*',
  '*://*.doubleclick.net/*',
  '*://storage.googleapis.com/pollfish_production/*',
  '*://coeus.frvr.com/*',
  '*://apis.google.com/js/platform.js',
  '*://imasdk.googleapis.com/*',
];

// ── CSS to hide ad containers ──
const HIDE_ADS_CSS = `
.endAHolder,
#aHider,
#adCon,
#rightABox,
#aContainer,
#topRightAdHolder,
div#aContainer,
#braveWarning,
#topRightAdHolder {
  display: none !important;
}`;

// ── Consent dismiss script (polling only — NO MutationObserver on main frame) ──
const CONSENT_DISMISS_MAIN_JS = `
(function dismissConsent() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    const btn = document.querySelector('.fc-cta-consent, [aria-label="Consent"], .css-47sehv');
    if (btn) { btn.click(); clearInterval(timer); }
    if (attempts > 30) clearInterval(timer);
  }, 500);
})();`;

// ── Escape pointer lock fix ──
const ESCAPE_POINTERLOCK_FIX_JS = `
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.pointerLockElement) {
    document.exitPointerLock();
  }
}, true);`;

// ── Safe external URL opener (only http/https) ──
function safeOpenExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(url);
    }
  } catch { /* malformed URL — ignore */ }
}

// ── Keybind matching ──
function matchesKeybind(input: { key: string; control: boolean; shift: boolean; alt: boolean }, bind: Keybind | undefined): boolean {
  if (!bind) return false;
  return input.key === bind.key
    && input.control === bind.ctrl
    && input.shift === bind.shift
    && input.alt === bind.alt;
}

// ── Cached keybinds (avoid re-reading electron-store on every keypress) ──
let cachedKeybinds: Record<string, Keybind> | null = null;

function getKeybinds(): Record<string, Keybind> {
  if (!cachedKeybinds) {
    cachedKeybinds = { ...DEFAULT_KEYBINDS, ...config.get('keybinds') };
  }
  return cachedKeybinds;
}

// ── Debounced window state persistence ──
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveWindowState(win: BrowserWindow): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();
    config.set('window', {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen(),
    });
  }, 1000);
}

app.whenReady().then(async () => {
  electronLog.log('[KCC] App ready');

  // ── Auto-update check (mandatory, Windows NSIS install only) ──
  const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  const isAppImage = !!process.env.APPIMAGE;
  const isDev = !app.isPackaged;
  if (isDev || process.platform !== 'win32' || isPortable || isAppImage) {
    electronLog.log('[KCC] Skipping auto-update (portable or non-Windows)');
  } else {
    try {
      electronLog.log('[KCC] Checking for updates...');
      const update = await checkForUpdate(appVersion);
      if (update) {
        electronLog.log(`[KCC] Update available: v${update.version}`);
        const { window: updateWin, sendProgress } = showUpdateWindow();
        sendProgress(`Update available (v${update.version})`, 0);

      const tempDir = join(app.getPath('temp'), 'kcc-update');
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
      const installerPath = join(tempDir, `KCC-${update.version}-Setup.exe`);

      let cancelled = false;
      updateWin.on('closed', () => { cancelled = true; });

      try {
        await downloadUpdate(update.downloadUrl, installerPath, (pct) => {
          if (!cancelled && !updateWin.isDestroyed()) {
            sendProgress(`Downloading update... ${pct}%`, pct);
          }
        }, update.sha256);

        if (!cancelled) {
          sendProgress('Installing update...', 100);
          installUpdate(installerPath);
          return; // app.quit() called by installUpdate
        }
      } catch (err) {
        electronLog.error('[KCC] Update download failed:', err);
        if (!updateWin.isDestroyed()) updateWin.close();
      }
    } else {
      electronLog.log('[KCC] No updates available');
    }
  } catch (err) {
    electronLog.error('[KCC] Update check failed:', err);
  }
  }

  await launchApp();
});

async function launchApp(): Promise<void> {
  electronLog.log('[KCC] Starting initialization');

  // ── Session: persistent partition + clean user-agent ──
  const ses = session.fromPartition('persist:krunker');
  const rawUA = ses.getUserAgent();
  ses.setUserAgent(rawUA.replace(/\s*krunker-civilian-client\/\S+/i, ''));

  // ── Register swapper file protocol on this session ──
  registerSwapperFileProtocol(ses);

  // ── Resource swapper ──
  const swapperConfig = config.get('swapper');
  const swapDir = swapperConfig.path || join(app.getPath('userData'), 'Krunker Civilian Client', 'swapper');
  // Ensure swap subdirectories exist (themes/, backgrounds/)
  for (const sub of ['themes', 'backgrounds']) {
    const dir = join(swapDir, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const swapper = swapperConfig.enabled ? new ResourceSwapper(swapDir) : null;
  electronLog.log(`[KCC] Resource swapper: ${swapper ? 'enabled' : 'disabled'} (${swapDir})`);

  // ── Userscript manager ──
  const usConfig = config.get('userscripts') || { enabled: true, path: '' };
  const usDir = usConfig.path || join(app.getPath('userData'), 'Krunker Civilian Client');
  const userscriptManager = usConfig.enabled ? new UserscriptManager(usDir) : null;
  electronLog.log(`[KCC] Userscripts: ${userscriptManager ? 'enabled' : 'disabled'} (${usDir})`);

  // ── Ad blocking + resource swapper (single onBeforeRequest — Electron only allows one) ──
  // The broad *://*.krunker.io/* pattern lets the swapper intercept any krunker asset.
  // swapper.getRedirect() returns null before its async scan completes, so swapped
  // resources simply pass through until the scan finishes — no re-registration needed.
  const requestFilterUrls = swapper
    ? [...BLOCKED_URL_PATTERNS, '*://*.krunker.io/*']
    : [...BLOCKED_URL_PATTERNS];

  ses.webRequest.onBeforeRequest({ urls: requestFilterUrls }, (details, callback) => {
    // Check swapper first — redirect matching assets to local files
    if (swapper) {
      const redirect = swapper.getRedirect(details.url);
      if (redirect) return callback({ redirectURL: redirect });
    }
    // Determine if this URL is a krunker.io request (matched by the broad swapper pattern)
    // vs an ad-block pattern. krunker.io requests that weren't swapped pass through normally.
    try {
      if (new URL(details.url).hostname.endsWith('krunker.io')) return callback({});
    } catch { /* invalid URL — fall through to cancel */ }
    // Matched an ad-block pattern — cancel it
    callback({ cancel: true });
  });

  if (swapper) {
    swapper.waitForReady().then(() => {
      electronLog.log(`[KCC] Swapper ready: ${swapper.patterns.length} pattern(s)`);
    });
  }

  // ── CORS fix for swapped resources ──
  if (swapper) {
    ses.webRequest.onHeadersReceived(({ responseHeaders }, callback) => {
      if (!responseHeaders) return callback({});
      for (const key in responseHeaders) {
        const lowercase = key.toLowerCase();
        if (lowercase === 'access-control-allow-credentials' && responseHeaders[key][0] === 'true') {
          return callback({ responseHeaders });
        }
        if (lowercase === 'access-control-allow-origin') {
          delete responseHeaders[key];
          break;
        }
      }
      return callback({
        responseHeaders: { ...responseHeaders, 'access-control-allow-origin': ['*'] },
      });
    });
  }

  // ── Restore saved window bounds ──
  const savedWindow = config.get('window');

  const win = new BrowserWindow({
    width: savedWindow.width,
    height: savedWindow.height,
    x: savedWindow.x,
    y: savedWindow.y,
    frame: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      session: ses,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  if (savedWindow.fullscreen) win.setFullScreen(true);
  else if (savedWindow.maximized) win.maximize();

  // ── No application menu (prevents Escape/Alt interception) ──
  Menu.setApplicationMenu(null);

  // ── Discord Rich Presence ──
  let discordRpc: DiscordRPC | null = null;
  {
    const discordConf = config.get('discord') || { enabled: false };
    if (discordConf.enabled) {
      discordRpc = new DiscordRPC();
      discordRpc.connect();
      electronLog.log('[KCC] Discord Rich Presence enabled');
    }
  }

  // ── Process Priority (Windows only) ──
  if (process.platform === 'win32') {
    const PRIORITY_MAP: Record<string, number> = {
      'High': -14,
      'Above Normal': -7,
      'Below Normal': 7,
      'Low': 19,
    };
    const prioritySetting = config.get('performance')?.processPriority || 'Normal';
    const priorityVal = PRIORITY_MAP[prioritySetting];
    if (priorityVal !== undefined) {
      try { os.setPriority(process.pid, priorityVal); } catch { /* ignore */ }
      // Apply to child processes periodically
      setInterval(() => {
        for (const m of app.getAppMetrics()) {
          if (m.pid !== process.pid) {
            try { os.setPriority(m.pid, priorityVal); } catch { /* ignore */ }
          }
        }
      }, 1000);
      electronLog.log(`[KCC] Process priority set to ${prioritySetting}`);
    }
  }

  // ── CPU Throttling via Chrome DevTools Protocol ──
  const throttledContents = new WeakSet<Electron.WebContents>();

  function applyCpuThrottle(wc: Electron.WebContents, rate: number): void {
    const clamped = Math.max(1, Math.min(3, rate));
    try {
      if (!throttledContents.has(wc)) {
        wc.debugger.attach('1.3');
        throttledContents.add(wc);
      }
      wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: clamped });
    } catch { /* debugger may already be attached or detached */ }
  }

  // ── Keybind capture lock (suppresses shortcuts while the keybind dialog is open) ──
  let keybindCapturing = false;
  ipcMain.on('keybind-capture', (_e, capturing: boolean) => {
    keybindCapturing = capturing;
  });

  // ── Configurable keybinds via before-input-event ──
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (keybindCapturing) return;

    const binds = getKeybinds();

    if (matchesKeybind(input, binds.reload)) {
      win.reload();
      event.preventDefault();
    } else if (matchesKeybind(input, binds.newMatch)) {
      const mm = config.get('matchmaker');
      if (mm.enabled) {
        win.webContents.send('matchmaker-find', {
          ...mm,
          cancelKey: binds.matchmakerCancel,
        });
      } else {
        win.loadURL('https://krunker.io');
      }
      event.preventDefault();
    } else if (matchesKeybind(input, binds.joinFromClipboard)) {
      const text = clipboard.readText();
      try { const u = new URL(text); if (u.protocol === 'https:' && u.hostname.endsWith('krunker.io')) win.loadURL(text); } catch { /* ignore invalid URLs */ }
      event.preventDefault();
    } else if (matchesKeybind(input, binds.copyGameLink)) {
      clipboard.writeText(win.webContents.getURL());
      event.preventDefault();
    } else if (matchesKeybind(input, binds.devTools)) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (matchesKeybind(input, binds.matchmaker)) {
      const mm = config.get('matchmaker');
      if (mm.enabled) {
        win.webContents.send('matchmaker-find', {
          ...mm,
          cancelKey: binds.matchmakerCancel,
        });
      } else {
        win.loadURL('https://krunker.io');
      }
      event.preventDefault();
    } else if (matchesKeybind(input, binds.fullscreenToggle)) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 't' && input.control && !input.shift && !input.alt) {
      tabManager.openTab('https://krunker.io/social.html');
      event.preventDefault();
    } else if (input.key === 'T' && input.control && input.shift && !input.alt) {
      tabManager.reopenTab();
      event.preventDefault();
    }
  });

  // ── Window state persistence (debounced) ──
  win.on('resize', () => saveWindowState(win));
  win.on('move', () => saveWindowState(win));
  win.on('maximize', () => saveWindowState(win));
  win.on('unmaximize', () => saveWindowState(win));
  win.on('enter-full-screen', () => saveWindowState(win));
  win.on('leave-full-screen', () => saveWindowState(win));

  // ── URL classification ──
  const GAME_PAGE_PATHS = ['/', ''];
  function isGameURL(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('krunker.io')) return false;
      return GAME_PAGE_PATHS.includes(parsed.pathname);
    } catch { return false; }
  }

  // ── Cached game config (invalidated on set-config writes to 'game') ──
  const gameDefaults = { lastServer: '', socialTabBehaviour: 'New Window' };
  let cachedGameConf: typeof gameDefaults | null = null;
  function getGameConf(): typeof gameDefaults {
    if (!cachedGameConf) cachedGameConf = { ...gameDefaults, ...config.get('game') };
    return cachedGameConf;
  }

  // ── Tab Manager ──
  const preloadPath = join(__dirname, '..', 'preload', 'index.js');
  let tabMode: 'same' | 'new' = getGameConf().socialTabBehaviour === 'Same Window' ? 'same' : 'new';
  let tabManager = new TabManager(
    win, ses, preloadPath, tabMode, isGameURL,
    () => config.get('tabWindow'),
    (state) => config.set('tabWindow', state),
    () => config.get('savedTabs'),
    (urls) => config.set('savedTabs', urls),
    () => config.get('game.rememberTabs') ?? false,
  );

  // Intercept in-page navigation (e.g. window.location = '/social.html')
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        event.preventDefault();
        return;
      }
    } catch { event.preventDefault(); return; }
    if (url.includes('krunker.io') && !isGameURL(url)) {
      event.preventDefault();
      tabManager.openTab(url);
    }
  });

  // Intercept target="_blank" / window.open links
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('krunker.io')) {
      if (isGameURL(url)) {
        win.loadURL(url);
      } else {
        setImmediate(() => tabManager.openTab(url));
      }
    } else {
      setImmediate(() => safeOpenExternal(url));
    }
    return { action: 'deny' };
  });

  // Right-click context menu on main window with "Open in New Tab"
  win.webContents.on('context-menu', (_e, params) => {
    if (!params.linkURL) return;
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.linkURL.includes('krunker.io') && !isGameURL(params.linkURL)) {
      items.push({ label: 'Open in New Tab', click: () => tabManager.openTab(params.linkURL) });
    }
    items.push({ label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) });
    if (!params.linkURL.includes('krunker.io')) {
      items.push({ label: 'Open in Browser', click: () => safeOpenExternal(params.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  // ── Inject scripts after page loads ──
  win.webContents.on('did-finish-load', () => {
    electronLog.log(`[KCC] Page loaded: ${win.webContents.getURL()}`);
    // Rescan swap directory so new/changed files are picked up on refresh
    if (swapper) swapper.rescan().catch(() => {});

    const cssInjections = [
      win.webContents.insertCSS(HIDE_ADS_CSS),
      win.webContents.insertCSS(ALL_CLIENT_CSS),
    ];

    // Inject user CSS theme via <style> tag so @import rules work
    const uiConf = config.get('ui');
    const themeId = uiConf?.cssTheme || 'disabled';
    const themeCSS = getThemeCSS(themeId, swapDir);
    electronLog.log(`[KCC] CSS theme: id=${themeId}, css=${themeCSS ? themeCSS.length + ' chars' : 'none'}`);
    if (themeCSS) {
      // Use <style> tag via executeJavaScript so @import rules work (insertCSS doesn't support them).
      // Encode as base64 to avoid any escaping issues with template literals.
      const b64 = Buffer.from(themeCSS).toString('base64');
      win.webContents.executeJavaScript(`(() => {
        const s = document.createElement('style');
        s.id = 'kcc-user-theme';
        s.textContent = atob('${b64}');
        document.head.appendChild(s);
      })()`).catch((err) => electronLog.warn('[KCC] Theme inject failed:', err));
    }

    // Inject loading screen background
    const loadingCSS = getLoadingScreenCSS(uiConf?.loadingTheme || 'disabled', uiConf?.backgroundUrl || '', swapDir);
    if (loadingCSS) cssInjections.push(win.webContents.insertCSS(loadingCSS));

    Promise.all(cssInjections).catch(() => {});

    // Apply initial CPU throttle (menu state)
    const perf = config.get('performance');
    applyCpuThrottle(win.webContents, perf?.cpuThrottleMenu ?? 1.5);

    win.webContents.executeJavaScript(ESCAPE_POINTERLOCK_FIX_JS).catch((err) => electronLog.warn('[KCC] Pointerlock fix inject failed:', err));
    win.webContents.executeJavaScript(CONSENT_DISMISS_MAIN_JS).catch((err) => electronLog.warn('[KCC] Consent dismiss inject failed:', err));
    // Notify preload to start hooking settings (matches Crankshaft's timing)
    win.webContents.send('main_did-finish-load');
  });

  // ── IPC handlers ──
  const ALLOWED_CONFIG_KEYS = new Set<string>([
    'window', 'performance', 'game', 'swapper', 'matchmaker',
    'keybinds', 'userscripts', 'ui', 'discord', 'translator',
    'advanced', 'accounts', 'tabWindow',
  ]);

  ipcMain.handle('get-version', () => appVersion);
  ipcMain.handle('get-platform', () => platformInfo);
  ipcMain.handle('get-config', (_e, key: string) => {
    if (!ALLOWED_CONFIG_KEYS.has(key)) return undefined;
    return config.get(key as keyof typeof config.store);
  });
  ipcMain.handle('get-all-config', (_e, keys: string[]) => {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (ALLOWED_CONFIG_KEYS.has(key)) result[key] = config.get(key as keyof typeof config.store);
    }
    return result;
  });
  let configWriteTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingConfigWrites = new Map<string, unknown>();

  ipcMain.handle('set-config', (_e, key: string, value: unknown) => {
    if (!ALLOWED_CONFIG_KEYS.has(key)) return;
    // Flush immediately for keys that have side effects
    if (key === 'keybinds') {
      config.set(key as any, value);
      cachedKeybinds = null;
      return;
    }
    // Invalidate caches immediately (not on flush) to prevent stale reads
    if (key === 'game') {
      cachedGameConf = null;
      // Switch tab mode if socialTabBehaviour changed
      const newGame = value as any;
      if (newGame?.socialTabBehaviour) {
        const newMode: 'same' | 'new' = newGame.socialTabBehaviour === 'Same Window' ? 'same' : 'new';
        if (newMode !== tabMode) {
          tabManager.destroyAll();
          tabMode = newMode;
          tabManager = new TabManager(
            win, ses, preloadPath, tabMode, isGameURL,
            () => config.get('tabWindow'),
            (state) => config.set('tabWindow', state),
          );
        }
      }
    }
    pendingConfigWrites.set(key, value);
    if (!configWriteTimer) {
      configWriteTimer = setTimeout(() => {
        for (const [k, v] of pendingConfigWrites) {
          config.set(k as any, v);
        }
        pendingConfigWrites.clear();
        configWriteTimer = null;
      }, 300);
    }
  });
  ipcMain.handle('window-minimize', () => win.minimize());
  ipcMain.handle('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.handle('window-close', () => win.close());
  ipcMain.handle('window-is-maximized', () => win.isMaximized());
  ipcMain.handle('toggle-devtools', () => win.webContents.toggleDevTools());
  ipcMain.handle('inject-game-click', () => {
    const [width, height] = win.getContentSize();
    const x = Math.round(width / 2);
    const y = Math.round(height / 2);
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  });
  ipcMain.handle('get-swap-dir', () => swapDir);
  ipcMain.handle('open-swap-folder', () => shell.openPath(swapDir));
  ipcMain.handle('open-themes-folder', () => shell.openPath(join(swapDir, 'themes')));
  ipcMain.handle('open-backgrounds-folder', () => shell.openPath(join(swapDir, 'backgrounds')));

  // ── Ping regions IPC handler (TCP connect timing, cached 60s) ──
  ipcMain.handle('ping-regions', async () => {
    if (Object.keys(pingCache).length > 0 && Date.now() - pingCacheTime < 60000) {
      return pingCache;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        httpsGet('https://matchmaker.krunker.io/ping-list?hostname=krunker.io', (res) => {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        }).on('error', reject);
      });
      const serverIPs: Record<string, string> = JSON.parse(data);

      const results: Record<string, number> = {};

      async function pingWithRetry(host: string): Promise<number> {
        const latency = await osPing(host);
        if (latency >= 0) return latency;
        const retry = await osPing(host);
        return retry >= 0 ? retry : -1;
      }

      const promises = Object.entries(serverIPs).map(async ([server, ip]) => {
        const regionName = SERVER_MAP[server] ?? server;
        const host = ip.split(':')[0];
        const latency = await pingWithRetry(host);
        if (latency >= 0) {
          results[regionName] = latency;
        }
      });
      await Promise.allSettled(promises);
      pingCache = results;
      pingCacheTime = Date.now();

      return results;
    } catch (err) {
      electronLog.error('[KCC] Ping regions error:', err);
      return pingCache;
    }
  });

  // ── Ranked queue IPC handler ──
  ipcMain.on('open-ranked-queue', (_e, token: string, region: string, allRegions: boolean) => {
    openRankedQueue(token, region, allRegions);
  });

  // ── Discord Rich Presence IPC handler ──
  ipcMain.on('discord-update', (_e, activity: any) => {
    discordRpc?.setActivity(activity);
  });

  // ── Verbose log IPC handler (preload forwards logs here) ──
  ipcMain.on('verbose-log', (_e, level: string, ...args: unknown[]) => {
    if (level === 'error') electronLog.error(...args);
    else if (level === 'warn') electronLog.warn(...args);
    else electronLog.log(...args);
  });

  // ── CPU throttle IPC handler ──
  ipcMain.on('throttle-state', (_e, state: string) => {
    const perf = config.get('performance');
    const rate = state === 'game' ? (perf?.cpuThrottleGame ?? 1) : (perf?.cpuThrottleMenu ?? 1.5);
    applyCpuThrottle(win.webContents, rate);
  });

  // ── CSS theme & loading background IPC handlers ──
  ipcMain.handle('list-themes', () => listThemes(swapDir));
  ipcMain.handle('get-theme-css', (_e, themeId: string) => getThemeCSS(themeId, swapDir));
  ipcMain.handle('list-loading-themes', () => listLoadingThemes(swapDir));
  ipcMain.handle('get-loading-screen-css', (_e, loadingTheme: string, backgroundUrl: string) => {
    return getLoadingScreenCSS(loadingTheme, backgroundUrl, swapDir);
  });

  // ── Changelog IPC handler (fetch release notes from Gitea) ──
  ipcMain.handle('changelog-fetch', async (_e, version: string) => {
    const tag = version.startsWith('v') ? version : `v${version}`;
    try {
      const data = await new Promise<string>((resolve, reject) => {
        httpsGet(`https://api.github.com/repos/bigjakk/Krunker-Civilian-Client/releases/tags/${tag}`, { headers: { 'User-Agent': 'KCC' } }, (res) => {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        }).on('error', reject);
      });
      const release = JSON.parse(data);
      return release.body || '';
    } catch {
      return '';
    }
  });

  // ── Userscript IPC handlers ──
  ipcMain.handle('userscripts-get-dir', () => userscriptManager ? userscriptManager.dir : '');
  ipcMain.handle('userscripts-open-folder', () => {
    if (userscriptManager) shell.openPath(userscriptManager.dir);
  });
  ipcMain.handle('userscripts-scan', async () => {
    if (!userscriptManager) return { scripts: [], tracker: {} };
    const scripts = await userscriptManager.scanScripts();
    const tracker = await userscriptManager.loadTracker(scripts);
    return { scripts, tracker };
  });
  ipcMain.handle('userscripts-set-tracker', (_e, tracker: Record<string, boolean>) => {
    if (userscriptManager) userscriptManager.saveTracker(tracker);
  });
  ipcMain.handle('userscripts-load-prefs', (_e, filename: string) => {
    if (!userscriptManager) return {};
    return userscriptManager.loadScriptPrefs(filename);
  });
  ipcMain.handle('userscripts-save-prefs', (_e, filename: string, prefs: Record<string, unknown>) => {
    if (userscriptManager) userscriptManager.saveScriptPrefs(filename, prefs);
  });

  // ── Action button IPC handlers ──
  ipcMain.handle('open-electron-log', () => {
    shell.openPath(getLogPath());
  });
  ipcMain.handle('reset-swapper', async () => {
    try {
      const entries = await fsp.readdir(swapDir, { withFileTypes: true });
      for (const entry of entries) {
        await fsp.rm(join(swapDir, entry.name), { recursive: true, force: true });
      }
      return true;
    } catch (err) {
      electronLog.error('[KCC] Reset swapper failed:', err);
      return false;
    }
  });
  ipcMain.handle('restart-client', () => {
    app.relaunch();
    app.quit();
  });
  ipcMain.handle('reset-options', () => {
    config.clear();
    app.relaunch();
    app.quit();
  });
  ipcMain.handle('delete-all-data', async () => {
    config.clear();
    const userData = app.getPath('userData');
    try {
      await fsp.rm(join(userData, 'logs'), { recursive: true, force: true });
    } catch (err) {
      electronLog.warn('[KCC] Partial data deletion failed (non-fatal):', err);
    }
    app.relaunch();
    app.quit();
  });

  // ── Alt manager IPC handlers (credentials encrypted via safeStorage) ──
  const canEncrypt = safeStorage.isEncryptionAvailable();
  if (!canEncrypt) electronLog.warn('[KCC] safeStorage encryption not available — account passwords will use base64 fallback');

  function encryptString(plaintext: string): string {
    if (canEncrypt) return safeStorage.encryptString(plaintext).toString('base64');
    return Buffer.from(plaintext).toString('base64');
  }

  function decryptString(encrypted: string): string {
    if (canEncrypt) return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    return Buffer.from(encrypted, 'base64').toString();
  }

  ipcMain.handle('alt-list', () => {
    const accounts = config.get('accounts') || [];
    // Return only labels to the renderer — never send encrypted credentials
    return accounts.map((a: SavedAccount) => ({ label: a.label }));
  });

  ipcMain.handle('alt-save', (_e, data: { label: string; username: string; password: string }) => {
    const accounts = config.get('accounts') || [];
    const account: SavedAccount = {
      label: data.label,
      username: encryptString(data.username),
      password: encryptString(data.password),
    };
    accounts.push(account);
    config.set('accounts', accounts);
    return { success: true, index: accounts.length - 1 };
  });

  ipcMain.handle('alt-get-credentials', (_e, index: number) => {
    const accounts = config.get('accounts') || [];
    if (index < 0 || index >= accounts.length) return null;
    const acc = accounts[index];
    try {
      return {
        username: decryptString(acc.username),
        password: decryptString(acc.password),
      };
    } catch (err) {
      electronLog.error('[KCC] Failed to decrypt account credentials:', err);
      return null;
    }
  });

  ipcMain.handle('alt-remove', (_e, index: number) => {
    const accounts = config.get('accounts') || [];
    if (index < 0 || index >= accounts.length) return { success: false };
    accounts.splice(index, 1);
    config.set('accounts', accounts);
    return { success: true };
  });

  ipcMain.handle('alt-rename', (_e, index: number, newLabel: string) => {
    const accounts = config.get('accounts') || [];
    if (index < 0 || index >= accounts.length) return { success: false };
    accounts[index].label = newLabel;
    config.set('accounts', accounts);
    return { success: true };
  });

  // ── Stop page immediately on close to kill audio ──
  win.on('close', () => {
    win.webContents.setAudioMuted(true);
    win.webContents.stop();
  });

  // ── Shutdown: disconnect Discord, then close log streams ──
  app.on('will-quit', () => {
    discordRpc?.disconnect();
    electronLog.log('[KCC] Shutting down');
    closeLogStreams();
  });

  electronLog.log('[KCC] Initialization complete — loading game');

  // ── Load the game ──
  win.loadURL('https://krunker.io');
}

app.on('window-all-closed', () => {
  app.quit();
});
