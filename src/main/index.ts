import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, powerSaveBlocker, safeStorage, session, shell, webContents } from 'electron';
import { join, extname, basename, dirname, resolve as resolvePath } from 'path';
import { existsSync, mkdirSync, promises as fsp } from 'fs';
import { get as httpsGet } from 'https';
import { execFile } from 'child_process';
import * as os from 'os';
import { Socket } from 'net';
import { detectPlatform, applyPlatformFlags, getValidAngleBackends, devWindowIcon } from './platform';
import { config, Keybind, DEFAULT_KEYBINDS, SavedAccount, DEFAULT_CONFIG, SocialMusicSource } from './config';
import { initSwapperProtocol, registerSwapperFileProtocol, ResourceSwapper, filePathToSwapURL } from './swapper';
import { listSkyImages, resolveSkyImage, SKIES_DIR, SKY_TEXTURE_RE, SKY_IMAGE_EXTS } from './sky-textures';
import { UserscriptManager } from './userscripts';
import { ALL_CLIENT_CSS, HIDE_ADS_CSS, CONSENT_DISMISS_JS } from './client-ui';
import { electronLog, getLogPath, closeLogStreams } from './logger';
import { checkForUpdate, downloadUpdate, installUpdate, checkForUpdateNotice, RELEASES_URL } from './updater';
import { createSplash, splashStatus, splashPrompt, splashAlive, splashElapsed, getSplash, onSplashUserClosed, closeSplash } from './splash';
import { DiscordRPC } from './discord-rpc';
import { listThemes, getThemeCSS, listLoadingThemes, getLoadingScreenCSS, GAME_THEMES_DIR, SOCIAL_THEMES_DIR } from './css-themes';
import { TabManager } from './tab-manager';
import { openRankedQueue, reapplyRankedQueueThrottle, DEFAULT_RANKED_AUDIO_URL } from './ranked-queue';
import { applyCpuThrottle, attachThrottleRecovery, menuThrottleRate } from './cpu-throttle';
import { takeScreenshot, openScreenshotsFolder } from './screenshot';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_MUSIC_BYTES = 30 * 1024 * 1024;

/** The extension allowlist is load-bearing — this inlines file bytes into a renderer. */
async function readAudio(path: string, maxBytes: number): Promise<{ bytes: Buffer; mime: string } | null> {
  try {
    const mime = AUDIO_MIME[extname(path).toLowerCase()];
    if (!mime) throw new Error('unsupported audio type');
    const stat = await fsp.stat(path);
    if (!stat.isFile()) throw new Error('not a file');
    if (stat.size > maxBytes) {
      electronLog.warn(`[KCC] Audio file too large (${stat.size} bytes, max ${maxBytes}): ${path}`);
      return null;
    }
    return { bytes: await fsp.readFile(path), mime };
  } catch (err) {
    electronLog.warn(`[KCC] Audio file invalid (${path}):`, err);
    return null;
  }
}

