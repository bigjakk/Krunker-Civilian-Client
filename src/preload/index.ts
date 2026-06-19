import { ipcRenderer } from 'electron';
import { fetchGame } from './matchmaker';
import type { MatchmakerConfig } from './matchmaker';
import { hookSettings } from './settings-render';
import { initUserscripts } from './userscripts';
import { initTranslator } from './translator';
import { setDeathAnimBlock, setMenuTimer, setWatermark, showToast } from './utils';
import { initChat } from './chat';
import { initHPCounter, initRankProgress } from './competitive';
import { initKeystrokes } from './keystrokes';
import type { KeystrokesConfig } from './keystrokes';
import { checkChangelog } from './changelog';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import { savedConsole as _console, setVerbose } from './saved-console';
import { initAltManagerButton } from './alt-manager';
import { startHidePopups, setClassicSocial } from './menu-tweaks';


_console.log('[KCC] Preload script loaded');

// preventDefault on wheel events avoids Chromium 100+ pacing frame production to vsync during scroll gestures (FPS would tank from 1000+ to refresh rate). Skip when target is inside a real scrollable element so menus still scroll.
window.addEventListener('wheel', (e: WheelEvent) => {
    let el = e.target as HTMLElement | null;
    while (el && el !== document.body && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowX === 'auto' || cs.overflowX === 'scroll')
            && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
        if (scrolls) return;
        el = el.parentElement;
    }
    e.preventDefault();
}, { capture: true, passive: false });

// ── Tell Krunker this is a client (enables "Client" settings tab) ──
(window as any).OffCliV = true;

// ── IPC bridge exposed as window.kcc ──
(window as any).kcc = {
  platform: {
    getInfo: () => ipcRenderer.invoke('get-platform'),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke('get-config', key),
    getAll: (keys: string[]) => ipcRenderer.invoke('get-all-config', keys),
    set: (key: string, value: unknown) => ipcRenderer.invoke('set-config', key, value),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  dev: {
    toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  },
  swapper: {
    openFolder: () => ipcRenderer.invoke('open-swap-folder'),
    getPath: () => ipcRenderer.invoke('get-swap-dir'),
  },
  userscripts: {
    openFolder: () => ipcRenderer.invoke('userscripts-open-folder'),
    getPath: () => ipcRenderer.invoke('userscripts-get-dir'),
  },
};

// ── Direct Server Ping Display (TCP RTT from main, overrides #pingText + #menuPingText) ──
// Locks the textContent setter on first value arrival so Krunker's writes become
// no-ops; we write via innerText (different setter) so our value sticks. The
// lock is deferred so Krunker's value passes through if our IPC never fires.
function initDirectPingDisplay(): void {
    const locked = new WeakSet<HTMLElement>();
    ipcRenderer.on('server-ping', (_e, ms: number) => {
        const text = String(ms);
        for (const id of ['pingText', 'menuPingText']) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (!locked.has(el)) {
                Object.defineProperty(el, 'textContent', { set: () => {}, configurable: true });
                locked.add(el);
            }
            el.innerText = text;
        }
    });
}

// ── Show Ping in Player List (numeric ms instead of icon) ──
// genList returns an HTML string — parse it, replace icon elements, return modified HTML.
function initShowPing(): void {
    const w = window as any;
    let attempts = 0;
    const poll = setInterval(() => {
        const origGenList = w.windows?.[22]?.genList;
        if (origGenList && !origGenList.__kccPingPatched) {
            clearInterval(poll);
            const patched = function (this: any) {
                const html = origGenList.call(this);
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                for (const icon of doc.querySelectorAll('.pListPing.material-icons')) {
                    const ping = icon.getAttribute('title');
                    icon.classList.remove('pListPing', 'material-icons');
                    icon.removeAttribute('title');
                    icon.textContent = ping ? ping + ' ' : 'N/A ';
                }
                return doc.body.innerHTML;
            };
            (patched as any).__kccPingPatched = true;
            w.windows[22].genList = patched;
        } else if (++attempts > 75) {
            clearInterval(poll);
        }
    }, 200);
}

// ── Matchmaker IPC listener ──
ipcRenderer.on('matchmaker-find', (_e, mmConfig: MatchmakerConfig) => {
  fetchGame(mmConfig, _console).catch((err) => _console.error('[KCC] Matchmaker error:', err));
});

// ── Toast from main (e.g. screenshot confirmation) ──
ipcRenderer.on('kcc-toast', (_e, msg: string) => showToast(msg));


