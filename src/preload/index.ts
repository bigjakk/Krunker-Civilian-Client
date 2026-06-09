import { ipcRenderer } from 'electron';
import { fetchGame, MATCHMAKER_GAMEMODE_FILTER, MATCHMAKER_REGIONS, MATCHMAKER_REGION_NAMES, MATCHMAKER_MAP_FILTER, MATCHMAKER_MAP_NAMES, mapIconUrl } from './matchmaker';
import type { MatchmakerConfig } from './matchmaker';
import { initUserscripts, getInstances, setScriptEnabled } from './userscripts';
import type { UserscriptInstance } from './userscripts';
import { initTranslator, updateTranslatorConfig } from './translator';
import { setDeathAnimBlock, setMenuTimer, setWatermark, escapeHtml } from './utils';
import { initChat, setBetterChat, setChatHistorySize } from './chat';
import { initHPCounter, destroyHPCounter, initRankProgress } from './competitive';
import { initKeystrokes, updateKeystrokes } from './keystrokes';
import type { KeystrokesConfig } from './keystrokes';
import { checkChangelog, showChangelogNow } from './changelog';
import type { Keybind } from '../main/config';
import { DEFAULT_CONFIG } from '../main/config-defaults';
import { savedConsole as _console, setVerbose } from './saved-console';
import { openKeybindDialog, keybindDisplayString } from './keybind-dialog';
import {
  createKeybindRow, createSimpleKeyRow, createToggleRow, createSelectRow,
  createNumberRow, createCheckboxGrid, createSection,
  onSettingChanged, refreshIcon, resetRefreshNotification, setCollapsedState,
} from './settings-controls';
import { buildAccountsSection, initAltManagerButton } from './alt-manager';
import { startHidePopups, stopHidePopups, setClassicSocial } from './menu-tweaks';


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

function hookSettings(): void {
  const w = window as any;
  const settingsWindow = w.windows[0];
  let selectedTab: number = settingsWindow.tabIndex;

  function isClientTab(): boolean {
    const tabs = settingsWindow.tabs[settingsWindow.settingType];
    return tabs && selectedTab === tabs.length - 1;
  }

  function safeRender(): void {
    if (isClientTab()) renderSettings();
  }

  const origShowWindow = w.showWindow.bind(w);
  const origChangeTab = settingsWindow.changeTab.bind(settingsWindow);
  const origSearchList = settingsWindow.searchList.bind(settingsWindow);

  w.showWindow = (...args: unknown[]) => {
    const result = origShowWindow(...args);
    if (args[0] === 1) {
      if (settingsWindow.settingType === 'basic') {
        settingsWindow.toggleType({ checked: true });
      }
      const advSlider = document.querySelector('.advancedSwitch input#typeBtn') as HTMLInputElement | null;
      if (advSlider) {
        advSlider.disabled = true;
        if (advSlider.nextElementSibling) {
          advSlider.nextElementSibling.setAttribute('title', 'Client auto-enables advanced settings mode');
        }
      }

      const searchInput = document.getElementById('settSearch') as HTMLInputElement | null;
      const searchQuery = searchInput?.value?.trim() ?? '';
      if (searchQuery.length > 0) renderSettings(searchQuery);
      else if (isClientTab()) renderSettings();
    }
    return result;
  };

  settingsWindow.changeTab = (...args: unknown[]) => {
    const result = origChangeTab(...args);
    selectedTab = settingsWindow.tabIndex;
    safeRender();
    return result;
  };

  settingsWindow.searchList = (...args: unknown[]) => {
    const result = origSearchList(...args);
    const searchInput = document.getElementById('settSearch') as HTMLInputElement | null;
    const query = searchInput?.value?.trim() ?? '';
    if (query.length > 0) {
      renderSettings(query);
    } else {
      const existing = document.querySelector('#settHolder .kcc-settings');
      if (existing && !isClientTab()) existing.remove();
      else if (isClientTab()) renderSettings();
    }
    return result;
  };

  safeRender();
}

// ── Settings section builders ──

interface SettingsBag {
  binds: Record<string, Keybind>;
  saveBinds: () => void;
  isWindows: boolean;
}

function buildGeneralSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = { ...DEFAULT_CONFIG.game, ...gameConf };

  body.appendChild(createSelectRow({
    label: 'Social/Hub Tab Behaviour',
    desc: 'How social, market, and editor pages open when clicked',
    options: [{ value: 'New Window', label: 'Tabs (Separate Window)' }, { value: 'Same Window', label: 'Tabs (Overlay Game)' }],
    value: game.socialTabBehaviour, instant: true,
    onChange: (v) => { game.socialTabBehaviour = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  body.appendChild(createToggleRow({
    label: 'Remember Tabs',
    desc: 'Restore your open tabs when you reopen the social/hub window',
    checked: game.rememberTabs, instant: true,
    onChange: (v) => { game.rememberTabs = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  const ui = { ...DEFAULT_CONFIG.ui, ...uiConfRaw };

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  body.appendChild(createToggleRow({
    label: 'Classic Social',
    desc: 'Open the standalone social page in a tab instead of the in-game panel',
    checked: ui.classicSocial ?? false, instant: true,
    onChange: (v) => { ui.classicSocial = v; saveUI(); setClassicSocial(v); },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Exit Button',
    desc: 'Show the exit button in the game sidebar',
    checked: ui.showExitButton, instant: true,
    onChange: (v) => {
      ui.showExitButton = v; saveUI();
      const btn = document.getElementById('clientExit');
      if (btn) btn.style.display = v ? 'flex' : 'none';
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Join as Spectator',
    desc: 'Automatically enable spectate mode when joining a game',
    checked: game.joinAsSpectator, instant: true,
    onChange: (v) => { game.joinAsSpectator = v; ipcRenderer.invoke('set-config', 'game', game); },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Changelog',
    desc: 'Show release notes popup when the client updates',
    checked: ui.showChangelog ?? true, instant: true,
    onChange: (v) => { ui.showChangelog = v; saveUI(); },
  }));

  const changelogBtnRow = document.createElement('div');
  changelogBtnRow.className = 'setting settName safety-0 has-button';
  changelogBtnRow.innerHTML =
    '<span class="setting-title">Changelog</span>' +
    '<div class="setting-desc-new">View release notes for the current version</div>';
  const changelogBtn = document.createElement('div');
  changelogBtn.className = 'settingsBtn';
  changelogBtn.innerHTML = '<span class="material-icons">article</span> Show';
  changelogBtn.addEventListener('click', () => {
    ipcRenderer.invoke('get-version').then((ver: string) => showChangelogNow(ver));
  });
  changelogBtnRow.appendChild(changelogBtn);
  body.appendChild(changelogBtnRow);

  body.appendChild(createKeybindRow('Toggle Fullscreen', 'Fullscreen the game window (default F11)', bag.binds.fullscreenToggle, (b) => {
    bag.binds.fullscreenToggle = b;
    bag.saveBinds();
  }, undefined, true));
}

function buildGameSection(
  body: HTMLElement, gameConf: any, uiConfRaw: any, bag: SettingsBag,
): void {
  const game = { ...DEFAULT_CONFIG.game, ...gameConf };
  const ui = { ...DEFAULT_CONFIG.ui, ...uiConfRaw };

  function saveGame(): void {
    ipcRenderer.invoke('set-config', 'game', game);
  }
  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  if (bag.isWindows) {
    body.appendChild(createToggleRow({
      label: 'Raw Input',
      desc: 'Bypass OS mouse acceleration for direct 1:1 sensor input (Windows only)',
      checked: game.rawInput ?? true, refreshOnly: true,
      onChange: (v) => { game.rawInput = v; saveGame(); },
    }));
  }

  body.appendChild(createToggleRow({
    label: 'Show Ping in Player List',
    desc: 'Replace the ping icon with numeric millisecond values in the player list',
    checked: game.showPing ?? true, refreshOnly: true,
    onChange: (v) => { game.showPing = v; saveGame(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Direct Server Ping',
    desc: 'Replace Krunker\'s ping with a TCP round-trip measurement to the game server',
    checked: ui.directServerPing ?? false, refreshOnly: true,
    onChange: (v) => { ui.directServerPing = v; saveUI(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Hardpoint Enemy Counter',
    desc: 'Show enemy capture points in Hardpoint mode',
    checked: game.hpEnemyCounter ?? true, refreshOnly: true,
    onChange: (v) => {
      game.hpEnemyCounter = v; saveGame();
      if (v) initHPCounter(); else destroyHPCounter();
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Hide Bunny NPCs',
    desc: 'Block the bunny NPC models that spawn in public matches',
    checked: game.hideBunnies ?? false, refreshOnly: true,
    onChange: (v) => { game.hideBunnies = v; saveGame(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Block Death Screen Animation',
    desc: 'Disable the slide-in animation on the death screen',
    checked: ui.deathscreenAnimation, instant: true,
    onChange: (v) => { ui.deathscreenAnimation = v; saveUI(); setDeathAnimBlock(v); },
  }));

  body.appendChild(createToggleRow({
    label: 'Hide Menu Popups',
    desc: 'Hide promotional notifications, offers, and streams on the main menu',
    checked: ui.hideMenuPopups, instant: true,
    onChange: (v) => {
      ui.hideMenuPopups = v; saveUI();
      if (v) startHidePopups(); else stopHidePopups();
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Menu Timer',
    desc: 'Show the game/spectate timer on the menu screen',
    checked: ui.menuTimer ?? true, instant: true,
    onChange: (v) => { ui.menuTimer = v; saveUI(); setMenuTimer(v); },
  }));

  body.appendChild(createToggleRow({
    label: 'KCC Watermark',
    desc: 'Show the KCC version watermark in-game and on the menu',
    checked: ui.watermark ?? true, instant: true,
    onChange: (v) => { ui.watermark = v; saveUI(); setWatermark(v); },
  }));

  if (ui.deathscreenAnimation) setDeathAnimBlock(true);
  if (ui.menuTimer ?? true) setMenuTimer(true);
  if (ui.hideMenuPopups) startHidePopups();
}

function buildKeystrokesRows(body: HTMLElement): void {
  const ks: KeystrokesConfig = { ...DEFAULT_CONFIG.keystrokes };
  let loaded = false;

  function save(): void {
    if (!loaded) return;
    ipcRenderer.invoke('set-config', 'keystrokes', ks);
    updateKeystrokes(ks);
  }

  const enableRow = createToggleRow({
    label: 'Keystrokes Overlay',
    desc: 'Show on-screen WASD/Shift/Space + 2 aux keys (great for streaming)',
    checked: false, instant: true,
    onChange: (v) => { ks.enabled = v; save(); },
  });
  body.appendChild(enableRow);

  const mouseRow = createToggleRow({
    label: 'Mouse Overlay',
    desc: 'Show on-screen mouse buttons (L/M/R) and scroll wheel direction',
    checked: false, instant: true,
    onChange: (v) => { ks.mouseEnabled = v; save(); },
  });
  body.appendChild(mouseRow);

  const sizeRow = createNumberRow({
    label: 'Overlay Size',
    desc: 'Visual scale of the keystroke and mouse indicators (rem)',
    min: 1, max: 6, step: 0.1, value: 2.5, instant: true,
    onChange: (v) => { ks.size = v; save(); },
  });
  body.appendChild(sizeRow);

  const showAuxRow = createToggleRow({
    label: 'Show Aux Keys',
    desc: 'Display the two configurable aux key indicators in the keyboard overlay',
    checked: true, instant: true,
    onChange: (v) => { ks.showAuxKeys = v; save(); },
  });
  body.appendChild(showAuxRow);

  const aux1Row = createSimpleKeyRow({
    label: 'Aux Key 1',
    desc: 'First configurable key (default R, e.g. weapon switch). Click to rebind.',
    value: 'r', instant: true,
    onChange: (v) => { ks.auxKey1 = v; save(); },
  });
  body.appendChild(aux1Row);

  const aux2Row = createSimpleKeyRow({
    label: 'Aux Key 2',
    desc: 'Second configurable key (default N, e.g. knife). Click to rebind.',
    value: 'n', instant: true,
    onChange: (v) => { ks.auxKey2 = v; save(); },
  });
  body.appendChild(aux2Row);

  const KEYSTROKES_CREDIT_URL = 'https://gist.github.com/KraXen72/2ea1332440b0c66b83ca9b73afc38269';
  const creditRow = document.createElement('div');
  creditRow.className = 'setting settName safety-0';
  creditRow.innerHTML =
    '<span class="setting-title" style="font-weight:normal;opacity:0.75;font-size:0.9em;">' +
      'Keyboard overlay adapted from <a class="kcc-credit-link" style="color:#4cb3ff;cursor:pointer;text-decoration:underline;">KraXen72\'s Keystrokes userscript</a> for the Crankshaft Krunker client.' +
    '</span>';
  const creditLink = creditRow.querySelector('.kcc-credit-link') as HTMLElement;
  creditLink.addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.invoke('open-external', KEYSTROKES_CREDIT_URL);
  });
  body.appendChild(creditRow);

  ipcRenderer.invoke('get-config', 'keystrokes').then((conf: KeystrokesConfig | undefined) => {
    Object.assign(ks, DEFAULT_CONFIG.keystrokes, conf || {});
    const enableCb = enableRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (enableCb) enableCb.checked = !!ks.enabled;
    const mouseCb = mouseRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (mouseCb) mouseCb.checked = !!ks.mouseEnabled;
    const sizeRange = sizeRow.querySelector('input[type="range"]') as HTMLInputElement;
    const sizeNum = sizeRow.querySelector('input[type="number"]') as HTMLInputElement;
    if (sizeRange) sizeRange.value = String(ks.size);
    if (sizeNum) sizeNum.value = String(ks.size);
    const showAuxCb = showAuxRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (showAuxCb) showAuxCb.checked = !!ks.showAuxKeys;
    const aux1KeyEl = aux1Row.querySelector('.kcc-keyIcon') as HTMLElement;
    if (aux1KeyEl) aux1KeyEl.textContent = (ks.auxKey1 || 'R').toUpperCase();
    const aux2KeyEl = aux2Row.querySelector('.kcc-keyIcon') as HTMLElement;
    if (aux2KeyEl) aux2KeyEl.textContent = (ks.auxKey2 || 'N').toUpperCase();
    loaded = true;
  }).catch(() => { loaded = true; });
}

function buildPerformanceSection(
  body: HTMLElement, perfConf: any, isWindows: boolean,
): void {
  const perf = { ...DEFAULT_CONFIG.performance, ...perfConf };

  function savePerf(): void {
    ipcRenderer.invoke('set-config', 'performance', perf);
  }

  body.appendChild(createToggleRow({
    label: 'Unlimited FPS',
    desc: 'Uncap the frame rate (requires restart)',
    checked: perf.fpsUnlocked, restart: true,
    onChange: (v) => { perf.fpsUnlocked = v; savePerf(); },
  }));

  if (isWindows) {
    body.appendChild(createSelectRow({
      label: 'Process Priority',
      desc: 'OS-level process priority for the client (Windows only)',
      options: [
        { value: 'Normal', label: 'Normal' },
        { value: 'Above Normal', label: 'Above Normal' },
        { value: 'High', label: 'High' },
        { value: 'Below Normal', label: 'Below Normal' },
        { value: 'Low', label: 'Low' },
      ],
      value: perf.processPriority, restart: true, safety: 2,
      onChange: (v) => { perf.processPriority = v; savePerf(); },
    }));
  }
}

function buildSwapperSection(body: HTMLElement, swapperConf: any): void {
  const swapEnabled = swapperConf ? swapperConf.enabled : DEFAULT_CONFIG.swapper.enabled;

  body.appendChild(createToggleRow({
    label: 'Resource Swapper',
    desc: 'Replace game textures, sounds, and models with local files',
    checked: swapEnabled,
    restart: true,
    onChange: (v) => {
      ipcRenderer.invoke('get-config', 'swapper').then((conf: any) => {
        ipcRenderer.invoke('set-config', 'swapper', { enabled: v, path: conf ? conf.path : '' });
      });
    },
  }));

  const folderRow = document.createElement('div');
  folderRow.className = 'setting settName safety-0 has-button';
  folderRow.innerHTML =
    '<span class="setting-title">Swapper Folder</span>' +
    '<div class="setting-desc-new">Place replacement assets here (textures/, sound/, models/)</div>';
  const swapFolderBtn = document.createElement('div');
  swapFolderBtn.className = 'settingsBtn';
  swapFolderBtn.title = 'Open Folder';
  swapFolderBtn.innerHTML = '<span class="material-icons">folder</span> Swapper';
  swapFolderBtn.addEventListener('click', () => ipcRenderer.invoke('open-swap-folder'));
  folderRow.appendChild(swapFolderBtn);
  body.appendChild(folderRow);
}

function buildAppearanceSection(body: HTMLElement, uiConfRaw: any): void {
  const ui = { ...DEFAULT_CONFIG.ui, ...uiConfRaw };

  function saveUI(): void {
    ipcRenderer.invoke('set-config', 'ui', ui);
  }

  // ── CSS Theme selector (populated from swap/themes/) ──
  const themeRow = document.createElement('div');
  themeRow.className = 'setting settName safety-0 sel has-button';
  themeRow.innerHTML =
    '<span class="setting-title">CSS Theme</span>' +
    '<div class="setting-desc-new">Load a custom CSS theme from swap/themes/</div>';
  const themeSelect = document.createElement('select');
  themeSelect.className = 's-update inputGrey2';
  themeSelect.innerHTML = '<option value="disabled">Loading...</option>';
  themeRow.appendChild(themeSelect);
  const themeFolderBtn = document.createElement('div');
  themeFolderBtn.className = 'settingsBtn';
  themeFolderBtn.title = 'Open Themes Folder';
  themeFolderBtn.innerHTML = '<span class="material-icons">folder</span>';
  themeFolderBtn.addEventListener('click', () => ipcRenderer.invoke('open-themes-folder'));
  themeRow.appendChild(themeFolderBtn);
  body.appendChild(themeRow);

  ipcRenderer.invoke('list-themes').then((themes: Array<{ id: string; label: string }>) => {
    themeSelect.innerHTML = '';
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === ui.cssTheme) opt.selected = true;
      themeSelect.appendChild(opt);
    }
  });

  themeSelect.addEventListener('change', () => {
    ui.cssTheme = themeSelect.value;
    saveUI();
    onSettingChanged('refresh');
  });

  // ── Loading Screen Background ──
  const bgRow = document.createElement('div');
  bgRow.className = 'setting settName safety-0 sel has-button';
  bgRow.innerHTML =
    '<span class="setting-title">Loading Background</span>' +
    '<div class="setting-desc-new">Custom background image for the loading screen (swap/backgrounds/)</div>';
  const bgSelect = document.createElement('select');
  bgSelect.className = 's-update inputGrey2';
  bgSelect.innerHTML = '<option value="disabled">Loading...</option>';
  bgRow.appendChild(bgSelect);
  const bgFolderBtn = document.createElement('div');
  bgFolderBtn.className = 'settingsBtn';
  bgFolderBtn.title = 'Open Backgrounds Folder';
  bgFolderBtn.innerHTML = '<span class="material-icons">folder</span>';
  bgFolderBtn.addEventListener('click', () => ipcRenderer.invoke('open-backgrounds-folder'));
  bgRow.appendChild(bgFolderBtn);
  body.appendChild(bgRow);

  ipcRenderer.invoke('list-loading-themes').then((themes: Array<{ id: string; label: string }>) => {
    bgSelect.innerHTML = '';
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === ui.loadingTheme) opt.selected = true;
      bgSelect.appendChild(opt);
    }
  });

  bgSelect.addEventListener('change', () => {
    ui.loadingTheme = bgSelect.value;
    saveUI();
    onSettingChanged('refresh');
  });

  // ── Background URL (overrides loading theme selection) ──
  const urlRow = document.createElement('div');
  urlRow.className = 'setting settName safety-0';
  urlRow.innerHTML =
    refreshIcon('refresh-icon') +
    '<span class="setting-title">Background URL</span>' +
    '<div class="setting-desc-new">Direct image URL for loading screen (overrides dropdown above)</div>';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'inputGrey2';
  urlInput.placeholder = 'https://example.com/image.png';
  urlInput.value = ui.backgroundUrl || '';
  urlInput.style.width = '300px';
  urlInput.addEventListener('change', () => {
    ui.backgroundUrl = urlInput.value.trim();
    saveUI();
    onSettingChanged('refresh');
  });
  urlRow.appendChild(urlInput);
  body.appendChild(urlRow);
}

function buildMatchmakerSection(body: HTMLElement, mmConf: any, bag: SettingsBag): void {
  const mm = { ...DEFAULT_CONFIG.matchmaker, ...mmConf };

  function saveMM(): void {
    ipcRenderer.invoke('set-config', 'matchmaker', mm);
  }

  body.appendChild(createToggleRow({
    label: 'Custom Matchmaker',
    desc: 'Use the matchmaker hotkey to find a game matching your criteria',
    checked: mm.enabled, instant: true,
    onChange: (v) => { mm.enabled = v; saveMM(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Open Server Browser on Cancel',
    desc: 'Opens the server browser when no game is found and you cancel',
    checked: mm.openServerBrowser, instant: true,
    onChange: (v) => { mm.openServerBrowser = v; saveMM(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Prioritize Player Count',
    desc: 'Sort results by most players first, then by ping (default is ping first)',
    checked: mm.sortByPlayers ?? false, instant: true,
    onChange: (v) => { mm.sortByPlayers = v; saveMM(); },
  }));

  body.appendChild(createToggleRow({
    label: 'Hide Search Overlay',
    desc: 'Skip the lobby search animation and join the match instantly',
    checked: mm.hideSearchOverlay ?? false, instant: true,
    onChange: (v) => { mm.hideSearchOverlay = v; saveMM(); },
  }));

  body.appendChild(createKeybindRow('Matchmaker Hotkey', 'Key to trigger the custom matchmaker', bag.binds.matchmaker, (b) => {
    bag.binds.matchmaker = b;
    bag.saveBinds();
  }, undefined, true));
  body.appendChild(createKeybindRow('Matchmaker Cancel', 'Key to dismiss the matchmaker popup', bag.binds.matchmakerCancel, (b) => {
    bag.binds.matchmakerCancel = b;
    bag.saveBinds();
  }, undefined, true));

  body.appendChild(createNumberRow({
    label: 'Min Players', desc: 'Minimum player count in lobby (0-7)',
    min: 0, max: 7, value: mm.minPlayers, instant: true,
    onChange: (v) => { mm.minPlayers = v; saveMM(); },
  }));

  body.appendChild(createNumberRow({
    label: 'Max Players', desc: 'Maximum player count in lobby (0-7)',
    min: 0, max: 7, value: mm.maxPlayers, instant: true,
    onChange: (v) => { mm.maxPlayers = v; saveMM(); },
  }));

  body.appendChild(createNumberRow({
    label: 'Min Remaining Time', desc: 'Minimum seconds remaining in match (0-480)',
    min: 0, max: 480, value: mm.minRemainingTime, instant: true,
    onChange: (v) => { mm.minRemainingTime = v; saveMM(); },
  }));

  body.appendChild(createCheckboxGrid({
    header: 'Regions (none selected = all)',
    items: MATCHMAKER_REGIONS.map(r => ({ value: r, label: MATCHMAKER_REGION_NAMES[r] || r })),
    selected: mm.regions,
    onChange: () => saveMM(),
  }));

  body.appendChild(createCheckboxGrid({
    header: 'Gamemodes (none selected = all)',
    items: MATCHMAKER_GAMEMODE_FILTER.map(gm => ({ value: gm, label: gm })),
    selected: mm.gamemodes,
    onChange: () => saveMM(),
  }));

  body.appendChild(createCheckboxGrid({
    header: 'Maps (none selected = all)',
    items: MATCHMAKER_MAP_FILTER.map(m => ({ value: m, label: MATCHMAKER_MAP_NAMES[m] || m, icon: mapIconUrl(m) ?? undefined })),
    selected: mm.maps,
    onChange: () => saveMM(),
  }));

  // ── Ranked Match Sound (URL or local file path; empty = default) ──
  const soundRow = document.createElement('div');
  soundRow.className = 'setting settName safety-0 has-button';
  soundRow.innerHTML =
    '<span class="setting-title">Ranked Match Sound</span>' +
    '<div class="setting-desc-new">Custom sound played when a ranked match is found. Accepts a URL or a local file path; leave blank for default.</div>';
  const soundInput = document.createElement('input');
  soundInput.type = 'text';
  soundInput.className = 'inputGrey2';
  soundInput.placeholder = 'https://example.com/sound.mp3  or  C:\\path\\to\\file.mp3';
  soundInput.value = mm.rankedMatchSound || '';
  soundInput.style.width = '300px';
  soundInput.addEventListener('change', () => {
    mm.rankedMatchSound = soundInput.value.trim();
    saveMM();
  });
  soundRow.appendChild(soundInput);
  const soundBtnWrap = document.createElement('div');
  soundBtnWrap.style.cssText = 'grid-area: button; display: inline-flex; gap: 0.25rem; margin: 0 .5rem;';
  const soundBrowseBtn = document.createElement('div');
  soundBrowseBtn.className = 'settingsBtn';
  soundBrowseBtn.title = 'Browse for Audio File';
  soundBrowseBtn.style.margin = '0';
  soundBrowseBtn.innerHTML = '<span class="material-icons">folder_open</span>';
  soundBrowseBtn.addEventListener('click', async () => {
    const path: string = await ipcRenderer.invoke('pick-audio-file');
    if (path) {
      soundInput.value = path;
      mm.rankedMatchSound = path;
      saveMM();
    }
  });
  soundBtnWrap.appendChild(soundBrowseBtn);
  let previewAudio: HTMLAudioElement | null = null;
  const soundPlayBtn = document.createElement('div');
  soundPlayBtn.className = 'settingsBtn';
  soundPlayBtn.title = 'Preview Sound';
  soundPlayBtn.style.margin = '0';
  soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
  soundPlayBtn.addEventListener('click', async () => {
    if (previewAudio) { previewAudio.pause(); previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; return; }
    const url: string = await ipcRenderer.invoke('resolve-ranked-sound', soundInput.value.trim());
    previewAudio = new Audio(url);
    soundPlayBtn.innerHTML = '<span class="material-icons">stop</span>';
    previewAudio.onended = () => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; };
    previewAudio.onerror = () => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; };
    previewAudio.play().catch(() => { previewAudio = null; soundPlayBtn.innerHTML = '<span class="material-icons">play_arrow</span>'; });
  });
  soundBtnWrap.appendChild(soundPlayBtn);
  soundRow.appendChild(soundBtnWrap);
  body.appendChild(soundRow);
}

function buildDiscordSection(body: HTMLElement, discordConf: any): void {
  const discord = { ...DEFAULT_CONFIG.discord, ...discordConf };

  body.appendChild(createToggleRow({
    label: 'Discord Rich Presence',
    desc: 'Show game activity in your Discord profile',
    checked: discord.enabled,
    restart: true,
    onChange: (v) => {
      discord.enabled = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Map & Gamemode',
    desc: 'Display the current map and gamemode',
    checked: discord.showMapMode,
    refreshOnly: true,
    onChange: (v) => {
      discord.showMapMode = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Class',
    desc: 'Display your current class name',
    checked: discord.showClass,
    refreshOnly: true,
    onChange: (v) => {
      discord.showClass = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Elapsed Time',
    desc: 'Display how long you\'ve been in the current match',
    checked: discord.showTimer,
    refreshOnly: true,
    onChange: (v) => {
      discord.showTimer = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Menu/Spectating Status',
    desc: 'Display "In Menus" or "Spectating" when not in a match',
    checked: discord.showStatus,
    refreshOnly: true,
    onChange: (v) => {
      discord.showStatus = v;
      ipcRenderer.invoke('set-config', 'discord', discord);
    },
  }));
}

function buildChatSection(body: HTMLElement, gameConf: any, translatorConf: any): void {
  const game = { ...DEFAULT_CONFIG.game, ...gameConf };

  function saveGame(): void {
    ipcRenderer.invoke('set-config', 'game', game);
  }

  body.appendChild(createToggleRow({
    label: 'Better Chat',
    desc: 'Merge team and all-chat with colored [T]/[M] prefixes',
    checked: game.betterChat, instant: true,
    onChange: (v) => { game.betterChat = v; saveGame(); setBetterChat(v); },
  }));

  body.appendChild(createNumberRow({
    label: 'Chat History Size', desc: 'Maximum chat messages to keep (0 to disable history preservation)',
    min: 0, max: 1000, value: game.chatHistorySize, instant: true,
    onChange: (v) => { game.chatHistorySize = v; saveGame(); setChatHistorySize(v); },
  }));

  // Translator settings inline
  const tl = { ...DEFAULT_CONFIG.translator, ...translatorConf };

  function saveTL(): void {
    ipcRenderer.invoke('set-config', 'translator', tl);
  }

  body.appendChild(createToggleRow({
    label: 'Chat Translator',
    desc: 'Automatically translate non-English chat messages',
    checked: tl.enabled, instant: true,
    onChange: (v) => {
      tl.enabled = v;
      saveTL();
      updateTranslatorConfig({ enabled: v });
    },
  }));

  body.appendChild(createSelectRow({
    label: 'Target Language',
    desc: 'Language to translate messages into', instant: true,
    options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'ru', label: 'Russian' },
      { value: 'ja', label: 'Japanese' },
      { value: 'ko', label: 'Korean' },
      { value: 'zh', label: 'Chinese' },
      { value: 'ar', label: 'Arabic' },
      { value: 'hi', label: 'Hindi' },
      { value: 'tr', label: 'Turkish' },
      { value: 'pl', label: 'Polish' },
      { value: 'it', label: 'Italian' },
      { value: 'nl', label: 'Dutch' },
    ],
    value: tl.targetLanguage,
    onChange: (v) => {
      tl.targetLanguage = v;
      saveTL();
      updateTranslatorConfig({ targetLanguage: v });
    },
  }));

  body.appendChild(createToggleRow({
    label: 'Show Language Tag',
    desc: 'Show detected language code before translations (e.g. [FR])',
    checked: tl.showLanguageTag, instant: true,
    onChange: (v) => {
      tl.showLanguageTag = v;
      saveTL();
      updateTranslatorConfig({ showLanguageTag: v });
    },
  }));

  // Custom skip words — messages made entirely of these (plus built-in skip terms) won't be translated.
  const skipRow = document.createElement('div');
  skipRow.className = 'setting settName safety-0';
  skipRow.innerHTML =
    '<span class="setting-title">Custom Skip Words</span>' +
    '<div class="setting-desc-new">Comma-separated words to ignore (e.g. your nickname, friends\' names). Applies instantly.</div>';
  const skipInput = document.createElement('input');
  skipInput.type = 'text';
  skipInput.className = 'inputGrey2';
  skipInput.placeholder = 'jakk, bigj, etc.';
  skipInput.value = tl.customSkipWords || '';
  skipInput.style.width = '300px';
  skipInput.addEventListener('change', () => {
    tl.customSkipWords = skipInput.value;
    saveTL();
    updateTranslatorConfig({ customSkipWords: skipInput.value });
  });
  skipRow.appendChild(skipInput);
  body.appendChild(skipRow);
}

function buildAdvancedSection(
  body: HTMLElement, advConf: any, isWindows: boolean,
): void {
  const adv = { ...DEFAULT_CONFIG.advanced, ...advConf };

  function saveAdv(): void {
    ipcRenderer.invoke('set-config', 'advanced', adv);
  }

  const angleOptions: Array<{ value: string; label: string }> = isWindows
    ? [
        { value: 'default', label: 'Default (D3D11)' },
        { value: 'gl',      label: 'OpenGL' },
        { value: 'd3d11',   label: 'Direct3D 11' },
        { value: 'd3d11on12', label: 'D3D11on12' },
      ]
    : [
        { value: 'default', label: 'Default' },
        { value: 'gl',     label: 'OpenGL' },
        { value: 'vulkan', label: 'Vulkan' },
      ];

  body.appendChild(createSelectRow({
    label: 'ANGLE Backend',
    desc: 'Graphics API used for WebGL rendering',
    options: angleOptions,
    value: adv.angleBackend, restart: true,
    onChange: (v) => { adv.angleBackend = v; saveAdv(); },
  }));

  const advToggles: Array<{ key: string; label: string; desc: string; safety: number }> = [
    { key: 'removeUselessFeatures', label: 'Remove Useless Features', desc: 'Disables crash reporting, metrics, print preview, and other unused Chromium features', safety: 1 },
    { key: 'gpuRasterizing', label: 'GPU Rasterization', desc: 'Force GPU rasterization and out-of-process rasterization', safety: 2 },
    { key: 'helpfulFlags', label: 'Useful Flags', desc: 'Enables WebGL, JS harmony, V8 features, background throttle prevention, and autoplay bypass', safety: 3 },
    { key: 'increaseLimits', label: 'Increase Limits', desc: 'Raises renderer process, WebGL context, and WebRTC CPU limits; ignores GPU blocklist', safety: 4 },
    { key: 'lowLatency', label: 'Low Latency Flags', desc: 'Enables high-resolution timer, QUIC protocol, and high-performance GPU', safety: 4 },
    { key: 'experimentalFlags', label: 'Experimental Flags', desc: 'Enables accelerated video decode, native GPU memory buffers, high DPI support, and disables pings/proxy', safety: 4 },
  ];

  for (const t of advToggles) {
    body.appendChild(createToggleRow({
      label: t.label, desc: t.desc,
      checked: !!adv[t.key], restart: true,
      safety: t.safety,
      onChange: (v) => { adv[t.key] = v; saveAdv(); },
    }));
  }

  body.appendChild(createToggleRow({
    label: 'Verbose Logging',
    desc: 'Forward all preload console output to the Electron log file',
    checked: adv.verboseLogging, instant: true,
    onChange: (v) => {
      adv.verboseLogging = v; saveAdv();
      setVerbose(v);
    },
  }));
}

// ── Search filter + "no settings" cleanup ──
function applySearchFilter(container: HTMLElement, holder: HTMLElement, searchQuery: string): void {
  const query = searchQuery.toLowerCase();
  const sections = Array.from(container.children).filter(el => el.querySelector('.setHed'));
  sections.forEach(sectionEl => {
    const sectionTitle = sectionEl.querySelector('.setHed')?.textContent?.toLowerCase() || '';
    const body = sectionEl.querySelector('.setBodH');
    if (!body) { (sectionEl as HTMLElement).style.display = 'none'; return; }

    if (sectionTitle.includes(query)) {
      body.classList.remove('setting-category-collapsed');
      return;
    }

    let visibleCount = 0;
    Array.from(body.children).forEach(child => {
      const el = child as HTMLElement;
      const text = el.textContent?.toLowerCase() || '';
      if (text.includes(query)) {
        el.style.display = '';
        visibleCount++;
      } else {
        el.style.display = 'none';
      }
    });
    if (visibleCount === 0) {
      (sectionEl as HTMLElement).style.display = 'none';
    } else {
      body.classList.remove('setting-category-collapsed');
    }
  });

  const hasVisible = sections.find(el => (el as HTMLElement).style.display !== 'none');
  if (hasVisible) {
    Array.from(holder.children).forEach(child => {
      if ((child as HTMLElement).textContent?.toLowerCase().includes('no settings')) {
        (child as HTMLElement).remove();
      }
    });
  }
}

function renderSettings(searchQuery?: string): void {
  const holder = document.getElementById('settHolder');
  if (!holder) return;

  resetRefreshNotification();

  if (searchQuery) {
    const existing = holder.querySelector('.kcc-settings');
    if (existing) existing.remove();
  } else {
    while (holder.firstChild) holder.removeChild(holder.firstChild);
  }

  const container = document.createElement('div');
  container.className = 'kcc-settings';

  // ── Action button grid ──
  const actionGrid = document.createElement('div');
  actionGrid.className = 'kcc-action-grid';

  const actionButtons: Array<{ label: string; color: string; full?: boolean; action: () => void }> = [
    { label: 'Open Resource Swapper', color: 'kcc-ab-pink', action: () => ipcRenderer.invoke('open-swap-folder') },
    { label: 'Reset Resource Swapper', color: 'kcc-ab-pink', action: () => {
      if (confirm('Reset resource swapper? This will delete all files in the swapper folder.')) {
        ipcRenderer.invoke('reset-swapper');
      }
    }},
    { label: 'Open Electron Logs', color: 'kcc-ab-red', action: () => ipcRenderer.invoke('open-electron-log') },
    { label: 'Restart Client', color: 'kcc-ab-orange', full: true, action: () => ipcRenderer.invoke('restart-client') },
    { label: 'Reset Options', color: 'kcc-ab-red', action: () => {
      if (confirm('Reset all settings to defaults? The client will restart.')) {
        ipcRenderer.invoke('reset-options');
      }
    }},
    { label: 'Delete All Data', color: 'kcc-ab-red', action: () => {
      if (confirm('Delete all data (config, logs)? Scripts are preserved. The client will restart.')) {
        ipcRenderer.invoke('delete-all-data');
      }
    }},
  ];

  for (const ab of actionButtons) {
    const btn = document.createElement('button');
    btn.className = 'kcc-action-btn ' + ab.color + (ab.full ? ' full' : '');
    btn.textContent = ab.label;
    btn.addEventListener('click', ab.action);
    actionGrid.appendChild(btn);
  }
  container.appendChild(actionGrid);

  // Load all configs in a single IPC call + platform info.
  // Section shells are created inside the .then() so the persisted collapsed
  // state is loaded before createSection consults it.
  Promise.all([
    ipcRenderer.invoke('get-all-config', ['swapper', 'matchmaker', 'keybinds', 'advanced', 'game', 'ui', 'discord', 'translator', 'performance', 'collapsedSections']),
    ipcRenderer.invoke('get-platform'),
  ]).then(([allConf, platformInfo]: [any, any]) => {
    setCollapsedState((allConf.collapsedSections as Record<string, boolean>) || {});

    // ── Create section shells (after collapsed state is loaded) ──
    const genSec = createSection('General');
    container.appendChild(genSec.section);
    const gameSec = createSection('Game');
    container.appendChild(gameSec.section);
    const perfSec = createSection('Performance');
    container.appendChild(perfSec.section);
    const swapSec = createSection('Swapper');
    container.appendChild(swapSec.section);
    const appearSec = createSection('Appearance');
    container.appendChild(appearSec.section);
    const mmSec = createSection('Matchmaker');
    container.appendChild(mmSec.section);
    const chatSec = createSection('Chat');
    container.appendChild(chatSec.section);
    const discordSec = createSection('Discord');
    container.appendChild(discordSec.section);
    const accSec = createSection('Accounts', true);
    container.appendChild(accSec.section);
    const ksSec = createSection('Keystrokes', true);
    container.appendChild(ksSec.section);
    const advSec = createSection('Advanced');
    container.appendChild(advSec.section);
    const usSec = createSection('Userscripts');
    container.appendChild(usSec.section);

    const swapperConf = allConf.swapper;
    const mmConf = allConf.matchmaker;
    const keybindsConf = allConf.keybinds;
    const advConf = allConf.advanced;
    const gameConf = allConf.game;
    const uiConfRaw = allConf.ui;
    const discordConf = allConf.discord;
    const translatorConf = allConf.translator;
    const binds = { ...DEFAULT_CONFIG.keybinds, ...keybindsConf };
    const isWindows = platformInfo && platformInfo.isWindows;

    const bag: SettingsBag = {
      binds,
      saveBinds: () => ipcRenderer.invoke('set-config', 'keybinds', binds),
      isWindows,
    };

    // Populate each section
    buildGeneralSection(genSec.body, gameConf, uiConfRaw, bag);
    buildGameSection(gameSec.body, gameConf, uiConfRaw, bag);
    buildPerformanceSection(perfSec.body, allConf.performance, isWindows);
    buildSwapperSection(swapSec.body, swapperConf);
    buildAppearanceSection(appearSec.body, uiConfRaw);
    buildMatchmakerSection(mmSec.body, mmConf, bag);
    buildChatSection(chatSec.body, gameConf, translatorConf);
    buildDiscordSection(discordSec.body, discordConf);
    buildAccountsSection(accSec.body);
    buildKeystrokesRows(ksSec.body);
    buildAdvancedSection(advSec.body, advConf, isWindows);
    renderUserscriptsSection(usSec.body);

    if (searchQuery) applySearchFilter(container, holder, searchQuery);

    holder.appendChild(container);
  }).catch((err: any) => {
    console.error('[KCC] Settings render error:', err);
  });
}

// ── Userscripts settings section ──
function renderUserscriptsSection(body: HTMLElement): void {
  ipcRenderer.invoke('get-config', 'userscripts').then((usConf: any) => {
    const us = { ...DEFAULT_CONFIG.userscripts, ...usConf };

    body.appendChild(createToggleRow({
      label: 'Userscripts',
      desc: 'Load custom scripts from the scripts folder',
      checked: us.enabled, restart: true,
      onChange: (v) => { us.enabled = v; ipcRenderer.invoke('set-config', 'userscripts', us); },
    }));

    const usFolderRow = document.createElement('div');
    usFolderRow.className = 'setting settName safety-0 has-button';
    usFolderRow.innerHTML =
      '<span class="setting-title">Scripts Folder</span>' +
      '<div class="setting-desc-new">Place .js userscript files here</div>';
    const usFolderBtn = document.createElement('div');
    usFolderBtn.className = 'settingsBtn';
    usFolderBtn.title = 'Open Folder';
    usFolderBtn.innerHTML = '<span class="material-icons">folder</span> Scripts';
    usFolderBtn.addEventListener('click', () => ipcRenderer.invoke('userscripts-open-folder'));
    usFolderRow.appendChild(usFolderBtn);
    body.appendChild(usFolderRow);

    const scriptInstances = getInstances();
    if (scriptInstances.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'setting settName safety-0';
      emptyRow.innerHTML =
        '<div class="setting-desc-new">No userscripts found. Place .js files in the scripts folder and reload.</div>';
      body.appendChild(emptyRow);
      return;
    }

    for (const inst of scriptInstances) {
      const scriptRow = document.createElement('div');
      scriptRow.className = 'setting settName safety-0 bool';

      const displayName = escapeHtml(inst.meta.name || inst.filename);
      const metaParts: string[] = [];
      if (inst.meta.author) metaParts.push('by ' + escapeHtml(inst.meta.author));
      if (inst.meta.version) metaParts.push('v' + escapeHtml(inst.meta.version));
      const metaLine = metaParts.length > 0 ? '<span class="kcc-us-meta">' + metaParts.join(' &middot; ') + '</span>' : '';
      const descText = escapeHtml(inst.meta.desc || '');

      scriptRow.innerHTML =
        '<span class="setting-title">' + displayName + '</span>' +
        '<label class="switch">' +
          '<input type="checkbox" class="s-update"' + (inst.enabled ? ' checked' : '') + '>' +
          '<div class="slider round"></div>' +
        '</label>' +
        '<div class="setting-desc-new">' + descText + (metaLine ? '<br>' + metaLine : '') + '</div>';
      body.appendChild(scriptRow);

      const cb = scriptRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const settingsContainer = document.createElement('div');
      settingsContainer.className = 'kcc-us-settings';
      body.appendChild(settingsContainer);

      if (inst.enabled && inst.settings) {
        renderScriptSettings(inst, settingsContainer);
      }

      cb.addEventListener('change', () => {
        const { needsReload } = setScriptEnabled(inst.filename, cb.checked, _console);
        settingsContainer.innerHTML = '';
        if (cb.checked && inst.settings) {
          renderScriptSettings(inst, settingsContainer);
        }
        if (needsReload) {
          onSettingChanged('refresh');
        }
      });
    }
  });
}

function renderScriptSettings(inst: UserscriptInstance, container: HTMLElement): void {
  if (!inst.settings) return;

  for (const [, setting] of Object.entries(inst.settings)) {
    const typeClass = setting.type === 'bool' ? 'bool' : setting.type === 'sel' ? 'sel' : setting.type === 'num' ? 'num' : setting.type === 'keybind' ? 'keybind' : '';
    const row = document.createElement('div');
    row.className = 'setting settName safety-0' + (typeClass ? ' ' + typeClass : '');
    row.innerHTML =
      '<span class="setting-title">' + escapeHtml(setting.title) + '</span>' +
      (setting.desc ? '<div class="setting-desc-new">' + escapeHtml(setting.desc) + '</div>' : '');

    switch (setting.type) {
      case 'bool': {
        const label = document.createElement('label');
        label.className = 'switch';
        label.innerHTML =
          '<input type="checkbox" class="s-update"' + (setting.value ? ' checked' : '') + '>' +
          '<div class="slider round"></div>';
        row.appendChild(label);
        const input = label.querySelector('input') as HTMLInputElement;
        input.addEventListener('change', () => {
          setting.value = input.checked;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'num': {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'rb-input s-update sliderVal';
        input.value = String(setting.value);
        if (setting.min !== undefined) input.min = String(setting.min);
        if (setting.max !== undefined) input.max = String(setting.max);
        if (setting.step !== undefined) input.step = String(setting.step);
        row.appendChild(input);
        input.addEventListener('change', () => {
          setting.value = parseFloat(input.value) || 0;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'sel': {
        const select = document.createElement('select');
        select.className = 's-update inputGrey2';
        if (setting.opts) {
          for (const opt of setting.opts) {
            const option = document.createElement('option');
            option.value = String(opt);
            option.textContent = String(opt);
            if (String(opt) === String(setting.value)) option.selected = true;
            select.appendChild(option);
          }
        }
        row.appendChild(select);
        select.addEventListener('change', () => {
          setting.value = select.value;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'color': {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'kcc-color-input';
        input.value = String(setting.value) || '#ffffff';
        row.appendChild(input);
        input.addEventListener('input', () => {
          setting.value = input.value;
          if (typeof setting.changed === 'function') setting.changed(setting.value);
          saveScriptSetting(inst);
        });
        break;
      }
      case 'keybind': {
        const bind = setting.value as Keybind;
        const keyEl = document.createElement('span');
        keyEl.className = 'keyIcon kcc-keyIcon';
        keyEl.textContent = keybindDisplayString(bind);
        keyEl.addEventListener('click', () => {
          openKeybindDialog(setting.title).then((newBind) => {
            setting.value = newBind;
            keyEl.textContent = keybindDisplayString(newBind);
            if (typeof setting.changed === 'function') setting.changed(setting.value);
            saveScriptSetting(inst);
          });
        });
        row.appendChild(keyEl);
        break;
      }
    }

    container.appendChild(row);
  }
}

function saveScriptSetting(inst: UserscriptInstance): void {
  if (!inst.settings) return;
  const prefs: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(inst.settings)) {
    prefs[k] = s.value;
  }
  ipcRenderer.invoke('userscripts-save-prefs', inst.filename, prefs);
}

// ── Matchmaker IPC listener ──
ipcRenderer.on('matchmaker-find', (_e, mmConfig: MatchmakerConfig) => {
  fetchGame(mmConfig, _console).catch((err) => _console.error('[KCC] Matchmaker error:', err));
});


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

  }).catch(() => {});

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