async function resolveRankedAudioUrl(setting: string): Promise<string> {
  const s = (setting || '').trim();
  if (!s) return DEFAULT_RANKED_AUDIO_URL;
  if (/^https?:\/\//i.test(s)) return s;
  const a = await readAudio(s, MAX_AUDIO_BYTES);
  return a ? `data:${a.mime};base64,${a.bytes.toString('base64')}` : DEFAULT_RANKED_AUDIO_URL;
}

/** Local files come back as raw bytes for a Blob; base64 would add a third again. */
async function resolveSocialMusic(setting: string): Promise<SocialMusicSource> {
  const s = (setting || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return { url: s };
  return await readAudio(s, MAX_MUSIC_BYTES);
}

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

// ── Direct server ping (TCP-connect timing — measures the same TCP path the game's WebSocket uses) ──
let _pingTimer: NodeJS.Timeout | null = null;
let _pingTarget: { host: string; port: number } | null = null;

function tcpPing(host: string, port: number): Promise<number> {
  return new Promise((resolve) => {
    const sock = new Socket();
    const start = process.hrtime.bigint();
    const done = (ms: number) => { sock.destroy(); resolve(ms); };
    sock.setTimeout(1800);
    sock.once('connect', () => done(Math.round(Number(process.hrtime.bigint() - start) / 1_000_000)));
    sock.once('error', () => done(-1));
    sock.once('timeout', () => done(-1));
    try { sock.connect(port, host); } catch { done(-1); }
  });
}

function setPingTarget(host: string, port: number, win: BrowserWindow): void {
  if (_pingTarget?.host === host && _pingTarget?.port === port) return;
  if (_pingTimer) clearInterval(_pingTimer);
  _pingTarget = { host, port };
  const measure = async () => {
    if (!_pingTarget || win.isDestroyed()) return;
    const ms = await tcpPing(_pingTarget.host, _pingTarget.port);
    if (ms < 0 || win.isDestroyed() || win.webContents.isDestroyed()) return;
    // The render frame can be disposed mid-navigation (or by a renderer crash) while
    // the window itself survives; send() then throws "Render frame was disposed".
    try { win.webContents.send('server-ping', ms); } catch { /* frame gone */ }
  };
  measure();
  _pingTimer = setInterval(measure, 2000);
}

function stopServerPing(): void {
  if (_pingTimer) clearInterval(_pingTimer);
  _pingTimer = null;
  _pingTarget = null;
}


// ── Platform flags (must run before app.ready) ──
const platformInfo = detectPlatform();
const advancedConfig = { ...DEFAULT_CONFIG.advanced, ...config.get('advanced') };
const perfConfig = { ...config.get('performance') };

// Self-heal angleBackend if a previous version's value is no longer valid for this platform (e.g. user picked 'vulkan', 'd3d9', etc., and we removed it).
const validBackends = getValidAngleBackends(platformInfo);
if (advancedConfig.angleBackend && !validBackends.includes(advancedConfig.angleBackend)) {
  electronLog.warn(`[KCC] Invalid angleBackend '${advancedConfig.angleBackend}' for ${platformInfo.os}, resetting to 'default'`);
  advancedConfig.angleBackend = 'default';
  config.set('advanced', { ...config.get('advanced'), angleBackend: 'default' });
}

applyPlatformFlags(platformInfo, advancedConfig, perfConfig);

// ── User agent ──
// Deliberately not a browser UA. Electron's default reports the true Chromium build, a
// version real Chrome can't emit, and the captcha rejects it. Claiming to be Chrome instead
// invites a consistency check our Sec-CH-UA fails, which only survives on well-reputed IPs.
// Claiming nothing has nothing to contradict. Krunker reads 'Electron' to keep the captcha
// clearance across refreshes.
app.userAgentFallback = 'Electron';

// ── App identity (must match electron-builder appId for taskbar pin persistence) ──
app.setAppUserModelId('com.krunkercivilian.client');

// ── Resource swapper protocol (must register before app.ready) ──
initSwapperProtocol();

app.setAsDefaultProtocolClient('kcc');

let pendingProtocolUrl: string | null = null;
let mainWindowForProtocol: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const kccUrl = argv.find((arg: string) => typeof arg === 'string' && arg.startsWith('kcc://'));
    if (kccUrl) {
      if (mainWindowForProtocol && !mainWindowForProtocol.isDestroyed()) {
        mainWindowForProtocol.show();
        if (mainWindowForProtocol.isMinimized()) mainWindowForProtocol.restore();
        mainWindowForProtocol.focus();
        mainWindowForProtocol.webContents.send('kcc-protocol', kccUrl);
      } else {
        pendingProtocolUrl = kccUrl;
      }
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('kcc://')) {
    if (mainWindowForProtocol && !mainWindowForProtocol.isDestroyed()) {
      mainWindowForProtocol.show();
      mainWindowForProtocol.focus();
      mainWindowForProtocol.webContents.send('kcc-protocol', url);
    } else {
      pendingProtocolUrl = url;
    }
  }
});

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

// ── Bunny NPC blocklist (mirrors Glorp) ──
// Glorp nullifies these URIs via `request.SetUri(null)` — we emulate by redirecting
// to an empty data URL so Krunker's OBJLoader parses zero geometry (vs cancelling,
// which triggers fallback behavior in Krunker). 60585 is a whole-folder block (all
// file types for that asset id); 618xx are model.obj-only.
const BUNNY_URL_PATTERNS = [
  '*://user-assets.krunker.io/60585/*',
  '*://user-assets.krunker.io/61806/model.obj*',
  '*://user-assets.krunker.io/61814/model.obj*',
  '*://user-assets.krunker.io/61815/model.obj*',
  '*://user-assets.krunker.io/61818/model.obj*',
  '*://user-assets.krunker.io/61820/model.obj*',
  '*://user-assets.krunker.io/61821/model.obj*',
  '*://user-assets.krunker.io/61822/model.obj*',
  '*://user-assets.krunker.io/61823/model.obj*',
  '*://user-assets.krunker.io/61824/model.obj*',
];
const BUNNY_URL_RE = /user-assets\.krunker\.io\/(?:60585\/|(?:61806|61814|61815|61818|61820|61821|61822|61823|61824)\/model\.obj)/;
const EMPTY_RESPONSE_URL = 'data:,';
let hideBunnies = false;