// ── Wait for main process to signal page load, then poll for settings window ──
ipcRenderer.on('main_did-finish-load', () => {
  _console.log('[KCC] did-finish-load received, waiting to hook settings...');

  const isGamePage = window.location.pathname === '/' || window.location.pathname === '';

  // ── Batch all config reads into a single IPC call ──
  (window as any).closeClient = () => window.close();
  Promise.all([
    ipcRenderer.invoke('get-all-config', ['ui', 'userscripts', 'game', 'translator', 'keybinds', 'discord', 'advanced', 'performance']),
    ipcRenderer.invoke('get-platform'),
    ipcRenderer.invoke('get-version'),
  ]).then(([allConf, _platformInfo, currentVersion]: [any, any, string]) => {
    const uiConf = allConf.ui;
    const usConf = allConf.userscripts;
    const gameConf = allConf.game;
    const translatorConf = allConf.translator;
    const discordConf = allConf.discord;
    const advConf = allConf.advanced;

    // ── Verbose logging toggle ──
    setVerbose(advConf?.verboseLogging ?? false);

    // ── Exit button + UI toggles ──
    const showExit = uiConf ? (uiConf.showExitButton !== false) : true;
    const showExitBtn = () => {
      const btn = document.getElementById('clientExit');
      if (btn) {
        btn.style.display = showExit ? 'flex' : 'none';
        return true;
      }
      return false;
    };
    if (!showExitBtn()) {
      let exitAttempts = 0;
      const exitPoll = setInterval(() => {
        if (showExitBtn() || ++exitAttempts > 30) clearInterval(exitPoll);
      }, 500);
    }

    if (uiConf?.deathscreenAnimation) setDeathAnimBlock(true);
    if (uiConf?.hideMenuPopups) startHidePopups();
    if (uiConf?.menuTimer ?? true) setMenuTimer(true);
    if (isGamePage && uiConf?.classicSocial) setClassicSocial(true);

    // ── Direct server ping (TCP RTT to the game server, replaces Krunker's display) ──
    if (isGamePage && uiConf?.directServerPing) {
      initDirectPingDisplay();
    }

    // ── Show ping in player list ──
    if (isGamePage && (gameConf?.showPing ?? true)) {
      initShowPing();
    }

    // ── Raw input (Windows only — unadjustedMovement) ──
    if (isGamePage && process.platform === 'win32' && (gameConf?.rawInput ?? true)) {
      const origLock = HTMLCanvasElement.prototype.requestPointerLock;
      HTMLCanvasElement.prototype.requestPointerLock = function (opts?: any) {
        const promise = origLock.call(this, { ...opts, unadjustedMovement: true }) as any;
        if (promise && typeof promise.catch === 'function') {
          return promise.catch(() => origLock.call(this, opts));
        }
        return promise;
      };
    }

    // ── Better chat + Chat history ──
    if (isGamePage) {
      initChat({
        betterChat: gameConf?.betterChat ?? true,
        chatHistorySize: gameConf?.chatHistorySize ?? 200,
      }, _console);
    }

    // ── Competitive features ──
    if (isGamePage && (gameConf?.hpEnemyCounter ?? true)) {
      initHPCounter();
    }
    if (isGamePage) {
      initRankProgress();
    }

    // ── Keystrokes + Mouse overlay ──
    if (isGamePage) {
      ipcRenderer.invoke('get-config', 'keystrokes').then((ksConf: KeystrokesConfig | undefined) => {
        if (ksConf && (ksConf.enabled || ksConf.mouseEnabled)) initKeystrokes(ksConf);
      }).catch(() => { /* ignore */ });
    }

    // ── KCC watermark (in-game + menu) ──
    if (isGamePage) {
      setWatermark(uiConf?.watermark ?? true, currentVersion);
    }

    // ── Changelog popup ──
    if (isGamePage && (uiConf?.showChangelog ?? true)) {
      checkChangelog(currentVersion, uiConf?.lastSeenVersion || '');
    }

    // ── Battle Pass Claim All (game page only) ──
    // Poll for .bpBotH element — injects button when BP window is visible
    if (isGamePage) {
      const getClaimable = () => Array.from(document.querySelectorAll('.bpClaimB')).filter(
        (el: any) => el.offsetParent !== null && el.textContent?.trim() === 'Claim'
      );
      setInterval(() => {
        const bar = document.querySelector('.bpBotH') as HTMLElement | null;
        if (!bar || bar.offsetParent === null) return;
        const existing = document.getElementById('claimAllBtn');
        if (existing) {
          // Update state on re-check (rewards may have become claimable)
          const claimable = getClaimable();
          if (claimable.length > 0) {
            existing.textContent = 'Claim All';
            existing.classList.remove('disabled');
          } else {
            existing.textContent = 'Nothing to Claim';
            existing.classList.add('disabled');
          }
          return;
        }
        const claimable = getClaimable();
        const btn = document.createElement('div');
        btn.className = 'bpBtn skip';
        btn.id = 'claimAllBtn';
        btn.style.cssText = 'margin-left: 8px; cursor: pointer; background: #4CAF50;';
        if (claimable.length > 0) {
          btn.textContent = 'Claim All';
        } else {
          btn.textContent = 'Nothing to Claim';
          btn.classList.add('disabled');
        }
        btn.addEventListener('click', async () => {
          if (btn.classList.contains('disabled')) return;
          (window as any).playSelect?.(0.1);
          const items = getClaimable();
          if (items.length === 0) return;
          btn.textContent = 'Claiming...';
          btn.classList.add('disabled');
          for (const item of items) {
            (item as HTMLElement).click();
            await new Promise(r => setTimeout(r, 200));
          }
          const remaining = getClaimable();
          btn.textContent = remaining.length > 0 ? 'Claim All' : 'Nothing to Claim';
          btn.classList.toggle('disabled', remaining.length === 0);
        });
        bar.appendChild(btn);
      }, 500);
    }

    // ── Initialize userscripts ──
    const usEnabled = usConf ? usConf.enabled : true;
    if (usEnabled) {
      initUserscripts(_console).catch(err => _console.error('[KCC] Userscript init error:', err));
    }

    // ── Join as Spectator — auto-enable spectate on regular game join ──
    if (isGamePage && gameConf?.joinAsSpectator) {
      let attempts = 0;
      const poll = setInterval(() => {
        if (++attempts > 300) { clearInterval(poll); return; }
        const uiBase = document.getElementById('uiBase');
        if (!uiBase || uiBase.className === '') return;
        if (uiBase.className === 'onMenu') {
          const specBtn = document.querySelector('#spectButton input') as HTMLInputElement;
          if (specBtn && !specBtn.checked) {
            (window as any).setSpect(1);
          }
          clearInterval(poll);
        } else {
          clearInterval(poll);
        }
      }, 100);
    }

    // ── Initialize chat translator (game page only) ──
    if (isGamePage) {
      const mergedTl = { ...DEFAULT_CONFIG.translator, ...translatorConf };
      initTranslator(_console, mergedTl);
    }

    // ── Discord Rich Presence game state polling ──
    if (isGamePage && discordConf?.enabled) {
      const showMapMode = discordConf.showMapMode !== false;
      const showClass = discordConf.showClass !== false;
      const showTimer = discordConf.showTimer !== false;
      const showStatus = discordConf.showStatus !== false;

      let lastDetails = '';
      let lastState = '';
      let firstSend = true;
      let gameStartTimestamp = Math.floor(Date.now() / 1000);

      function pollDiscordState(): void {
        let details = '';
        let state = '';
        let startTimestamp: number | undefined = undefined;

        const w = window as any;
        const spectating = w.spectating;

        let gameActivity: any = null;
        if (typeof w.getGameActivity === 'function') {
          try { gameActivity = w.getGameActivity(); } catch { /* game API unavailable */ }
        }

        if (spectating) {
          if (showStatus) details = 'Spectating';
          if (showMapMode && gameActivity?.map) {
            state = gameActivity.map;
          }
        } else {
          const uiBase = document.getElementById('uiBase');
          if (uiBase && uiBase.className === 'onMenu') {
            if (showStatus) details = 'In Menus';
          } else {
            if (showMapMode) {
              if (gameActivity?.mode && gameActivity?.map) {
                details = gameActivity.mode + ' on ' + gameActivity.map;
              } else {
                const mapInfo = document.getElementById('mapInfo');
                details = mapInfo?.textContent || 'Playing Krunker';
              }
            }

            if (showClass) {
              if (gameActivity?.class?.name) {
                state = gameActivity.class.name;
              } else {
                const classElem = document.getElementById('menuClassName');
                if (classElem?.textContent) state = classElem.textContent;
              }
            }

            if (showTimer) startTimestamp = gameStartTimestamp;
          }
        }

        if (firstSend || details !== lastDetails || state !== lastState) {
          if (startTimestamp && lastDetails !== details) {
            gameStartTimestamp = Math.floor(Date.now() / 1000);
            startTimestamp = gameStartTimestamp;
          }
          lastDetails = details;
          lastState = state;
          firstSend = false;
          ipcRenderer.send('discord-update', {
            details: details || undefined,
            state: state || undefined,
            startTimestamp,
            largeImageKey: 'krunker',
            largeImageText: 'Krunker Civilian Client',
          });
        }
      }

      pollDiscordState();
      setInterval(pollDiscordState, 5000);
      document.addEventListener('pointerlockchange', pollDiscordState);
    }
    // ── In-game Accounts quick-switch button ──
    if (isGamePage) initAltManagerButton();

  }).catch((err) => _console.error('[KCC] preload init failed:', err));

  const pollInterval = setInterval(() => {
    const w = window as any;
    if (
      Object.hasOwn(w, 'showWindow')
      && typeof w.showWindow === 'function'
      && Object.hasOwn(w, 'windows')
      && Array.isArray(w.windows)
      && w.windows.length >= 0
      && typeof w.windows[0] !== 'undefined'
      && typeof w.windows[0].changeTab === 'function'
    ) {
      clearInterval(pollInterval);
      _console.log('[KCC] Settings window found, hooking...');
      hookSettings();
    }
  }, 500);
});

// ── Lightweight tab page init (skips game-only features) ──
ipcRenderer.on('main_did-finish-load-tab', () => {
  _console.log('[KCC] Tab page loaded');
  (window as any).closeClient = () => window.close();
});