// ── Turf Wars clan banner blocklist ──
// EnvRankBanner props (wall/pole banner variants) placed on official maps to
// show the owning clan. Blocking model.obj drops the whole prop, clan overlay
// included — same empty-redirect trick as the bunnies.
const TURF_BANNER_URL_PATTERNS = [
  '*://user-assets.krunker.io/64295/model.obj*',
  '*://user-assets.krunker.io/64300/model.obj*',
  '*://user-assets.krunker.io/64301/model.obj*',
  '*://user-assets.krunker.io/64303/model.obj*',
];
const TURF_BANNER_URL_RE = /user-assets\.krunker\.io\/(?:64295|64300|64301|64303)\/model\.obj/;
let hideTurfBanners = false;

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

  // macOS: opt out of App Nap / timer coalescing for the whole app lifetime.
  // Finder/LaunchServices-launched instances get app-role scheduling (App Nap
  // eligibility, coalesced timers, E-core steering for lower-QoS threads) that
  // degrades input/present pacing — the same build launched as a terminal child
  // consistently felt better (2026-07-08 investigation; probe-invisible, i.e.
  // below the page: present-to-glass level). prevent-app-suspension maps to
  // NSActivityUserInitiated. Held until process exit by design; no matching stop().
  if (process.platform === 'darwin') {
    powerSaveBlocker.start('prevent-app-suspension');
    electronLog.log('[KCC] App Nap / timer coalescing opt-out active (darwin)');
  }

  // ── Branded splash ──
  // Shows the poster art through the update check and the initial game load, and
  // hosts the update prompts/progress so startup is one uniform window. Closing it
  // before the main window exists quits the app (window-all-closed).
  createSplash(appVersion);

  // ── Update check ──
  // Only Windows NSIS self-installs: the Setup.exe swaps the app while it's closed.
  // macOS, Linux (AppImage), and Windows-portable can't swap a running app, so they
  // show a notice linking the release page for a manual download. Dev builds skip.
  const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  const isAppImage = !!process.env.APPIMAGE;
  const isDev = !app.isPackaged;
  const isNsisInstall = !isDev && process.platform === 'win32' && !isPortable && !isAppImage;

  if (isDev) {
    electronLog.log('[KCC] Skipping update check (dev mode)');
  } else if (isNsisInstall) {
    try {
      electronLog.log('[KCC] Checking for updates...');
      splashStatus('Checking for updates...', -1);
      const update = await checkForUpdate(appVersion);
      if (!splashAlive()) return; // user closed the splash — app is quitting
      const skippedVer = config.get('ui')?.skippedUpdateVersion || '';
      if (update && update.version === skippedVer) {
        electronLog.log(`[KCC] Update v${update.version} available but skipped by user preference`);
      } else if (update) {
        electronLog.log(`[KCC] Update available: v${update.version}`);

        const choice = await splashPrompt('install', update.version, appVersion);
        if (choice === 'closed') return; // app is quitting
        if (choice === 'secondary' || choice === 'secondary-skip') {
          electronLog.log('[KCC] User skipped update');
          if (choice === 'secondary-skip') {
            config.set('ui', { ...DEFAULT_CONFIG.ui, ...config.get('ui'), skippedUpdateVersion: update.version });
          }
        } else {
          const tempDir = join(app.getPath('temp'), 'kcc-update');
          if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
          const installerPath = join(tempDir, `KCC-${update.version}-Setup.exe`);

          try {
            splashStatus('Downloading update... 0%', 0);
            await downloadUpdate(update.downloadUrl, installerPath, (pct) => {
              // At 100% the bytes are down but downloadUpdate is still hashing the file,
              // so show "Verifying" + an indeterminate sweep instead of a stuck 100%.
              // splashStatus no-ops once the splash is gone.
              splashStatus(pct >= 100 ? 'Verifying download...' : `Downloading update... ${pct}%`, pct >= 100 ? -1 : pct);
            }, update.sha256);

            // Closing the splash mid-download is the cancel path (it also quits
            // the app via window-all-closed, since no other window exists yet).
            if (!splashAlive()) return;
            splashStatus('Installing update...', -1);
            installUpdate(installerPath);
            return; // installUpdate spawns the installer and quits the app
          } catch (err) {
            electronLog.error('[KCC] Update download/install failed:', err);
            const splashWin = getSplash();
            if (!splashWin) return; // splash gone — app is quitting
            splashStatus('Update failed');
            // The user accepted this update — surface the failure instead of silently
            // launching the old version, which would just repeat the prompt next launch.
            const detail = (err as Error).message || String(err);
            const { response } = await dialog.showMessageBox(splashWin, {
              type: 'error',
              title: 'Update failed',
              message: `The update to v${update.version} could not be installed.`,
              detail: `${detail}\n\nYou can download it manually from the releases page — the current version keeps working in the meantime.`,
              buttons: ['Open Releases Page', 'Continue'],
              defaultId: 1,
              cancelId: 1,
            });
            if (response === 0) await shell.openExternal(RELEASES_URL).catch(() => { });
          }
        }
      } else {
        electronLog.log('[KCC] No updates available');
      }
    } catch (err) {
      electronLog.error('[KCC] Update check failed:', err);
    }
  } else {
    // macOS (DMG) / Linux (AppImage) / Windows portable: can't self-install — just
    // notify and link to the release page so the user can grab the right download.
    try {
      electronLog.log('[KCC] Checking for updates (notify-only)...');
      splashStatus('Checking for updates...', -1);
      const notice = await checkForUpdateNotice(appVersion);
      if (!splashAlive()) return; // user closed the splash — app is quitting
      const skippedVer = config.get('ui')?.skippedUpdateVersion || '';
      if (notice && notice.version === skippedVer) {
        electronLog.log(`[KCC] Update v${notice.version} available but skipped by user preference`);
      } else if (notice) {
        electronLog.log(`[KCC] Update available (notify-only): v${notice.version}`);
        const choice = await splashPrompt('notice', notice.version, appVersion);
        if (choice === 'closed') return; // app is quitting
        if (choice === 'secondary-skip') {
          config.set('ui', { ...DEFAULT_CONFIG.ui, ...config.get('ui'), skippedUpdateVersion: notice.version });
        }
        if (choice === 'primary') {
          // Open the release page and quit instead of launching the old version.
          electronLog.log('[KCC] User chose to download update; opening release page and quitting');
          await shell.openExternal(notice.releaseUrl).catch(() => { });
          app.quit();
          return;
        }
      } else {
        electronLog.log('[KCC] No updates available');
      }
    } catch (err) {
      electronLog.error('[KCC] Update notice check failed:', err);
    }
  }

  if (!splashAlive()) return; // user closed the splash — app is quitting
  splashStatus('Loading Krunker...', -1);
  await launchApp();
});

async function launchApp(): Promise<void> {
  electronLog.log('[KCC] Starting initialization');

  // Invariant: the splash window is still open here and stays open until the main
  // window's first page load finishes. At least one window must exist at every point
  // of startup — window-all-closed quits the app.

  // ── Session: persistent partition ──
  const ses = session.fromPartition('persist:krunker');

  // ── Resource swapper ──
  const swapperConfig = config.get('swapper');
  const swapDir = swapperConfig.path || join(app.getPath('userData'), 'Krunker Civilian Client', 'swapper');
  // Ensure swap subdirectories exist (themes/, backgrounds/, socialthemes/, skies/)
  for (const sub of [GAME_THEMES_DIR, 'backgrounds', SOCIAL_THEMES_DIR, SKIES_DIR]) {
    const dir = join(swapDir, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  registerSwapperFileProtocol(ses, swapDir);

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
  const gameConf = config.get('game');
  hideBunnies = gameConf?.hideBunnies ?? false;
  hideTurfBanners = gameConf?.hideTurfBanners ?? false;
  // *://* matches only http/https — wss needs an explicit pattern so the
  // webRequest handler fires on WebSocket upgrades for direct-ping detection.
  const requestFilterUrls = [
    ...BLOCKED_URL_PATTERNS,
    ...BUNNY_URL_PATTERNS,
    ...TURF_BANNER_URL_PATTERNS,
    '*://*.krunker.io/*',
    'wss://*.krunker.io/*',
  ];

  ses.webRequest.onBeforeRequest({ urls: requestFilterUrls }, (details, callback) => {
    // Direct ping: detect game-server WebSocket (lobby-* host) and start TCP timing.
    if (details.resourceType === 'webSocket'
      && details.url.includes('lobby-')
      && config.get('ui')?.directServerPing) {
      try {
        const u = new URL(details.url);
        const port = u.port ? parseInt(u.port) : (u.protocol === 'wss:' ? 443 : 80);
        const wc = details.webContentsId != null ? webContents.fromId(details.webContentsId) : null;
        const w = wc ? BrowserWindow.fromWebContents(wc) : null;
        if (w) setPingTarget(u.hostname, port, w);
      } catch { /* invalid URL — ignore */ }
    }
    // Bunny NPC block — redirect to empty body (matches Glorp's SetUri(null))
    if (hideBunnies && BUNNY_URL_RE.test(details.url)) {
      return callback({ redirectURL: EMPTY_RESPONSE_URL });
    }
    // Turf Wars clan banner block — same empty-body redirect
    if (hideTurfBanners && TURF_BANNER_URL_RE.test(details.url)) {
      return callback({ redirectURL: EMPTY_RESPONSE_URL });
    }
    // Sky dome texture — redirect the sentinel asset to the user's local image.
    // Config is read here rather than cached: this fires once per map load.
    if (SKY_TEXTURE_RE.test(details.url)) {
      const skyFile = resolveSkyImage(config.get('ui')?.skyImage || '', swapDir);
      if (skyFile) return callback({ redirectURL: filePathToSwapURL(skyFile) });
    }
    // Check swapper next — redirect matching assets to local files
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
    show: false,
    backgroundColor: '#000000',
    icon: devWindowIcon(),
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

  // Created hidden: the splash covers the initial page load. Saved maximize/
  // fullscreen state is applied at reveal time — maximize() on a hidden window
  // would show it immediately.
  let revealed = false;
  let revealFallback: ReturnType<typeof setTimeout> | null = null;
  const revealMainWindow = (): void => {
    if (revealed) return;
    revealed = true;
    if (revealFallback) clearTimeout(revealFallback);
    if (!win.isDestroyed()) {
      if (savedWindow.fullscreen) win.setFullScreen(true);
      else if (savedWindow.maximized) win.maximize();
      win.show();
    }
    closeSplash();
  };
  // A fast page load would reduce the splash to a flash — hold the reveal until
  // the splash has been on screen for a minimum time.
  const MIN_SPLASH_DISPLAY_MS = 3000;
  const revealAfterMinimum = (): void => {
    const wait = Math.max(0, MIN_SPLASH_DISPLAY_MS - splashElapsed());
    if (wait > 0) setTimeout(revealMainWindow, wait);
    else revealMainWindow();
  };
  // Reveal when the first load finishes (krunker's own loading screen takes over),
  // when it fails (offline — show the error rather than hanging on the splash),
  // or after a hard cap so a stalled load can't keep the window hidden forever.
  win.webContents.once('did-finish-load', revealAfterMinimum);
  win.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    // -3 = ERR_ABORTED (superseded navigation) — not a real failure
    if (isMainFrame && errorCode !== -3) revealAfterMinimum();
  });
  revealFallback = setTimeout(revealMainWindow, 15000);
  // If the user closes the splash early, show the window immediately, whatever
  // state it's in — no minimum hold on an explicit dismiss.
  onSplashUserClosed(revealMainWindow);

  mainWindowForProtocol = win;
  if (pendingProtocolUrl) {
    win.webContents.send('kcc-protocol', pendingProtocolUrl);
    pendingProtocolUrl = null;
  }

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

  // ── Keybind capture lock (suppresses shortcuts while a modal dialog is open) ──
  // Refcounted so nested modals (e.g. the delete confirm opened over the alt
  // manager) don't unlock shortcuts when the inner one closes while the outer
  // is still open. Every opener sends true on open and false on close.
  let keybindCaptureCount = 0;
  let keybindCapturing = false;
  ipcMain.on('keybind-capture', (_e, capturing: boolean) => {
    keybindCaptureCount = Math.max(0, keybindCaptureCount + (capturing ? 1 : -1));
    keybindCapturing = keybindCaptureCount > 0;
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
      try {
        const u = new URL(text);
        if (u.protocol === 'https:' && u.hostname.endsWith('krunker.io')) win.loadURL(text);
        else electronLog.warn('[KCC] Join-from-clipboard: clipboard is not a krunker.io https URL');
      } catch { electronLog.warn('[KCC] Join-from-clipboard: clipboard is not a valid URL'); }
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
    } else if (matchesKeybind(input, binds.screenshot)) {
      void takeScreenshot(win);
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
  let cachedGameConf: typeof DEFAULT_CONFIG.game | null = null;
  function getGameConf(): typeof DEFAULT_CONFIG.game {
    if (!cachedGameConf) cachedGameConf = { ...DEFAULT_CONFIG.game, ...config.get('game') };
    return cachedGameConf;
  }

  // ── CPU throttle (trades frame rate for lower CPU/GPU load and heat) ──
  let currentThrottleState: 'game' | 'menu' = 'menu';
  const mainThrottleRate = (): number => {
    const perf = config.get('performance');
    return currentThrottleState === 'game' ? (perf?.throttleGame ?? 1) : (perf?.throttleMenu ?? 1);
  };
  attachThrottleRecovery(win.webContents, mainThrottleRate);

  // ── Tab Manager ──
  const preloadPath = join(__dirname, '..', 'preload', 'index.js');
  let tabMode: 'same' | 'new' = getGameConf().socialTabBehaviour === 'Same Window' ? 'same' : 'new';
  let sessionTabs: string[] = [];
  // Tracked separately from config because set-config defers the actual write
  let socialTheme = config.get('ui')?.socialCssTheme || 'disabled';
  const socialThemeCSS = () => getThemeCSS(socialTheme, swapDir, SOCIAL_THEMES_DIR);
  let tabManager = new TabManager(
    win, ses, preloadPath, tabMode, isGameURL,
    () => config.get('tabWindow'),
    (state) => config.set('tabWindow', state),
    () => sessionTabs,
    (urls) => { sessionTabs = urls; },
    () => config.get('game.rememberTabs') ?? false,
    socialThemeCSS,
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
    if (swapper) swapper.rescan().catch((err) => electronLog.warn('[KCC] Swapper rescan failed:', err));

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
      win.webContents.executeJavaScript(`(() => {
        const s = document.createElement('style');
        s.id = 'kcc-user-theme';
        s.textContent = ${JSON.stringify(themeCSS)};
        document.head.appendChild(s);
      })()`).catch((err) => electronLog.warn('[KCC] Theme inject failed:', err));
    }

    // Inject loading screen background
    const loadingCSS = getLoadingScreenCSS(uiConf?.loadingTheme || 'disabled', uiConf?.backgroundUrl || '', swapDir);
    if (loadingCSS) cssInjections.push(win.webContents.insertCSS(loadingCSS));

    Promise.all(cssInjections).catch((err) => electronLog.warn('[KCC] CSS injection failed:', err));

    // Every load starts on the menu screen
    currentThrottleState = 'menu';
    applyCpuThrottle(win.webContents, menuThrottleRate());

    win.webContents.executeJavaScript(ESCAPE_POINTERLOCK_FIX_JS).catch((err) => electronLog.warn('[KCC] Pointerlock fix inject failed:', err));
    win.webContents.executeJavaScript(CONSENT_DISMISS_JS).catch((err) => electronLog.warn('[KCC] Consent dismiss inject failed:', err));
    // Notify preload to start hooking settings (matches Crankshaft's timing)
    win.webContents.send('main_did-finish-load');
  });

  // Window focus gates social-hub music — see social-music.ts. Guarded because
  // blur can arrive while the window is being torn down.
  const sendFocus = (focused: boolean): void => {
    if (!win.isDestroyed()) win.webContents.send('kcc-window-focus', focused);
  };
  win.on('focus', () => sendFocus(true));
  win.on('blur', () => sendFocus(false));

  // ── IPC handlers ──
  // 'accounts' is intentionally excluded — it holds encrypted credential blobs.
  // The renderer must go through the dedicated alt-* handlers (alt-list returns
  // labels only), never the generic config getter, so page JS can't read it.
  const ALLOWED_CONFIG_KEYS = new Set<string>([
    'window', 'performance', 'game', 'swapper', 'matchmaker',
    'keybinds', 'userscripts', 'ui', 'discord', 'translator',
    'advanced', 'tabWindow', 'keystrokes',
  ]);

  // Settings categories included in export/import. Deliberately excludes:
  //   accounts          — encrypted alt-account credentials (never exported)
  //   window/tabWindow  — machine-specific window geometry
  //   savedTabs         — transient last-open tabs
  const EXPORT_CONFIG_KEYS = [
    'performance', 'game', 'keystrokes', 'swapper', 'matchmaker',
    'keybinds', 'userscripts', 'ui', 'discord', 'translator', 'advanced',
  ] as const;

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
  // Synchronous variant used by the settings render so the panel can rebuild in a
  // single tick (no async gap → no flash when Krunker clears #settHolder on tab switch).
  ipcMain.on('get-settings-data-sync', (e, keys: string[]) => {
    const cfg: Record<string, unknown> = {};
    for (const key of keys) {
      if (ALLOWED_CONFIG_KEYS.has(key)) cfg[key] = config.get(key as keyof typeof config.store);
    }
    e.returnValue = { config: cfg, platform: platformInfo, version: appVersion };
  });
  let configWriteTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingConfigWrites = new Map<string, unknown>();

  function flushPendingConfigWrites(): void {
    if (configWriteTimer) {
      clearTimeout(configWriteTimer);
      configWriteTimer = null;
    }
    for (const [k, v] of pendingConfigWrites) {
      config.set(k as any, v);
    }
    pendingConfigWrites.clear();
  }

  ipcMain.handle('set-config', (_e, key: string, value: unknown) => {
    if (!ALLOWED_CONFIG_KEYS.has(key)) return;
    // Flush immediately for keys that have side effects
    if (key === 'keybinds') {
      config.set(key as any, value);
      cachedKeybinds = null;
      return;
    }
    // Immediate write so the throttle re-apply (and any recovery event) reads fresh rates
    if (key === 'performance') {
      config.set(key as any, value);
      applyCpuThrottle(win.webContents, mainThrottleRate());
      const menuRate = menuThrottleRate();
      tabManager.applyCpuThrottleToAll(menuRate);
      reapplyRankedQueueThrottle(menuRate);
      return;
    }
    // Invalidate caches immediately (not on flush) to prevent stale reads
    if (key === 'game') {
      cachedGameConf = null;
      const newGame = value as any;
      hideBunnies = newGame?.hideBunnies ?? false;
      hideTurfBanners = newGame?.hideTurfBanners ?? false;
      // Switch tab mode if socialTabBehaviour changed
      if (newGame?.socialTabBehaviour) {
        const newMode: 'same' | 'new' = newGame.socialTabBehaviour === 'Same Window' ? 'same' : 'new';
        if (newMode !== tabMode) {
          tabManager.destroyAll();
          tabMode = newMode;
          tabManager = new TabManager(
            win, ses, preloadPath, tabMode, isGameURL,
            () => config.get('tabWindow'),
            (state) => config.set('tabWindow', state),
            () => sessionTabs,
            (urls) => { sessionTabs = urls; },
            () => config.get('game.rememberTabs') ?? false,
            socialThemeCSS,
          );
        }
      }
    }
    if (key === 'ui') {
      // Social CSS theme swaps live on open tabs
      const next = (value as any)?.socialCssTheme || 'disabled';
      if (next !== socialTheme) {
        socialTheme = next;
        tabManager.refreshSocialTheme();
      }
    }
    pendingConfigWrites.set(key, value);
    if (!configWriteTimer) {
      configWriteTimer = setTimeout(flushPendingConfigWrites, 300);
    }
  });
  ipcMain.on('throttle-state', (_e, state: string) => {
    currentThrottleState = (state === 'game') ? 'game' : 'menu';
    applyCpuThrottle(win.webContents, mainThrottleRate());
  });
  ipcMain.handle('window-minimize', () => win.minimize());
  ipcMain.handle('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.handle('window-close', () => win.close());
  ipcMain.handle('window-is-maximized', () => win.isMaximized());
  ipcMain.handle('toggle-devtools', () => win.webContents.toggleDevTools());
  ipcMain.handle('open-external', (_e, url: string) => safeOpenExternal(url));
  ipcMain.handle('inject-game-click', () => {
    const [width, height] = win.getContentSize();
    const x = Math.round(width / 2);
    const y = Math.round(height / 2);
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  });
  ipcMain.handle('get-swap-dir', () => swapDir);
  ipcMain.handle('open-swap-folder', () => shell.openPath(swapDir));
  ipcMain.handle('open-themes-folder', () => shell.openPath(join(swapDir, GAME_THEMES_DIR)));
  ipcMain.handle('open-social-themes-folder', () => shell.openPath(join(swapDir, SOCIAL_THEMES_DIR)));
  ipcMain.handle('open-backgrounds-folder', () => shell.openPath(join(swapDir, 'backgrounds')));
  ipcMain.handle('open-skies-folder', () => shell.openPath(join(swapDir, SKIES_DIR)));
  ipcMain.handle('open-screenshots-folder', () => openScreenshotsFolder());

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
  ipcMain.on('open-ranked-queue', async (_e, token: string, region: string, allRegions: boolean) => {
    const mm = config.get('matchmaker');
    const audioUrl = await resolveRankedAudioUrl(mm?.rankedMatchSound || '');
    const showHeader = config.get('ui')?.watermark ?? true;
    openRankedQueue(token, region, allRegions, audioUrl, showHeader);
  });

  ipcMain.handle('pick-audio-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Audio File',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return '';
    return result.filePaths[0];
  });

  // Copies the pick in rather than storing its path: kcc-swap only serves files under the swap dir.
  ipcMain.handle('pick-sky-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Sky Image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: SKY_IMAGE_EXTS }],
    });
    if (result.canceled || result.filePaths.length === 0) return '';
    const src = result.filePaths[0];
    const ext = extname(src);
    // The dialog filter is advisory — the file name box opens anything typed into it
    if (!SKY_IMAGE_EXTS.includes(ext.slice(1).toLowerCase())) throw new Error(`Not a sky image: ${src}`);
    const destDir = join(swapDir, SKIES_DIR);
    if (dirname(resolvePath(src)) === resolvePath(destDir)) return `swap:${basename(src)}`;
    mkdirSync(destDir, { recursive: true });
    const stem = basename(src, ext);
    let name = `${stem}${ext}`;
    for (let n = 1; existsSync(join(destDir, name)); n++) name = `${stem} (${n})${ext}`;
    await fsp.copyFile(src, join(destDir, name));
    return `swap:${name}`;
  });

  ipcMain.handle('resolve-ranked-sound', (_e, setting: string) => resolveRankedAudioUrl(setting));

  ipcMain.handle('resolve-social-music', (_e, setting: string) => resolveSocialMusic(setting));

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

  // ── CSS theme & loading background IPC handlers ──
  ipcMain.handle('list-themes', () => listThemes(swapDir));
  ipcMain.handle('list-social-themes', () => listThemes(swapDir, SOCIAL_THEMES_DIR));
  ipcMain.handle('get-theme-css', (_e, themeId: string) => getThemeCSS(themeId, swapDir));
  ipcMain.handle('list-loading-themes', () => listLoadingThemes(swapDir));
  ipcMain.handle('list-sky-images', () => listSkyImages(swapDir));
  // Sync: the preload reads this once at top level, before wrapping fetch. The image
  // resolves here so a selected-but-missing file falls back to the gradient.
  ipcMain.on('get-sky-config', (e) => {
    const uiConf = config.get('ui');
    e.returnValue = {
      enabled: uiConf?.skyOverride ?? DEFAULT_CONFIG.ui.skyOverride,
      zenith: uiConf?.skyZenith || DEFAULT_CONFIG.ui.skyZenith,
      horizon: uiConf?.skyHorizon || DEFAULT_CONFIG.ui.skyHorizon,
      useImage: resolveSkyImage(uiConf?.skyImage || '', swapDir) !== null,
    };
  });
  ipcMain.handle('get-loading-screen-css', (_e, loadingTheme: string, backgroundUrl: string) => {
    return getLoadingScreenCSS(loadingTheme, backgroundUrl, swapDir);
  });

  // ── Changelog IPC handler (fetch release notes from GitHub) ──
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
    } catch (err) {
      electronLog.warn('[KCC] Changelog fetch failed for ' + tag + ':', err);
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
  ipcMain.handle('open-client-folder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('reset-swapper', async () => {
    try {
      const entries = await fsp.readdir(swapDir, { withFileTypes: true });
      for (const entry of entries) {
        await fsp.rm(join(swapDir, entry.name), { recursive: true, force: true });
      }
      electronLog.log('[KCC] Swapper reset (' + entries.length + ' entries cleared)');
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
    // Stop the page so Krunker can't re-persist anything mid-wipe.
    try { win.webContents.stop(); } catch { /* already gone */ }
    // Clear browsing data: the persistent Krunker partition holds the login token
    // and kro_setngss_* settings (localStorage), cookies, and cache. config.clear()
    // alone never touched these, which is why logins/settings used to survive.
    try {
      await ses.clearStorageData();
      await ses.clearCache();
      await session.defaultSession.clearStorageData();
      await session.defaultSession.clearCache();
    } catch (err) {
      electronLog.warn('[KCC] Clearing browsing data failed (non-fatal):', err);
    }
    config.clear();
    try {
      await fsp.rm(join(app.getPath('userData'), 'logs'), { recursive: true, force: true });
    } catch (err) {
      electronLog.warn('[KCC] Log deletion failed (non-fatal):', err);
    }
    // Userscripts and swapper files live under userData/Krunker Civilian Client/
    // and are intentionally left untouched.
    app.relaunch();
    app.quit();
  });

  // ── Settings export/import ──
  // Bundles client settings (allowlisted categories, never alt accounts) plus a
  // snapshot of Krunker's own settings (the s_* localStorage keys, passed in from
  // the renderer) into one JSON file. Import re-filters through the same allowlist.
  ipcMain.handle('export-settings', async (_e, krunkerSettings: Record<string, string> | undefined) => {
    flushPendingConfigWrites();

    const clientSettings: Record<string, unknown> = {};
    for (const key of EXPORT_CONFIG_KEYS) {
      clientSettings[key] = config.get(key as keyof typeof config.store);
    }
    // Shallow-copy the two categories we trim so we never mutate the live store.
    // Drop transient runtime fields that shouldn't travel between installs.
    clientSettings.game = { ...(clientSettings.game as Record<string, unknown>) };
    delete (clientSettings.game as Record<string, unknown>).lastServer;
    clientSettings.ui = { ...(clientSettings.ui as Record<string, unknown>) };
    delete (clientSettings.ui as Record<string, unknown>).lastSeenVersion;

    const payload = {
      app: 'Krunker-Civilian-Client',
      type: 'settings-export',
      formatVersion: 1,
      appVersion,
      exportedAt: new Date().toISOString(),
      client: clientSettings,
      krunker: krunkerSettings && typeof krunkerSettings === 'object' ? krunkerSettings : {},
    };

    const result = await dialog.showSaveDialog(win, {
      title: 'Export Settings',
      defaultPath: join(app.getPath('documents'), 'krunker-civilian-settings.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    try {
      await fsp.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
      electronLog.log('[KCC] Settings exported to ' + result.filePath);
      return { success: true, path: result.filePath };
    } catch (err) {
      electronLog.error('[KCC] Settings export failed:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('import-settings', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Settings',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    let parsed: any;
    try {
      const raw = await fsp.readFile(result.filePaths[0], 'utf-8');
      parsed = JSON.parse(raw);
    } catch (err) {
      electronLog.error('[KCC] Settings import: read/parse failed:', err);
      return { success: false, error: 'Could not read or parse the file.' };
    }

    if (!parsed || parsed.type !== 'settings-export' || typeof parsed.client !== 'object') {
      return { success: false, error: 'Not a valid Krunker Civilian Client settings file.' };
    }

    // Stale debounced set-config writes could otherwise fire after we apply and
    // clobber the import — flush them first so our config.set calls win.
    flushPendingConfigWrites();

    // Apply only allowlisted categories, merged over defaults so old/partial
    // exports keep their missing fields. 'accounts' can never be set here — it's
    // not in EXPORT_CONFIG_KEYS — so alt credentials are unaffected by import.
    // The renderer restarts the client after this, which is what makes every
    // imported setting (and derived state like tab mode / hideBunnies) take hold.
    let applied = 0;
    for (const key of EXPORT_CONFIG_KEYS) {
      const incoming = parsed.client[key];
      if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
        config.set(key as any, { ...(DEFAULT_CONFIG as Record<string, any>)[key], ...incoming });
        applied++;
      }
    }

    const krunker = parsed.krunker && typeof parsed.krunker === 'object' ? parsed.krunker : {};
    if (applied === 0 && Object.keys(krunker).length === 0) {
      return { success: false, error: 'No recognized settings found in the file.' };
    }
    electronLog.log('[KCC] Settings imported (' + applied + ' client categories, ' + Object.keys(krunker).length + ' Krunker keys) from ' + result.filePaths[0]);

    return { success: true, krunker };
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
    // Labels + the public avatar URL only — never the encrypted credentials.
    return accounts.map((a: SavedAccount) => ({ label: a.label, avatarUrl: a.avatarUrl || null }));
  });

  // Link the currently logged-in Krunker account (username + the avatar URL Krunker
  // rendered, both read by the renderer) to a saved account by matching the decrypted
  // username here in main. Lets us show each account's avatar without exposing
  // usernames to the renderer or hitting Krunker's (captcha-walled) profile API.
  ipcMain.handle('alt-link-current', (_e, username: string, avatarUrl: string) => {
    if (!username || !avatarUrl) return false;
    // Only accept https Krunker asset URLs — never arbitrary or data: URLs.
    try {
      const u = new URL(avatarUrl);
      if (u.protocol !== 'https:' || !u.hostname.endsWith('krunker.io')) return false;
    } catch { return false; }
    const accounts = config.get('accounts') || [];
    const target = username.toLowerCase();
    let changed = false;
    for (const acc of accounts) {
      try {
        if (decryptString(acc.username).toLowerCase() === target && acc.avatarUrl !== avatarUrl) {
          acc.avatarUrl = avatarUrl;
          changed = true;
        }
      } catch { /* skip accounts that fail to decrypt */ }
    }
    if (changed) config.set('accounts', accounts);
    return changed;
  });

  ipcMain.handle('alt-save', (_e, data: { label: string; username: string; password: string }) => {
    try {
      const accounts = config.get('accounts') || [];
      const account: SavedAccount = {
        label: data.label,
        username: encryptString(data.username),
        password: encryptString(data.password),
      };
      accounts.push(account);
      config.set('accounts', accounts);
      electronLog.log('[KCC] Saved alt account "' + data.label + '"');
      return { success: true, index: accounts.length - 1 };
    } catch (err) {
      electronLog.error('[KCC] Failed to save alt account:', err);
      return { success: false };
    }
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
    stopServerPing();
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
